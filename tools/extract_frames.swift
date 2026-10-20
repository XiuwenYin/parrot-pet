// 从视频里按固定帧率抽帧（用系统自带的 AVFoundation，不需要 ffmpeg）
// 用法: extract_frames <视频> <输出目录> [fps=12] [开始秒=0] [结束秒=视频末尾]
import AVFoundation
import AppKit

let args = CommandLine.arguments
guard args.count >= 3 else {
    print("用法: extract_frames <视频> <输出目录> [fps=12] [开始秒=0] [结束秒]")
    exit(1)
}
let asset = AVURLAsset(url: URL(fileURLWithPath: args[1]))
let outDir = args[2]
let fps = args.count > 3 ? Double(args[3]) ?? 12 : 12
let duration = CMTimeGetSeconds(asset.duration)
let start = args.count > 4 ? Double(args[4]) ?? 0 : 0
let end = min(args.count > 5 ? Double(args[5]) ?? duration : duration, duration)

try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)
let gen = AVAssetImageGenerator(asset: asset)
gen.appliesPreferredTrackTransform = true
gen.maximumSize = CGSize(width: 1080, height: 1080)
gen.requestedTimeToleranceBefore = .zero
gen.requestedTimeToleranceAfter = .zero

var i = 0
var t = start
while t < end {
    let time = CMTime(seconds: t, preferredTimescale: 600)
    if let cg = try? gen.copyCGImage(at: time, actualTime: nil),
       let png = NSBitmapImageRep(cgImage: cg).representation(using: .png, properties: [:]) {
        try? png.write(to: URL(fileURLWithPath: String(format: "%@/%04d.png", outDir, i)))
        i += 1
    }
    t += 1.0 / fps
}
print("抽了 \(i) 帧 → \(outDir)")
