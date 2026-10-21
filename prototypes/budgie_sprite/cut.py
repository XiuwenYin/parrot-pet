import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
src, outdir, mode = sys.argv[1], sys.argv[2], sys.argv[3]
im = np.asarray(Image.open(src).convert('RGB')).astype(float)
h, w, _ = im.shape
border = np.concatenate([im[:8].reshape(-1,3), im[-8:].reshape(-1,3), im[:, :8].reshape(-1,3), im[:, -8:].reshape(-1,3)])
paper = np.median(border, 0)
d = np.sqrt(((im - paper) ** 2).sum(2))
core = d > 26
core = nd.binary_opening(core, iterations=1)
core = nd.binary_closing(core, iterations=3)
filled = nd.binary_fill_holes(core)
lab, n = nd.label(filled)
sizes = nd.sum(filled, lab, range(1, n + 1))
soft = np.clip((d - 10) / 22, 0, 1)
inner = nd.binary_erosion(filled, iterations=2)
alpha = np.maximum(soft * nd.binary_dilation(filled, iterations=2), inner.astype(float))
rgba = np.dstack([im, alpha * 255]).astype(np.uint8)
keep = [i + 1 for i, s in enumerate(sizes) if s > 150]
info = []
for i in keep:
    ys, xs = np.where(lab == i)
    y0, y1, x0, x1 = max(0, ys.min() - 4), min(h, ys.max() + 5), max(0, xs.min() - 4), min(w, xs.max() + 5)
    region = nd.binary_dilation(lab == i, iterations=3)[y0:y1, x0:x1]
    part = rgba[y0:y1, x0:x1].copy(); part[..., 3] = (part[..., 3] * region).astype(np.uint8)
    name = f'{mode}_{x0}_{y0}.png'
    Image.fromarray(part).save(f'{outdir}/{name}')
    info.append((name, x0, y0, x1 - x0, y1 - y0, int(sizes[i - 1])))
for r in sorted(info, key=lambda r: -r[5]): print(*r)
