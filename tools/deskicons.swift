// 用"辅助功能"接口读桌面图标的准确位置（桌面开着"自动排列"时，Finder 脚本给的坐标是旧的，不能用）。
// 只读位置和名字，不碰文件。需要在"系统设置 → 隐私与安全性 → 辅助功能"里允许桌宠。
// 用法: deskicons [prompt]   加 prompt：没权限时弹出系统授权提示
// 输出 JSON：{"icons":[{"name":"a.pdf","x":中心x,"y":图片中心y,"size":图片边长}]} 或 {"error":"ax"}
import AppKit
import ApplicationServices
import Foundation

func out(_ d: [String: Any]) -> Never {
    if let data = try? JSONSerialization.data(withJSONObject: d), let s = String(data: data, encoding: .utf8) { print(s) }
    exit(0)
}

let prompt = CommandLine.arguments.contains("prompt")
let opts = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: prompt] as CFDictionary
guard AXIsProcessTrustedWithOptions(opts) else { out(["error": "ax"]) }
guard let finder = NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.finder").first else {
    out(["error": "finder"])
}
let app = AXUIElementCreateApplication(finder.processIdentifier)

func attr(_ e: AXUIElement, _ name: String) -> AnyObject? {
    var v: AnyObject?
    return AXUIElementCopyAttributeValue(e, name as CFString, &v) == .success ? v : nil
}
func point(_ e: AXUIElement, _ name: String) -> CGPoint? {
    guard let v = attr(e, name) else { return nil }
    var p = CGPoint.zero
    return AXValueGetValue(v as! AXValue, .cgPoint, &p) ? p : nil
}
func size(_ e: AXUIElement, _ name: String) -> CGSize? {
    guard let v = attr(e, name) else { return nil }
    var s = CGSize.zero
    return AXValueGetValue(v as! AXValue, .cgSize, &s) ? s : nil
}

// 桌面是 Finder 应用下面的一个 AXScrollArea（描述为"桌面/desktop"），图标是里面的 AXImage
var icons: [[String: Any]] = []
func walk(_ e: AXUIElement, _ depth: Int, _ onDesktop: Bool) {
    if depth > 5 { return }
    let role = attr(e, kAXRoleAttribute) as? String ?? ""
    var desk = onDesktop
    if role == kAXScrollAreaRole as String {
        let desc = (attr(e, kAXDescriptionAttribute) as? String ?? "").lowercased()
        desk = desc.contains("desktop") || desc.contains("桌面")
    }
    if desk && role == kAXImageRole as String, let p = point(e, kAXPositionAttribute), let s = size(e, kAXSizeAttribute) {
        let name = attr(e, kAXTitleAttribute) as? String ?? attr(e, kAXFilenameAttribute) as? String ?? ""
        // AXImage 的框是图标图片（不含文字）；取正方形图片的中心
        let side = min(s.width, s.height)
        icons.append(["name": name, "x": Double(p.x + s.width / 2), "y": Double(p.y + side / 2), "size": Double(side)])
        return
    }
    guard let kids = attr(e, kAXChildrenAttribute) as? [AXUIElement] else { return }
    for k in kids { walk(k, depth + 1, desk) }
}
walk(app, 0, false)
out(["icons": icons])
