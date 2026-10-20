// 用 macOS 自带的"抠主体"（Vision 前景实例分割，和"照片"App 长按抠图同一个能力）把鸟抠出来。
// 画面里常常同时有手、人、笼子，所以对每个分割出来的实例再做一次图像分类，挑"最像鸟"的那个。
//
// 用法:
//   birdcut serve                       常驻模式，从 stdin 读命令，每条回一行 JSON（给 tools/birdseg.py 用）：
//       locate <图片>                    → {"box":[x,y,w,h],"score":0.9}   多尺度滑窗找最像鸟的区域
//       score <图片> [x y w h]           → {"score":0.9,"label":"parrot"}  整张图或某块区域像不像鸟
//   birdcut image <图片> <输出.png>
//   birdcut video <视频> <输出目录> [fps=12] [开始秒=0] [结束秒=末尾] [full]
//       最后加 full：每帧直接整帧抠主体（纯色背景的视频，比如 AI 生成的，用这个最稳）
// 每张图在 stdout 打一行 JSON：{"file":..., "ok":true, "bird":0.93, "label":"parrot", "bbox":[x,y,w,h], "edge":false}
// 输出 PNG 是原图大小、背景透明（裁剪和对齐交给 cutout.py）。
//
// 本机命令行工具的 SDK 比系统旧，没有这个类的头文件，所以用 Objective-C 运行时动态调用（需要 macOS 14+）。

import AppKit
import AVFoundation
import CoreImage
import Foundation
import Vision

let BIRD_WORDS = ["bird", "parrot", "parakeet", "budgerigar", "lovebird", "cockatiel", "macaw", "cockatoo", "finch", "songbird"]

func fail(_ msg: String) -> Never {
    FileHandle.standardError.write((msg + "\n").data(using: .utf8)!)
    exit(1)
}

func jsonLine(_ dict: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: dict, options: [.sortedKeys]),
       let s = String(data: data, encoding: .utf8) { print(s); fflush(stdout) }
}

guard let maskReqClass = NSClassFromString("VNGenerateForegroundInstanceMaskRequest") as? NSObject.Type else {
    fail("这台 Mac 不支持系统抠图（需要 macOS 14 或更新）")
}

typealias GenMaskFn = @convention(c) (AnyObject, Selector, NSIndexSet, VNImageRequestHandler, UnsafeMutablePointer<NSError?>?) -> Unmanaged<CVPixelBuffer>?
let genSel = NSSelectorFromString("generateScaledMaskForImageForInstances:fromRequestHandler:error:")

let ciContext = CIContext(options: nil)
// 分类结果里排前面的几个标签（用来识别"笼子""人"之类的干扰）
var lastTop: [[String: Any]] = []

// 对一个 CGImage 里的某块区域分类，返回最像鸟的分数和标签
func birdScore(_ image: CGImage, rect: CGRect) -> (Double, String) {
    guard let crop = image.cropping(to: rect.integral) else { return (0, "") }
    let req = VNClassifyImageRequest()
    let h = VNImageRequestHandler(cgImage: crop, options: [:])
    try? h.perform([req])
    var best = 0.0
    var label = ""
    var top = ""
    lastTop = []
    for obs in (req.results as? [VNClassificationObservation]) ?? [] {
        if top.isEmpty { top = obs.identifier }
        if lastTop.count < 6 && obs.confidence > 0.05 {
            lastTop.append(["label": obs.identifier, "p": (Double(obs.confidence) * 1000).rounded() / 1000])
        }
        let id = obs.identifier.lowercased()
        if BIRD_WORDS.contains(where: { id.contains($0) }) && Double(obs.confidence) > best {
            best = Double(obs.confidence)
            label = obs.identifier
        }
    }
    return (best, label.isEmpty ? top : label)
}

// 多尺度滑窗：每个窗口做一次分类，取鸟分数最高的窗口
func locateBird(_ image: CGImage) -> (CGRect, Double) {
    let W = CGFloat(image.width), H = CGFloat(image.height)
    let full = CGRect(x: 0, y: 0, width: W, height: H)
    var best = (full, birdScore(image, rect: full).0)
    let m = min(W, H)
    for frac in [0.75, 0.5, 0.33] as [CGFloat] {
        let side = m * frac
        let stride = side * 0.5
        var y: CGFloat = 0
        while y + side <= H + 1 {
            var x: CGFloat = 0
            while x + side <= W + 1 {
                let r = CGRect(x: x, y: y, width: side, height: side)
                let sc = birdScore(image, rect: r).0
                // 小窗口略降权，避免只框到鸟头
                let adj = sc * Double(0.85 + 0.15 * frac)
                if adj > best.1 { best = (r, adj) }
                x += stride
            }
            y += stride
        }
    }
    return best
}

// 把矩形各边往外扩 pad 倍（相对自身大小），并限制在图内
func expand(_ r: CGRect, _ pad: CGFloat, in W: Int, _ H: Int) -> CGRect {
    let dx = r.width * pad, dy = r.height * pad
    return r.insetBy(dx: -dx, dy: -dy).intersection(CGRect(x: 0, y: 0, width: W, height: H)).integral
}

struct Cut {
    var png: Data?
    var info: [String: Any]
}

func cutBird(_ full: CGImage, roi: CGRect) -> Cut {
    guard let image = full.cropping(to: roi) else { return Cut(png: nil, info: ["ok": false, "error": "裁剪失败"]) }
    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    guard let req = maskReqClass.init() as? VNRequest else { fail("创建抠图请求失败") }
    do { try handler.perform([req]) } catch { return Cut(png: nil, info: ["ok": false, "error": "\(error)"]) }
    guard let obs = req.results?.first as? NSObject,
          let all = obs.value(forKey: "allInstances") as? NSIndexSet, all.count > 0 else {
        return Cut(png: nil, info: ["ok": false, "error": "没有找到主体"])
    }
    let fn = unsafeBitCast(obs.method(for: genSel), to: GenMaskFn.self)
    let W = image.width, H = image.height

    var best: (score: Double, label: String, mask: CVPixelBuffer, bbox: CGRect)? = nil
    for idx in all {
        var err: NSError?
        guard let pb = fn(obs, genSel, NSIndexSet(index: idx), handler, &err)?.takeUnretainedValue() else { continue }
        // 算这个实例的外框
        CVPixelBufferLockBaseAddress(pb, .readOnly)
        let mw = CVPixelBufferGetWidth(pb), mh = CVPixelBufferGetHeight(pb)
        let rowBytes = CVPixelBufferGetBytesPerRow(pb)
        let base = CVPixelBufferGetBaseAddress(pb)!
        var minX = mw, minY = mh, maxX = -1, maxY = -1
        var y = 0
        while y < mh {
            let row = base.advanced(by: y * rowBytes).assumingMemoryBound(to: Float32.self)
            var x = 0
            while x < mw {
                if row[x] > 0.5 {
                    if x < minX { minX = x }; if x > maxX { maxX = x }
                    if y < minY { minY = y }; if y > maxY { maxY = y }
                }
                x += 2
            }
            y += 2
        }
        CVPixelBufferUnlockBaseAddress(pb, .readOnly)
        if maxX < 0 { continue }
        let sx: Double = Double(W) / Double(mw)
        let sy: Double = Double(H) / Double(mh)
        let bx: Double = Double(minX) * sx
        let by: Double = Double(minY) * sy
        let bw: Double = Double(maxX - minX + 1) * sx
        let bh: Double = Double(maxY - minY + 1) * sy
        let bbox = CGRect(x: bx, y: by, width: bw, height: bh)
        let (score, label) = birdScore(image, rect: bbox)
        if best == nil || score > best!.score { best = (score, label, pb, bbox) }
    }
    guard let b = best else { return Cut(png: nil, info: ["ok": false, "error": "没有可用的实例"]) }

    // 用选中实例的蒙版生成透明 PNG
    let src = CIImage(cgImage: image)
    var maskImg = CIImage(cvPixelBuffer: b.mask)
    maskImg = maskImg.transformed(by: CGAffineTransform(scaleX: CGFloat(W) / maskImg.extent.width,
                                                         y: CGFloat(H) / maskImg.extent.height))
    let clear = CIImage(color: CIColor.clear).cropped(to: src.extent)
    let out = src.applyingFilter("CIBlendWithMask", parameters: [
        kCIInputBackgroundImageKey: clear, kCIInputMaskImageKey: maskImg,
    ])
    guard let cg = ciContext.createCGImage(out, from: src.extent),
          let png = NSBitmapImageRep(cgImage: cg).representation(using: .png, properties: [:]) else {
        return Cut(png: nil, info: ["ok": false, "error": "导出失败"])
    }
    let m: CGFloat = 3
    let wf: CGFloat = CGFloat(W)
    let hf: CGFloat = CGFloat(H)
    let r: CGRect = b.bbox
    // clipped：鸟碰到了裁剪框边（而且那条边不是原图的边）→ 框小了
    var clipped = (r.minX < m && roi.minX > 0) || (r.minY < m && roi.minY > 0)
    clipped = clipped || (r.maxX > wf - m && roi.maxX < CGFloat(full.width)) || (r.maxY > hf - m && roi.maxY < CGFloat(full.height))
    // edge：鸟碰到了原图边缘（被画面切掉了一部分）
    var edge = (r.minX < m && roi.minX <= 0) || (r.minY < m && roi.minY <= 0)
    edge = edge || (r.maxX > wf - m && roi.maxX >= CGFloat(full.width)) || (r.maxY > hf - m && roi.maxY >= CGFloat(full.height))
    let score: Double = (b.score * 1000).rounded() / 1000
    let box: [Int] = [Int(roi.minX + r.minX), Int(roi.minY + r.minY), Int(r.width), Int(r.height)]
    var info: [String: Any] = ["ok": true, "bird": score, "label": b.label]
    info["bbox"] = box
    info["roi"] = [Int(roi.minX), Int(roi.minY), Int(roi.width), Int(roi.height)]
    info["size"] = [full.width, full.height]
    info["edge"] = edge
    info["clipped"] = clipped
    info["instances"] = all.count
    return Cut(png: png, info: info)
}

// 从候选框出发：鸟碰到框的哪条边，就只往那边扩，顺着鸟长出去（四面一起扩会把人、背景都带进来）
func cutWithRetry(_ image: CGImage, roi start: CGRect, maxSteps: Int = 5) -> Cut {
    let W = CGFloat(image.width), H = CGFloat(image.height)
    var roi = start.intersection(CGRect(x: 0, y: 0, width: W, height: H)).integral
    var best: Cut? = nil
    var bestScore = -1.0
    for step in 0...maxSteps {
        let c = cutBird(image, roi: roi)
        guard (c.info["ok"] as? Bool) == true, let bb = bboxOf(c) else {
            // 框里没有主体（比如整个框都是鸟身）：四面扩一点再试
            roi = expand(roi, 0.25, in: image.width, image.height)
            continue
        }
        var sc = (c.info["bird"] as? Double) ?? 0
        let clipped = (c.info["clipped"] as? Bool) == true
        if clipped { sc *= 0.3 }
        if ProcessInfo.processInfo.environment["BIRDCUT_DEBUG"] != nil {
            FileHandle.standardError.write("step \(step) roi \(roi) bird \(c.info["bird"] ?? 0) clipped \(clipped) -> \(sc)\n".data(using: .utf8)!)
        }
        if sc > bestScore { bestScore = sc; best = c }
        if !clipped { break }
        // 哪边贴边就往哪边扩
        let m: CGFloat = 4
        let growX = roi.width * 0.4, growY = roi.height * 0.4
        var r = roi
        if bb.minX - roi.minX < m && roi.minX > 0 { r.origin.x -= growX; r.size.width += growX }
        if roi.maxX - bb.maxX < m && roi.maxX < W { r.size.width += growX }
        if bb.minY - roi.minY < m && roi.minY > 0 { r.origin.y -= growY; r.size.height += growY }
        if roi.maxY - bb.maxY < m && roi.maxY < H { r.size.height += growY }
        roi = r.intersection(CGRect(x: 0, y: 0, width: W, height: H)).integral
    }
    return best ?? Cut(png: nil, info: ["ok": false, "error": "没有找到鸟"])
}

func bboxOf(_ c: Cut) -> CGRect? {
    guard let b = c.info["bbox"] as? [Int], b.count == 4 else { return nil }
    return CGRect(x: b[0], y: b[1], width: b[2], height: b[3])
}

let args = CommandLine.arguments
guard args.count >= 4 || (args.count >= 2 && args[1] == "serve") else {
    fail("用法: birdcut image <图片> <输出.png> | birdcut video <视频> <输出目录> [fps] [开始秒] [结束秒]")
}

func loadCG(_ path: String) -> CGImage? {
    guard let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil) else { return nil }
    return CGImageSourceCreateImageAtIndex(src, 0, nil)
}

if args.count >= 2 && args[1] == "serve" {
    while let line = readLine() {
        let parts = line.split(separator: " ").map(String.init)
        guard parts.count >= 2 else { jsonLine(["error": "bad command"]); continue }
        // 路径里可能有空格：数字参数在末尾
        let nums = parts.count >= 6 ? parts.suffix(4).compactMap { Double($0) } : []
        let path = (nums.count == 4 ? parts[1..<(parts.count - 4)] : parts[1...]).joined(separator: " ")
        guard let cg = loadCG(path) else { jsonLine(["error": "cannot read \(path)"]); continue }
        if parts[0] == "locate" {
            let (r, sc) = locateBird(cg)
            jsonLine(["box": [Int(r.minX), Int(r.minY), Int(r.width), Int(r.height)], "score": sc])
        } else if parts[0] == "score" {
            let r = nums.count == 4 ? CGRect(x: nums[0], y: nums[1], width: nums[2], height: nums[3])
                                    : CGRect(x: 0, y: 0, width: cg.width, height: cg.height)
            let (sc, label) = birdScore(cg, rect: r)
            jsonLine(["score": sc, "label": label, "top": lastTop])
        } else {
            jsonLine(["error": "unknown command"])
        }
    }
    exit(0)
}

if args[1] == "image" {
    guard let ns = NSImage(contentsOfFile: args[2]),
          let cg = ns.cgImage(forProposedRect: nil, context: nil, hints: nil) else { fail("读不了图片 \(args[2])") }
    let (loc, locScore) = locateBird(cg)
    var c = cutWithRetry(cg, roi: loc)
    if let png = c.png { try? png.write(to: URL(fileURLWithPath: args[3])) }
    c.info["file"] = args[3]
    c.info["locate"] = (locScore * 1000).rounded() / 1000
    c.info["locRect"] = [Int(loc.minX), Int(loc.minY), Int(loc.width), Int(loc.height)]
    jsonLine(c.info)
} else if args[1] == "video" {
    let asset = AVURLAsset(url: URL(fileURLWithPath: args[2]))
    let outDir = args[3]
    let fps = args.count > 4 ? Double(args[4]) ?? 12 : 12
    let duration = CMTimeGetSeconds(asset.duration)
    let start = args.count > 5 ? Double(args[5]) ?? 0 : 0
    let end = min(args.count > 6 ? Double(args[6]) ?? duration : duration, duration)
    try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)
    let gen = AVAssetImageGenerator(asset: asset)
    gen.appliesPreferredTrackTransform = true
    gen.maximumSize = CGSize(width: 1080, height: 1080)
    gen.requestedTimeToleranceBefore = .zero
    gen.requestedTimeToleranceAfter = .zero
    var i = 0
    var t = start
    let fullFrame = args.count > 7 && args[7] == "full"
    var track: CGRect? = nil      // 上一帧鸟的位置
    var lastLocate = -99.0
    while t < end {
        if let cg = try? gen.copyCGImage(at: CMTime(seconds: t, preferredTimescale: 600), actualTime: nil) {
            let file = String(format: "%@/%05d.png", outDir, i)
            // 跟着上一帧的位置抠；每 2 秒或者跟丢了就重新定位
            var c: Cut
            if fullFrame {
                c = cutBird(cg, roi: CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
            } else if let tr = track, t - lastLocate < 2 {
                c = cutWithRetry(cg, roi: expand(tr, 0.15, in: cg.width, cg.height), maxSteps: 3)
            } else {
                c = Cut(png: nil, info: ["ok": false])
            }
            if !fullFrame && ((c.info["ok"] as? Bool) != true || ((c.info["bird"] as? Double) ?? 0) < 0.2) {
                let (loc, _) = locateBird(cg)
                lastLocate = t
                c = cutWithRetry(cg, roi: loc)
            }
            track = ((c.info["bird"] as? Double) ?? 0) >= 0.2 ? bboxOf(c) : nil
            if let png = c.png { try? png.write(to: URL(fileURLWithPath: file)) }
            c.info["file"] = file
            c.info["t"] = (t * 1000).rounded() / 1000
            jsonLine(c.info)
            i += 1
        }
        t += 1.0 / fps
    }
} else {
    fail("第一个参数要是 image 或 video")
}
