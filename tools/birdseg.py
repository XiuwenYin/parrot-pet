"""把照片/视频帧里的鸟精确抠出来。

两步走：
  1. 定位：在画面里滑窗找"最像鸟"的区域。用哪个分类器：
       Mac（macOS 14+）：tools/.bin/birdcut，调系统自带的图像分类；
       Windows / 老 Mac：MobileNetV3（ImageNet-21k，认得各种鹦鹉，也认得人、笼子、沙发），onnxruntime 跑；
  2. 精抠：MobileSAM（Segment Anything 的轻量版）按这个框把鸟分割出来。
     框给了"抠哪个东西"的提示，所以站在人肩膀上、被手托着的鸟也能和人分开。
     抠出来的鸟如果碰到框边，说明框小了，就往那边扩框再抠。

模型放在桌宠的数据目录 models/ 下（第一次用时由 setup 下载）：
  Mac ~/Library/Application Support/parrot-pet，Windows %APPDATA%/parrot-pet。
"""
import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

try:  # iPhone 的 HEIC 照片（Mac 上 PIL 自己读不了，Windows 更读不了）
    from pillow_heif import register_heif_opener
    register_heif_opener()
except ImportError:
    pass

HERE = Path(__file__).resolve().parent


def _support_dir():
    if os.environ.get('PARROT_SUPPORT'):
        return Path(os.environ['PARROT_SUPPORT'])
    if sys.platform == 'darwin':
        return Path.home() / 'Library' / 'Application Support' / 'parrot-pet'
    if os.name == 'nt':
        return Path(os.environ.get('APPDATA', Path.home())) / 'parrot-pet'
    return Path.home() / '.config' / 'parrot-pet'


SUPPORT = _support_dir()
MODELS = SUPPORT / 'models'
BIRDCUT = HERE / '.bin' / 'birdcut'
CLASSIFIER = MODELS / 'bird_classifier.onnx'          # MobileNetV3 ImageNet-21k（fp16）
CLASSIFIER_LABELS = MODELS / 'bird_classifier.json'   # 标签表（模型自带的 config.json）
SAM_SIZE = 1024
# 分类器认出这些东西说明抠到的不只是鸟
DISTRACTORS = ('cage', 'people', 'person', 'adult', 'child', 'hand', 'furniture', 'sofa', 'structure', 'interior_room')


def use_vision():
    """Mac 上有 birdcut 就用系统的识别（和以前一样）；PARROT_LOCATOR=onnx 可以强制用跨平台模型。"""
    if os.environ.get('PARROT_LOCATOR') == 'onnx':
        return False
    if sys.platform != 'darwin' or not BIRDCUT.exists():
        return False
    import platform
    try:
        return int(platform.mac_ver()[0].split('.')[0]) >= 14   # 系统"抠主体"要 macOS 14+
    except ValueError:
        return True


def make_locator():
    return Locator() if use_vision() else OnnxLocator()


def has_locator():
    return use_vision() or CLASSIFIER.exists()


class Locator:
    """常驻的 birdcut serve 子进程：问它"鸟在哪""像不像鸟"。"""

    def __init__(self):
        self.p = subprocess.Popen([str(BIRDCUT), 'serve'], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.DEVNULL, text=True, bufsize=1)

    def _ask(self, cmd):
        self.p.stdin.write(cmd + '\n')
        self.p.stdin.flush()
        return json.loads(self.p.stdout.readline())

    def locate(self, path):
        r = self._ask(f'locate {path}')
        return r.get('box'), r.get('score', 0)

    def score(self, path, box=None):
        """返回 (鸟分数, 标签)。分类器同时认出笼子、人等干扰物时扣分。"""
        cmd = f'score {path}' + ('' if box is None else ' ' + ' '.join(str(int(v)) for v in box))
        r = self._ask(cmd)
        sc = r.get('score', 0)
        for t in r.get('top', []):
            if any(w in t['label'].lower() for w in DISTRACTORS):
                sc *= max(0.15, 1 - 1.5 * t['p'])
        return sc, r.get('label', '')

    def close(self):
        try:
            self.p.stdin.close()
            self.p.wait(timeout=3)
        except Exception:
            self.p.kill()


# ImageNet-21k 标签里鸟的编号段（鸟类、雉鸡到天鹅、涉禽到海鸟）
BIRD_RANGES = ((273, 585), (829, 1022), (1163, 1337))
# 出现这些说明框里不只是鸟（对应 Vision 那边的 DISTRACTORS）
ONNX_DISTRACTORS = {'person', 'people', 'hand', 'birdcage', 'cage', 'sofa', 'furniture', 'man', 'woman', 'child', 'room'}


class OnnxLocator:
    """跨平台的找鸟器：接口和 Locator 一样。"""

    def __init__(self):
        import onnxruntime as ort
        opts = ort.SessionOptions()
        opts.log_severity_level = 3
        self.sess = ort.InferenceSession(str(CLASSIFIER), opts, providers=['CPUExecutionProvider'])
        self.inp = self.sess.get_inputs()[0]
        self.half = 'float16' in self.inp.type
        id2 = json.load(open(CLASSIFIER_LABELS, encoding='utf-8'))['id2label']
        self.labels = [id2[str(i)] for i in range(len(id2))]
        self.bird = np.zeros(len(self.labels), bool)
        for a, b in BIRD_RANGES:
            self.bird[a:b + 1] = True
        self.distract = np.array([l.lower() in ONNX_DISTRACTORS for l in self.labels])

    @staticmethod
    def _prep(im):
        """补成正方形（灰边）再缩到 224，不裁掉鸟的任何部分。"""
        w, h = im.size
        s = max(w, h)
        sq = Image.new('RGB', (s, s), (128, 128, 128))
        sq.paste(im, ((s - w) // 2, (s - h) // 2))
        return np.asarray(sq.resize((224, 224), Image.BICUBIC), np.float32).transpose(2, 0, 1) / 255

    def _probs(self, crops):
        out = []
        for i in range(0, len(crops), 16):
            x = np.stack([self._prep(c) for c in crops[i:i + 16]])
            z = self.sess.run(None, {self.inp.name: x.astype(np.float16 if self.half else np.float32)})[0]
            z = z.astype(np.float32)
            p = np.exp(z - z.max(axis=1, keepdims=True))
            out.extend(p / p.sum(axis=1, keepdims=True))
        return out

    def _bird_score(self, p):
        sc = float(p[self.bird].sum())
        dis = float(p[self.distract].sum())
        if dis > 0.05:
            sc *= max(0.15, 1 - 1.5 * dis)
        bi = np.where(self.bird)[0]
        label = self.labels[int(bi[np.argmax(p[bi])])]
        return sc, label

    def locate(self, path):
        """多尺度滑窗（和 birdcut 一样），返回最像鸟的窗口 [x,y,w,h] 和分数。"""
        im = Image.open(path).convert('RGB')
        W, H = im.size
        boxes = [(0, 0, W, H)]
        m = min(W, H)
        weights = [1.0]
        for frac in (0.75, 0.5, 0.33):
            side = m * frac
            stride = side * 0.5
            y = 0.0
            while y + side <= H + 1:
                x = 0.0
                while x + side <= W + 1:
                    boxes.append((x, y, side, side))
                    weights.append(0.85 + 0.15 * frac)   # 小窗口略降权，免得只框到鸟头
                    x += stride
                y += stride
        crops = [im.crop((int(x), int(y), int(x + w), int(y + h))) for x, y, w, h in boxes]
        best, best_sc = boxes[0], -1.0
        for b, wgt, p in zip(boxes, weights, self._probs(crops)):
            sc = self._bird_score(p)[0] * wgt
            if sc > best_sc:
                best, best_sc = b, sc
        return [int(v) for v in best], best_sc

    def score(self, path, box=None):
        im = Image.open(path).convert('RGB')
        if box is not None:
            x, y, w, h = box
            im = im.crop((int(x), int(y), int(x + w), int(y + h)))
        return self._bird_score(self._probs([im])[0])

    def close(self):
        pass


class Sam:
    def __init__(self):
        import onnxruntime as ort
        opts = ort.SessionOptions()
        opts.log_severity_level = 3
        providers = ['CPUExecutionProvider']  # 实测 CPU 比 CoreML 快（0.3s vs 1~3s）
        self.enc = ort.InferenceSession(str(MODELS / 'mobile_sam_image_encoder.onnx'), opts, providers=providers)
        self.dec = ort.InferenceSession(str(MODELS / 'sam_mask_decoder_single.onnx'), opts,
                                        providers=['CPUExecutionProvider'])
        self.dec_multi = ort.InferenceSession(str(MODELS / 'sam_mask_decoder_multi.onnx'), opts,
                                              providers=['CPUExecutionProvider'])
        self.emb = None
        self.scale = 1.0
        self.size = (0, 0)

    def set_image(self, rgb):
        h, w = rgb.shape[:2]
        self.scale = SAM_SIZE / max(h, w)
        nh, nw = round(h * self.scale), round(w * self.scale)
        small = np.asarray(Image.fromarray(rgb).resize((nw, nh), Image.BILINEAR), dtype=np.float32)
        self.emb = self.enc.run(None, {'input_image': small})[0]
        self.size = (h, w)

    def predict(self, box, points=(), labels=(), mask_input=None):
        """box: [x, y, w, h]（原图坐标）。返回 (bool 蒙版, 置信度, 低分辨率蒙版)。"""
        x, y, bw, bh = box
        coords = [[x, y], [x + bw, y + bh]] + [list(p) for p in points]
        labs = [2, 3] + list(labels)
        coords = np.array([coords], dtype=np.float32) * self.scale
        labs = np.array([labs], dtype=np.float32)
        has = np.array([0 if mask_input is None else 1], dtype=np.float32)
        mi = np.zeros((1, 1, 256, 256), np.float32) if mask_input is None else mask_input
        masks, iou, low = self.dec.run(None, {
            'image_embeddings': self.emb, 'point_coords': coords, 'point_labels': labs,
            'mask_input': mi, 'has_mask_input': has,
            'orig_im_size': np.array(self.size, dtype=np.float32),
        })
        return masks[0, 0] > 0, float(iou[0, 0]), low


    def predict_points(self, points, labels):
        """只用点提示，返回多个候选蒙版 [(蒙版, 置信度)]。"""
        coords = np.array([list(points) + [[0, 0]]], dtype=np.float32) * self.scale
        labs = np.array([list(labels) + [-1]], dtype=np.float32)
        masks, iou, _ = self.dec_multi.run(None, {
            'image_embeddings': self.emb, 'point_coords': coords, 'point_labels': labs,
            'mask_input': np.zeros((1, 1, 256, 256), np.float32), 'has_mask_input': np.array([0], np.float32),
            'orig_im_size': np.array(self.size, dtype=np.float32),
        })
        return [(masks[0, k] > 0, float(iou[0, k])) for k in range(masks.shape[1])]


def bbox_of(mask):
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return None
    return [int(xs.min()), int(ys.min()), int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)]


def clean(mask):
    """只留最大的一块，补洞，去毛刺。"""
    lab, n = ndimage.label(mask)
    if n == 0:
        return mask
    if n > 1:
        sizes = ndimage.sum(mask, lab, range(1, n + 1))
        mask = lab == (1 + int(np.argmax(sizes)))
    mask = ndimage.binary_fill_holes(mask)
    return ndimage.binary_opening(mask, iterations=2)


def segment(sam, box, W, H, max_grow=4, points=(), labels=()):
    """从 box 出发分割；蒙版碰到框边就往那边扩框。返回 (蒙版, 外框, 置信度)。"""
    box = list(box)
    mask, iou, low = sam.predict(box, points, labels)
    for _ in range(max_grow):
        bb = bbox_of(mask)
        if bb is None:
            break
        x, y, w, h = box
        m = 4
        gx, gy = w * 0.35, h * 0.35
        nx0, ny0, nx1, ny1 = x, y, x + w, y + h
        grew = False
        if bb[0] - x < m and x > 0:
            nx0 -= gx; grew = True
        if (x + w) - (bb[0] + bb[2]) < m and x + w < W:
            nx1 += gx; grew = True
        if bb[1] - y < m and y > 0:
            ny0 -= gy; grew = True
        if (y + h) - (bb[1] + bb[3]) < m and y + h < H:
            ny1 += gy; grew = True
        if not grew:
            break
        nx0, ny0 = max(0, nx0), max(0, ny0)
        nx1, ny1 = min(W, nx1), min(H, ny1)
        box = [nx0, ny0, nx1 - nx0, ny1 - ny0]
        mask, iou, low = sam.predict(box, points, labels)
    # 用贴身的框 + 上一轮的结果再细化一次
    bb = bbox_of(mask)
    if bb is not None:
        pad = 0.04
        tight = [max(0, bb[0] - bb[2] * pad), max(0, bb[1] - bb[3] * pad), bb[2] * (1 + 2 * pad), bb[3] * (1 + 2 * pad)]
        mask2, iou2, _ = sam.predict(tight, mask_input=low)
        if mask2.sum() > 0.5 * mask.sum():
            mask, iou = mask2, iou2
    mask = clean(mask)
    return mask, bbox_of(mask), iou


def cutout(rgb, mask, feather=1.2):
    from PIL import ImageFilter
    alpha = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(feather))
    im = Image.fromarray(rgb).convert('RGBA')
    im.putalpha(alpha)
    return im


def verify(locator, im, bb, tmpdir):
    """把抠出来的鸟放在灰底上再分类一次，确认真的是鸟。"""
    crop = im.crop((bb[0], bb[1], bb[0] + bb[2], bb[1] + bb[3]))
    bg = Image.new('RGBA', crop.size, (128, 128, 128, 255))
    bg.alpha_composite(crop)
    path = os.path.join(tmpdir, '_verify.jpg')
    bg.convert('RGB').save(path, quality=90)
    return locator.score(path)


def edge_touch(bb, W, H, m=3):
    return bb[0] <= m or bb[1] <= m or bb[0] + bb[2] >= W - m or bb[1] + bb[3] >= H - m


def iou(a, b):
    inter = np.logical_and(a, b).sum()
    return inter / max(1, np.logical_or(a, b).sum())


def find_bird(sam, locator, rgb, box, tmpdir, quick=False, grid=4):
    """找鸟：
    quick=True（视频跟踪）：只用上一帧位置当框抠一次；
    否则在框附近撒 grid×grid 个点，每个点出几种候选，去重后用分类器挑最像鸟的。
    返回 dict(mask, bbox, score, label) 或 None。"""
    H, W = rgb.shape[:2]
    cands = []
    if quick:
        cands.append(segment(sam, box, W, H)[0])
    else:
        x, y, w, h = box
        x0, y0 = max(0, x - w * 0.3), max(0, y - h * 0.3)
        x1, y1 = min(W, x + w * 1.3), min(H, y + h * 1.3)
        for i in range(grid):
            for j in range(grid):
                px = x0 + (x1 - x0) * (i + 0.5) / grid
                py = y0 + (y1 - y0) * (j + 0.5) / grid
                for m, _ in sam.predict_points([[px, py]], [1]):
                    area = m.sum() / (W * H)
                    if 0.004 < area < 0.6:
                        cands.append(m)
        # 去重
        uniq = []
        for m in cands:
            if all(iou(m, u) < 0.85 for u in uniq):
                uniq.append(m)
        cands = uniq
    scored = []
    for m in cands:
        m = clean(m)
        bb = bbox_of(m)
        if bb is None or m.sum() < 400:
            continue
        sc, label = verify(locator, cutout(rgb, m), bb, tmpdir)
        adj = sc * (0.85 if edge_touch(bb, W, H) else 1)
        scored.append(dict(mask=m, bbox=bb, score=sc, label=label, adj=adj, area=int(m.sum())))
    best = None
    if scored:
        top = max(s['adj'] for s in scored)
        # 差不多一样像鸟时，挑最小最贴身的（单独那只鸟，而不是"鸟 + 笼子/手"）
        close = [s for s in scored if s['adj'] >= 0.8 * top]
        best = min(close, key=lambda s: s['area'])
    if best is not None and not quick:
        # 用最好的结果的外框再精修一次（框提示通常边缘更干净）
        m2, bb2, _ = segment(sam, best['bbox'], W, H, max_grow=1)
        if bb2 is not None and iou(m2, best['mask']) > 0.6:
            sc2, label2 = verify(locator, cutout(rgb, m2), bb2, tmpdir)
            if sc2 >= best['score'] * 0.95:
                best.update(mask=m2, bbox=bb2, score=sc2, label=label2)
    return best
