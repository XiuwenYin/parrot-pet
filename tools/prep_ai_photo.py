"""AI 生成动作前的照片处理：把鸟抠出来，放到纯色背景正中，四周留出做动作的空间。

这样做的好处：
  - 照片里的人（脸、手）、杂乱背景不会发给生成服务；
  - 生成出来的视频背景干净，后面抠图导入更稳。

用法：python tools/prep_ai_photo.py <照片> <输出.jpg>
输出一行 JSON：{"ok": true, "out": "...", "label": "bird", "score": 0.9}
"""
import json
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import birdseg as bs  # noqa: E402

CANVAS = (1280, 960)      # 4:3，比竖图更方便鸟伸翅膀、往两边动
BIRD_H = 0.58             # 鸟占画面高度
FOOT_Y = 0.84             # 鸟的脚在画面上的位置（从上往下）
BG = (238, 240, 242)      # 浅灰背景，和鸟的颜色都分得开


def main():
    src, out = sys.argv[1], sys.argv[2]
    rgb = np.asarray(Image.open(src).convert('RGB'))
    if max(rgb.shape[:2]) > 1600:
        im = Image.fromarray(rgb)
        im.thumbnail((1600, 1600))
        rgb = np.asarray(im)
    tmp = tempfile.mkdtemp(prefix='parrot_prep_')
    small = Path(tmp) / 'photo.jpg'
    Image.fromarray(rgb).save(small, quality=92)
    loc = bs.Locator()
    try:
        sam = bs.Sam()
        box, _ = loc.locate(str(small))
        sam.set_image(rgb)
        r = bs.find_bird(sam, loc, rgb, box, tmp)
    finally:
        loc.close()
    if r is None or r['score'] < 0.25:
        print(json.dumps({'ok': False, 'error': '照片里没认出鸟'}, ensure_ascii=False))
        return
    x, y, w, h = r['bbox']
    cut = bs.cutout(rgb, r['mask']).crop((x, y, x + w, y + h))
    scale = CANVAS[1] * BIRD_H / h
    if w * scale > CANVAS[0] * 0.8:                      # 横着很宽的鸟别撑出画面
        scale = CANVAS[0] * 0.8 / w
    cut = cut.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    canvas = Image.new('RGBA', CANVAS, BG + (255,))
    left = (CANVAS[0] - cut.width) // 2
    top = round(CANVAS[1] * FOOT_Y) - cut.height
    canvas.alpha_composite(cut, (left, max(0, top)))
    canvas.convert('RGB').save(out, quality=92)
    print(json.dumps({'ok': True, 'out': out, 'label': r['label'], 'score': round(r['score'], 3),
                      'edge': bs.edge_touch(r['bbox'], rgb.shape[1], rgb.shape[0])}, ensure_ascii=False))


if __name__ == '__main__':
    main()
