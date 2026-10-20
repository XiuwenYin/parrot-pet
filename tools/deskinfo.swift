// 列出屏幕上普通应用窗口的位置（只要位置，不读内容，不需要录屏权限），
// 桌宠用它判断桌面图标有没有被窗口挡住——挡住的不去啃，啃过的被挡住了就把咬痕藏起来。
// 用法: deskinfo [要排除的 pid ...]  → 输出 JSON: [{"pid":123,"app":"Safari","x":0,"y":25,"w":800,"h":600}, ...]
import CoreGraphics
import Foundation

let exclude = Set(CommandLine.arguments.dropFirst().compactMap { Int($0) })
let opts: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
let list = (CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]]) ?? []
var out: [[String: Any]] = []
for w in list {
    guard (w[kCGWindowLayer as String] as? Int) == 0,
          let pid = w[kCGWindowOwnerPID as String] as? Int, !exclude.contains(pid),
          let b = w[kCGWindowBounds as String] as? [String: Any],
          let x = b["X"] as? Double, let y = b["Y"] as? Double,
          let width = b["Width"] as? Double, let height = b["Height"] as? Double,
          width > 40, height > 40 else { continue }
    if let alpha = w[kCGWindowAlpha as String] as? Double, alpha < 0.1 { continue }
    out.append(["pid": pid, "app": (w[kCGWindowOwnerName as String] as? String) ?? "",
                "x": x, "y": y, "w": width, "h": height])
}
let data = try! JSONSerialization.data(withJSONObject: out, options: [])
print(String(data: data, encoding: .utf8)!)
