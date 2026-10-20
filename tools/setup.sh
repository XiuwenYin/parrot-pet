#!/bin/zsh
# 准备"真实形象"自动抠图需要的东西（只需一次，约 60MB 模型 + Python 依赖）：
#   1. 编译两个小工具（抽帧、找鸟），用的是 macOS 自带能力
#   2. 在 ~/Library/Application Support/parrot-pet/venv 建独立 Python 环境，装 onnxruntime 等
#   3. 下载 MobileSAM 抠图模型（MIT 许可，huggingface.co/Acly/MobileSAM）
# 以 ">> " 开头的行会显示在桌宠气泡里。
set -e
HERE=${0:A:h}
SUPPORT="$HOME/Library/Application Support/parrot-pet"
mkdir -p "$SUPPORT/models" "$HERE/.bin"

echo ">> 编译小工具…"
for t in extract_frames birdcut; do
  if [[ ! -x "$HERE/.bin/$t" ]]; then   # 安装版自带预编译好的，只有缺了才编译
    swiftc -O "$HERE/$t.swift" -o "$HERE/.bin/$t"
    codesign -s - --force "$HERE/.bin/$t" 2>/dev/null  # 新系统上不重签会被直接杀掉
  fi
done

echo ">> 准备 Python 环境…"
if [[ ! -x "$SUPPORT/venv/bin/python" ]]; then
  python3 -m venv "$SUPPORT/venv"
fi
PIP_INDEX=${PIP_INDEX:-https://pypi.tuna.tsinghua.edu.cn/simple}
"$SUPPORT/venv/bin/pip" install -q -i "$PIP_INDEX" onnxruntime numpy pillow scipy

echo ">> 下载抠图模型（约 60MB）…"
for f in mobile_sam_image_encoder.onnx sam_mask_decoder_single.onnx sam_mask_decoder_multi.onnx; do
  if [[ ! -s "$SUPPORT/models/$f" ]]; then
    curl -fsSL --retry 3 -o "$SUPPORT/models/$f.part" "https://huggingface.co/Acly/MobileSAM/resolve/main/$f" \
      || curl -fsSL --retry 3 -o "$SUPPORT/models/$f.part" "https://hf-mirror.com/Acly/MobileSAM/resolve/main/$f"
    mv "$SUPPORT/models/$f.part" "$SUPPORT/models/$f"
  fi
done
echo ">> 准备好了"
