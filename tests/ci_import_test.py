"""自动抠图的端到端测试（CI 在 Windows 上跑，本机也能跑）：强制走跨平台流程（不用 macOS 系统能力）。

  1. 照片 → 导入出素材
  2. 照片 → AI 生成前的预处理（鸟放到纯色背景上）
  3. 用照片合成一段"镜头慢慢移动"的视频 → 逐帧跟踪抠图
  4. 用预处理后的图合成一段"AI 生成"的视频（<动作>.ai-xxx.mp4）→ 整帧抠图

用法：python tests/ci_import_test.py   （需要先跑过 tools/setup.ps1 或 setup.sh）
"""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import av
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PHOTO = ROOT / 'tests' / 'fixtures' / 'cockatiel_cc0.jpg'
ENV = {**os.environ, 'PARROT_LOCATOR': 'onnx', 'PYTHONIOENCODING': 'utf-8'}


def run(script, *args):
    p = subprocess.run([sys.executable, str(ROOT / 'tools' / script), *map(str, args)],
                       capture_output=True, text=True, encoding='utf-8', env=ENV)
    lines = [l for l in p.stdout.splitlines() if l.strip().startswith('{')]
    if p.returncode != 0 or not lines:
        print(p.stdout[-2000:], p.stderr[-3000:])
        raise SystemExit(f'{script} 运行失败（{p.returncode}）')
    return json.loads(lines[-1])


def make_video(src, out, seconds=3.0, fps=24, motion='pan'):
    im = Image.open(src).convert('RGB')
    if motion == 'pan':
        # 测试照片里鸟的尾巴伸出了画面，会被（正确地）判成"鸟不完整"；放到大一圈的画布中间
        w0, h0 = im.size
        big = Image.new('RGB', (int(w0 * 1.5), int(h0 * 1.5)), tuple(int(v) for v in np.asarray(im).reshape(-1, 3).mean(0)))
        big.paste(im, ((big.width - w0) // 2, (big.height - h0) // 2))
        im = big
    W, H = im.size
    with av.open(str(out), 'w') as c:
        st = c.add_stream('mpeg4', rate=fps)
        st.width, st.height = 640, round(640 * H / W / 2) * 2
        st.pix_fmt = 'yuv420p'
        st.bit_rate = 4_000_000
        n = int(seconds * fps)
        for i in range(n):
            k = i / max(1, n - 1)
            if motion == 'pan':        # 镜头慢慢推近、平移一点
                s = 1 - 0.06 * k
                cw, ch = W * s, H * s
                x0, y0 = (W - cw) * (0.3 + 0.4 * k), (H - ch) * 0.5
                fr = im.crop((int(x0), int(y0), int(x0 + cw), int(y0 + ch)))
            else:                      # 背景不动，鸟上下点头（整张图轻微上下移）
                dy = int(6 * np.sin(k * np.pi * 4))
                fr = Image.new('RGB', (W, H), im.getpixel((2, 2)))
                fr.paste(im, (0, dy))
            frame = av.VideoFrame.from_image(fr.resize((st.width, st.height), Image.BICUBIC))
            for pkt in st.encode(frame):
                c.mux(pkt)
        for pkt in st.encode():
            c.mux(pkt)


def main():
    tmp = Path(tempfile.mkdtemp(prefix='parrot_ci_'))
    out = tmp / 'real'
    fails = []

    r = run('import_media.py', PHOTO, '--species', 'cockatielGrey', '--out', out)
    print('照片：', r)
    if not r.get('clips'):
        fails.append('照片没导入出素材')

    prep = tmp / 'prep.jpg'
    r = run('prep_ai_photo.py', PHOTO, prep)
    print('AI 预处理：', r)
    if not r.get('ok') or not prep.exists():
        fails.append('AI 预处理失败')

    vid = tmp / 'cockatiel_walk.mp4'
    make_video(PHOTO, vid, motion='pan')
    r = run('import_media.py', vid, '--species', 'cockatielGrey', '--out', out)
    print('视频：', r)
    if not r.get('clips'):
        fails.append('视频没导入出素材')

    if prep.exists():
        ai = tmp / 'eat.ai-ci.mp4'
        make_video(prep, ai, motion='bob')
        r = run('import_media.py', ai, '--species', 'cockatielGrey', '--out', out, '--action', 'eat')
        print('AI 视频：', r)
        if not r.get('clips'):
            fails.append('AI 视频没导入出素材')

    for f in sorted(out.rglob('*'))[:40]:
        print('  ', f.relative_to(out))
    if fails:
        raise SystemExit('失败：' + '；'.join(fails))
    print('全部通过')


if __name__ == '__main__':
    main()
