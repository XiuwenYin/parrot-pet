#!/bin/zsh
# 把三个 Swift 小工具编成通用二进制（Apple 芯片 + Intel），打包 Mac 安装版前运行。
#   extract_frames  抽帧        birdcut  找鸟        deskinfo  窗口位置
set -e
HERE=${0:A:h}
mkdir -p "$HERE/.bin"
for t in extract_frames birdcut deskinfo; do
  echo "编译 $t"
  swiftc -O -target arm64-apple-macos11 "$HERE/$t.swift" -o "$HERE/.bin/$t-arm64"
  swiftc -O -target x86_64-apple-macos11 "$HERE/$t.swift" -o "$HERE/.bin/$t-x64"
  lipo -create "$HERE/.bin/$t-arm64" "$HERE/.bin/$t-x64" -output "$HERE/.bin/$t"
  rm "$HERE/.bin/$t-arm64" "$HERE/.bin/$t-x64"
  codesign -s - --force "$HERE/.bin/$t" 2>/dev/null || true
done
lipo -info "$HERE/.bin/"*
