"""Extracts the NIMVORO suite icons from tools/icons-source.png (five rounded-square tiles on a dark page).

Run (Python 3 with Pillow, numpy, scipy):
    python nimvoro/tools/make_icons.py <suite-root>
<suite-root> is the OwnLauncher folder that contains `projects/` and `tasks/`.

Per tile: detect the bounds automatically, fit a rounded-square mask, crop, make the outside
transparent (anti-aliased, 8x supersampled), centre on a square canvas. Writes assets/icon.png
(512x512 RGBA) and assets/icon.ico (16..256, small sizes rendered from the full-resolution crop)
into each tool repo, build/icon.ico for Smart Switcher, and tasks/new-icons-result.png (contact sheet).
"""
import sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as nd

root = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.getcwd()
here = os.path.dirname(os.path.abspath(__file__))
src = Image.open(os.path.join(here, 'icons-source.png')).convert('RGB')
a = np.asarray(src).astype(int)
bg = a[2:6, 2:6].reshape(-1, 3).mean(0)
fg = np.abs(a - bg).max(2) > 40
fg = nd.binary_opening(fg, iterations=2)
lab, n = nd.label(fg)
objs = [o for o in nd.find_objects(lab) if (o[0].stop - o[0].start) > 200 and (o[1].stop - o[1].start) > 200]
assert len(objs) == 5, len(objs)
# reading order: top row left->right, bottom row left->right
objs.sort(key=lambda o: (round((o[0].start) / 300), o[1].start))
NAMES = ['FPS_counter', 'random_wheel', 'save_urls', 'sidekick', 'smart_switcher']

def rr_mask(w, h, r, ss=8):
    m = Image.new('L', (w * ss, h * ss), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, w * ss - 1, h * ss - 1], r * ss, fill=255)
    return m.resize((w, h), Image.LANCZOS)

def make(o):
    y0, y1, x0, x1 = o[0].start, o[0].stop, o[1].start, o[1].stop
    full = fg[y0:y1, x0:x1]
    full = nd.binary_fill_holes(full)
    h, w = full.shape
    # fit corner radius to the detected silhouette
    best = None
    for r in range(40, 140, 2):
        m = np.asarray(rr_mask(w, h, r, 1)) > 127
        err = (m ^ full).sum()
        if best is None or err < best[0]:
            best = (err, r)
    r = best[1]
    inset = 2  # drop the faint outer glow pixel ring
    crop = src.crop((x0 + inset, y0 + inset, x1 - inset, y1 - inset))
    cw, ch = crop.size
    img = crop.convert('RGBA')
    img.putalpha(rr_mask(cw, ch, r - inset))
    s = max(cw, ch)
    canvas = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    canvas.paste(img, ((s - cw) // 2, (s - ch) // 2))
    return canvas

def sharpen(im):
    return im.filter(ImageFilter.UnsharpMask(radius=1.2, percent=40, threshold=2))

def small(big, size):
    # premultiplied-alpha resize avoids dark fringes
    arr = np.asarray(big).astype(float)
    al = arr[..., 3:4] / 255
    pre = Image.fromarray(np.dstack([arr[..., :3] * al, arr[..., 3:4]]).astype(np.uint8), 'RGBA')
    pre = pre.resize((size, size), Image.LANCZOS)
    p = np.asarray(pre).astype(float)
    al = p[..., 3:4] / 255
    rgb = np.where(al > 0, p[..., :3] / np.maximum(al, 1e-3), 0).clip(0, 255)
    out = Image.fromarray(np.dstack([rgb, p[..., 3:4]]).astype(np.uint8), 'RGBA')
    return sharpen(out) if size <= 64 else out

SIZES = [16, 24, 32, 48, 64, 128, 256]
icons = {}
for name, o in zip(NAMES, objs):
    big = make(o)
    icons[name] = {s: small(big, s) for s in SIZES + [512]}
    d = os.path.join(root, 'projects', name)
    os.makedirs(os.path.join(d, 'assets'), exist_ok=True)
    icons[name][512].save(os.path.join(d, 'assets', 'icon.png'))
    ico = [icons[name][s] for s in SIZES]
    ico[-1].save(os.path.join(d, 'assets', 'icon.ico'), format='ICO',
                 sizes=[(s, s) for s in SIZES], append_images=ico[:-1])
    if name == 'smart_switcher' and os.path.isdir(os.path.join(d, 'build')):
        ico[-1].save(os.path.join(d, 'build', 'icon.ico'), format='ICO',
                     sizes=[(s, s) for s in SIZES], append_images=ico[:-1])
    print(name, big.size)

# contact sheet: 256, 48, 32, 16 on light and dark
show = [256, 48, 32, 16]
pad = 16
rowh = 256 + 2 * pad
colw = sum(show) + pad * (len(show) + 1)
sheet = Image.new('RGB', (colw * 2, rowh * 5), (255, 255, 255))
for k, bgc in enumerate([(244, 245, 250), (24, 26, 36)]):
    ImageDraw.Draw(sheet).rectangle([k * colw, 0, (k + 1) * colw, rowh * 5], fill=bgc)
    for i, name in enumerate(NAMES):
        x = k * colw + pad
        for s in show:
            im = icons[name][s]
            sheet.paste(im, (x, i * rowh + pad + (256 - s) // 2), im)
            x += s + pad
sheet.save(os.path.join(root, 'tasks', 'new-icons-result.png'))
