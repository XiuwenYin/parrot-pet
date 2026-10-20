"""把一个视频或照片变成桌宠"真实形象"的素材。桌宠发现素材文件夹里有新文件时会自动调用它。

用法:
  python tools/import_media.py <视频或照片> --species roseicollis [--out assets/real]

流程:
  照片：定位 → 精抠 → 裁剪 → 存成一帧的 idle 素材（桌宠会给它加上跳动、晃动）。
  视频：抽帧 → 逐帧跟踪抠鸟 → 挑出"鸟清楚、完整、没被挡"的连续片段
       → 对齐防抖 → 判断头朝哪边 → 每段存成一个素材。

stdout 每行一个 JSON，桌宠用来显示进度：
  {"progress": 0.42, "stage": "抠图"}
  {"done": true, "clips": [...], "message": "...", "hint": "..."}
  {"done": true, "clips": [], "error": "...", "hint": "..."}
"""
import argparse
import json
import math
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import birdseg as bs  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
VIDEO_EXT = {'.mp4', '.mov', '.m4v', '.avi', '.mkv', '.webm'}
PHOTO_EXT = {'.jpg', '.jpeg', '.png', '.heic', '.webp'}
OUT_H = 360            # 输出素材高度
GOOD_SCORE = 0.35      # 分类器认为"是鸟"的门槛
MIN_CLIP_S = 1.0       # 片段最短
MAX_CLIP_S = 4.0       # 片段最长
MAX_CLIPS = 5
MIN_BIRD_H = 0.12      # 鸟至少占画面高度的 12%，太小抠出来是糊的
BUDGIE_WORDS = ('budgerigar', 'budgie')  # parakeet 也泛指小型鹦鹉，不算


def emit(**kw):
    print(json.dumps(kw, ensure_ascii=False), flush=True)


def facing_of(mask):
    """头朝哪边：上部 30% 的重心在整体重心的哪一侧。"""
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return 0
    top = ys < ys.min() + 0.3 * (ys.max() - ys.min())
    return float(xs[top].mean() - xs.mean())


def species_hint(labels, species):
    budgie = sum(any(w in l.lower() for w in BUDGIE_WORDS) for l in labels)
    if budgie >= max(1, len(labels) * 0.3) and species not in ('budgie',):
        return '这只看起来像虎皮鹦鹉，不太像牡丹鹦鹉哦'
    return None


def save_clip(frames, out_dir, fps, facing, source, score):
    """frames: [(RGBA 整帧裁剪图, (锚点x, 锚点y) 在该裁剪图里的坐标)] —— 按锚点（脚底中心）对齐到同一画布。"""
    lefts = [a[0] for _, a in frames]
    rights = [im.width - a[0] for im, a in frames]
    ups = [a[1] for _, a in frames]
    downs = [im.height - a[1] for im, a in frames]
    L, R, U, D = max(lefts), max(rights), max(ups), max(downs)
    cw, ch = int(L + R), int(U + D)
    scale = OUT_H / ch
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob('*.png'):
        old.unlink()
    for i, (im, (ax, ay)) in enumerate(frames):
        canvas = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
        canvas.alpha_composite(im, (int(L - ax), int(U - ay)))
        canvas = canvas.resize((max(1, round(cw * scale)), OUT_H), Image.LANCZOS)
        canvas.save(out_dir / f'{i:04d}.png', optimize=True)
    (out_dir / 'meta.json').write_text(json.dumps(
        {'fps': fps, 'facing': facing, 'source': source, 'score': round(score, 3)},
        ensure_ascii=False, indent=2))


def crop_cut(rgb, mask, bb, pad=0.06):
    H, W = mask.shape
    px, py = bb[2] * pad, bb[3] * pad
    x0, y0 = max(0, int(bb[0] - px)), max(0, int(bb[1] - py))
    x1, y1 = min(W, int(bb[0] + bb[2] + px)), min(H, int(bb[1] + bb[3] + py))
    im = bs.cutout(rgb[y0:y1, x0:x1], mask[y0:y1, x0:x1])
    return im, (x0, y0)


def import_photo(path, species, out_root, tmp, sam, loc):
    emit(progress=0.1, stage='找鸟')
    rgb = np.asarray(Image.open(path).convert('RGB'))
    if max(rgb.shape[:2]) > 1600:
        im = Image.fromarray(rgb)
        im.thumbnail((1600, 1600))
        rgb = np.asarray(im)
    small = Path(tmp) / 'photo.jpg'
    Image.fromarray(rgb).save(small, quality=92)
    box, _ = loc.locate(str(small))
    sam.set_image(rgb)
    emit(progress=0.4, stage='抠图')
    r = bs.find_bird(sam, loc, rgb, box, tmp)
    if r is None or r['score'] < 0.25:
        return emit(done=True, clips=[], error='这张照片里没认出鸟',
                    hint='换一张鸟占画面大一些、整只都拍进去的照片试试')
    im, (x0, y0) = crop_cut(rgb, r['mask'], r['bbox'])
    bb = r['bbox']
    anchor = (bb[0] + bb[2] / 2 - x0, bb[1] + bb[3] - y0)
    facing = 'right' if facing_of(r['mask']) >= 0 else 'left'
    name = Path(path).stem[:24]
    out = out_root / species / 'idle' / f'photo_{name}'
    save_clip([(im, anchor)], out, 1, facing, Path(path).name, r['score'])
    notes = []
    if bs.edge_touch(bb, rgb.shape[1], rgb.shape[0]):
        notes.append('鸟有一部分在画面外，素材会缺一块')
    sh = species_hint([r['label']], species)
    if sh:
        notes.append(sh)
    emit(done=True, clips=[str(out.relative_to(out_root))], message='照片学会啦', hint='；'.join(notes) or None)


def extract_frames(path, fps, tmp):
    binp = Path(__file__).resolve().parent / '.bin' / 'extract_frames'
    d = Path(tmp) / 'frames'
    subprocess.run([str(binp), str(path), str(d), str(fps)], check=True, stdout=subprocess.DEVNULL)
    return sorted(d.glob('*.png'))


def video_duration(path):
    try:
        import json as _j
        out = subprocess.run(['mdls', '-raw', '-name', 'kMDItemDurationSeconds', str(path)],
                             capture_output=True, text=True).stdout
        return float(out)
    except Exception:
        return 0.0


def import_video(path, species, out_root, tmp, sam, loc):
    dur = video_duration(path) or 60
    fps = min(8.0, max(3.0, 600 / dur))      # 长视频降低帧率，控制总处理量
    emit(progress=0.02, stage='抽帧')
    files = extract_frames(path, fps, tmp)
    if not files:
        return emit(done=True, clips=[], error='视频读不出来')
    n = len(files)
    rec = []          # 每帧结果
    track = None
    skip_until = -1
    for i, f in enumerate(files):
        if i % 4 == 0:
            emit(progress=round(0.05 + 0.85 * i / n, 3), stage=f'抠图 {i}/{n}')
        rgb = np.asarray(Image.open(f).convert('RGB'))
        H, W = rgb.shape[:2]
        r = None
        sam.set_image(rgb)
        if track is not None:
            x, y, w, h = track
            r = bs.find_bird(sam, loc, rgb, [max(0, x - w * .1), max(0, y - h * .1), w * 1.2, h * 1.2], tmp, quick=True)
            if r is not None and r['score'] < GOOD_SCORE:
                r = None
        if r is None and i >= skip_until:
            box, _ = loc.locate(str(f))
            r = bs.find_bird(sam, loc, rgb, box, tmp, grid=3)
            if r is None or r['score'] < 0.25:
                r = None
                skip_until = i + max(1, int(fps * 0.5))   # 跟丢了，半秒后再全图找
        if r is None:
            track = None
            rec.append(None)
            continue
        track = r['bbox']
        im, (x0, y0) = crop_cut(rgb, r['mask'], r['bbox'])
        bb = r['bbox']
        rec.append(dict(
            im=im, anchor=(bb[0] + bb[2] / 2 - x0, bb[1] + bb[3] - y0), abs_anchor=(bb[0] + bb[2] / 2, bb[1] + bb[3]),
            bbox=bb, score=r['score'], label=r['label'], edge=bs.edge_touch(bb, W, H),
            area=int(r['mask'].sum()), face=facing_of(r['mask']),
        ))

    emit(progress=0.92, stage='挑片段')
    found = [r for r in rec if r]
    if not found:
        return emit(done=True, clips=[], error='整段视频都没认出鸟',
                    hint='鸟要占画面大一些、整只入镜；别用手握着或隔着笼子拍')
    med_area = float(np.median([r['area'] for r in found]))
    frame_h = np.asarray(Image.open(files[0])).shape[0]
    good = [bool(r and r['score'] >= GOOD_SCORE and not r['edge'] and 0.5 * med_area < r['area'] < 2 * med_area
                 and r['bbox'][3] >= MIN_BIRD_H * frame_h)
            for r in rec]
    runs = []
    i = 0
    while i < n:
        if not good[i]:
            i += 1
            continue
        j = i
        while j + 1 < n and good[j + 1]:
            j += 1
        runs.append((i, j))
        i = j + 1
    min_len, max_len = int(MIN_CLIP_S * fps), int(MAX_CLIP_S * fps)
    pieces = []
    for a, b in runs:
        k = a
        while b - k + 1 >= min_len:
            e = min(b, k + max_len - 1)
            pieces.append((k, e))
            k = e + 1
    pieces.sort(key=lambda p: -np.mean([rec[k]['score'] for k in range(p[0], p[1] + 1)]) * (p[1] - p[0] + 1) ** 0.5)
    pieces = sorted(pieces[:MAX_CLIPS])
    labels = [r['label'] for r in found]
    sh = species_hint(labels, species)
    if not pieces:
        seen = len(found) / n
        small = sum(r['bbox'][3] < MIN_BIRD_H * frame_h for r in found)
        if seen < 0.2:
            why = '鸟大部分时间没认出来（太小、被挡住或者出了画面）'
        elif small > 0.5 * len(found):
            why = '鸟在画面里太小了'
        elif sum(r['edge'] for r in found) > 0.5 * len(found):
            why = '鸟经常有一部分在画面外'
        else:
            why = f'鸟清楚完整的连续时间都不到 {MIN_CLIP_S:.0f} 秒'
        return emit(done=True, clips=[], error=why,
                    hint='拍的时候让鸟整只在画面里、别被手挡住，镜头稳一点，每个动作拍 2～3 秒' + (f'；{sh}' if sh else ''))

    stem = Path(path).stem[:24]
    clips = []
    for c, (a, b) in enumerate(pieces):
        seg = [rec[k] for k in range(a, b + 1)]
        # 锚点平滑一下，减少抖动
        ax = np.array([s['anchor'][0] for s in seg])
        ay = np.array([s['anchor'][1] for s in seg])
        k = 3
        sx = np.convolve(np.pad(ax, k, mode='edge'), np.ones(2 * k + 1) / (2 * k + 1), 'valid')
        sy = np.convolve(np.pad(ay, k, mode='edge'), np.ones(2 * k + 1) / (2 * k + 1), 'valid')
        frames = [(s['im'], (float(x), float(y))) for s, x, y in zip(seg, sx, sy)]
        facing = 'right' if np.median([s['face'] for s in seg]) >= 0 else 'left'
        # 横向移动超过 1.5 个身宽算"走路"，否则算"发呆"
        travel = abs(seg[-1]['abs_anchor'][0] - seg[0]['abs_anchor'][0])
        width = np.median([s['bbox'][2] for s in seg])
        action = 'walk' if travel > 1.5 * width else 'idle'
        out = out_root / species / action / f'{stem}_{c + 1}'
        save_clip(frames, out, round(fps, 2), facing, Path(path).name, float(np.mean([s['score'] for s in seg])))
        clips.append(str(out.relative_to(out_root)))
    total = sum(b - a + 1 for a, b in pieces) / fps
    emit(done=True, clips=clips, message=f'学会了 {len(clips)} 段（共 {total:.1f} 秒）', hint=sh)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('file')
    ap.add_argument('--species', default='roseicollis')
    ap.add_argument('--out', default=str(ROOT / 'assets' / 'real'))
    args = ap.parse_args()
    path = Path(args.file)
    ext = path.suffix.lower()
    if ext not in VIDEO_EXT | PHOTO_EXT:
        return emit(done=True, clips=[], error='不支持的文件类型')
    if not (bs.MODELS / 'mobile_sam_image_encoder.onnx').exists():
        return emit(done=True, clips=[], error='抠图模型还没下载')
    tmp = tempfile.mkdtemp(prefix='parrot_import_')
    loc = bs.Locator()
    try:
        emit(progress=0.01, stage='加载模型')
        sam = bs.Sam()
        if ext in VIDEO_EXT:
            import_video(path, args.species, Path(args.out), tmp, sam, loc)
        else:
            import_photo(path, args.species, Path(args.out), tmp, sam, loc)
    except Exception as e:  # 让桌宠能显示出错原因
        emit(done=True, clips=[], error=f'处理出错：{e}')
        raise
    finally:
        loc.close()
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    main()
