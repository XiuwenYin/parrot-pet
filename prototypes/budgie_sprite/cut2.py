# 去掉"假透明"灰白格子或白纸背景：背景几乎没有颜色（彩度低），鸟的部件都有颜色或是深色线条
import sys, numpy as np
from PIL import Image
from scipy import ndimage as nd
src, out = sys.argv[1], sys.argv[2]
im = np.asarray(Image.open(src).convert('RGB')).astype(float)
mx, mn = im.max(2), im.min(2)
chroma = nd.gaussian_filter(mx - mn, 1.2)
dark = nd.gaussian_filter(np.clip((170 - mx) / 50, 0, 1), 1.2)
score = np.maximum(np.clip((chroma - 14) / 34, 0, 1), dark)
core = nd.binary_closing(score > 0.5, iterations=4)
core = nd.binary_fill_holes(core)
lab, n = nd.label(core); sizes = nd.sum(core, lab, range(1, n + 1))
core = lab == (np.argmax(sizes) + 1)
core = nd.binary_fill_holes(nd.binary_closing(core, iterations=6))
inner = nd.gaussian_filter(nd.binary_erosion(core, iterations=5).astype(float), 3)
alpha = np.maximum(score * nd.binary_dilation(core, iterations=10), inner)
# 半透明的地方把背景色"减掉"，免得边上留一圈灰白
bg = np.where(((np.indices(mx.shape).sum(0)) % 2)[..., None] >= 0, 245.0, 245.0)
a3 = np.clip(alpha, 0.05, 1)[..., None]
rgb = np.clip((im - (1 - a3) * bg) / a3, 0, 255)
ys, xs = np.where(alpha > 0.08)
y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8)[y0:y1, x0:x1]).save(out)
print(out.split('/')[-1], x1 - x0, y1 - y0)
