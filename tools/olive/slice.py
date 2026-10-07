"""Cut Daniele's olive plate (4 pages × 12 drawings) into single frames on a transparent background.

    python3 tools/olive/slice.py refs/olive-plate.png assets/mind/ [contact.png]

The sheet is 2×2 pages of 3×4 drawings, each with its caption underneath. For every cell this finds the
ink (anything that differs from the paper), keeps the drawing and drops the caption and stray marks, then
makes the paper transparent: paper is whatever can be reached from outside the drawing without crossing a
line, so white petals inside an outline stay. Frames are saved as <page><row><col>.png (a11 … d43), and
optionally a contact sheet on black to check them. Works on any resolution of the same layout.
All 48 are written; only the ones js/mind.js uses (CHAPTERS) are kept in the repo.
"""
import sys, os
from collections import deque
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

src, out = sys.argv[1], sys.argv[2]
contact = sys.argv[3] if len(sys.argv) > 3 else None
os.makedirs(out, exist_ok=True)
im = Image.open(src).convert("RGB")
W, H = im.size
k = W / 1696                                # the layout below was measured on the 1696×2528 sheet

# paper colour around each pixel (the paper is uneven: stains, vignette)
small = im.resize((W // 16, H // 16), Image.BILINEAR).filter(ImageFilter.RankFilter(9, 74))   # the light part of each patch: drawings are darker than the paper
paper = np.asarray(small.resize((W, H), Image.BILINEAR)).astype(int)
rgb = np.asarray(im).astype(int)
diff = np.abs(rgb - paper).max(2)
# An enclosed area whose mean difference from the paper is below this is paper (between leaves and branches).
# White petals are as close to the paper as that, so on the flower rows nothing enclosed is taken out.
FLOWERS = {"c3", "c4", "d2", "d3", "d4"}
SOFT = (6, 34)   # distance from the paper colour at which a pixel starts to show, and is fully there
def hole_limit(page, row): return 0 if f"{page}{row}" in FLOWERS else 30

# captions sit in a band under each row; drawings end a few px above it (measured, 1696 px wide sheet)
CAPTIONS = {"a": [303, 595, 888, 1180], "b": [303, 595, 886, 1180],
            "c": [1553, 1833, 2098, 2369], "d": [1573, 1833, 2098, 2362]}
TOPS = {"a": 70, "b": 70, "c": 1290, "d": 1290}
COLS = {"a": [60, 290, 563, 820], "b": [880, 1141, 1391, 1660],
        "c": [60, 297, 551, 820], "d": [880, 1143, 1400, 1660]}

def components(mask):
    """Connected groups of ink (8-neighbour), largest first, as lists of (y, x)."""
    seen = np.zeros_like(mask, bool)
    groups = []
    ys, xs = np.nonzero(mask)
    for y0, x0 in zip(ys, xs):
        if seen[y0, x0]: continue
        q = deque([(y0, x0)]); seen[y0, x0] = True; g = []
        while q:
            y, x = q.popleft(); g.append((y, x))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < mask.shape[0] and 0 <= nx < mask.shape[1] and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True; q.append((ny, nx))
        groups.append(g)
    return sorted(groups, key=len, reverse=True)

frames = []
for page in "abcd":
    tops = [TOPS[page]] + [c + 32 for c in CAPTIONS[page][:-1]]
    for r in range(4):
        y0, y1 = int(tops[r] * k), int((CAPTIONS[page][r] - 4) * k)
        for c in range(3):
            x0, x1 = int(COLS[page][c] * k), int(COLS[page][c + 1] * k)
            # the paper's colour here: the median of the cell's edge (a local estimate gets pulled towards
            # the green inside a dense crown, and the paper between its leaves would count as ink)
            px = rgb[y0:y1, x0:x1]
            edge = np.concatenate([px[:6].reshape(-1, 3), px[-6:].reshape(-1, 3), px[:, :6].reshape(-1, 3), px[:, -6:].reshape(-1, 3)])
            cdiff = np.abs(px - np.median(edge, 0)).max(2)
            diff[y0:y1, x0:x1] = np.minimum(diff[y0:y1, x0:x1], cdiff)
            cell = diff[y0:y1, x0:x1] > 26
            # join pieces that nearly touch (thin roots, petals) before grouping
            joined = np.asarray(Image.fromarray(cell.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(5))) > 0
            groups = components(joined)
            if not groups: continue
            big = len(groups[0])
            keep = np.zeros_like(cell)
            for g in groups:
                if len(g) < 0.06 * big: continue           # numbers, specks, the page's border line
                gy, gx = zip(*g)
                if (max(gx) - min(gx)) > 0.95 * cell.shape[1] or (max(gy) - min(gy)) > 0.97 * cell.shape[0]: continue
                keep[list(gy), list(gx)] = True
            keep &= cell
            ys, xs = np.nonzero(keep)
            if len(ys) == 0: continue
            p = 6
            by0, by1 = max(ys.min() - p, 0), min(ys.max() + p + 1, cell.shape[0])
            bx0, bx1 = max(xs.min() - p, 0), min(xs.max() + p + 1, cell.shape[1])
            # paper = reachable from the border without crossing a line
            lines = np.asarray(Image.fromarray(keep[by0:by1, bx0:bx1].astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(3)))
            fill = Image.fromarray(np.pad(lines, 1)).copy()      # floodfill needs its own buffer
            ImageDraw.floodfill(fill, (0, 0), 128)
            inside = np.asarray(fill)[1:-1, 1:-1] != 128
            # paper enclosed by the drawing (between leaves and branches) is paper too (see hole_limit)
            box = diff[y0 + by0:y0 + by1, x0 + bx0:x0 + bx1]
            for hole in components(inside & ~lines.astype(bool)):
                hy, hx = zip(*hole)
                m = float(np.mean(box[hy, hx]))
                if m < hole_limit(page, r + 1) and len(hole) > 25 * k * k: inside[hy, hx] = False
            # soft alpha: how far each pixel is from the paper, so the anti-aliased rim fades out instead of
            # leaving a pale line, and the paper's tint is taken back out of the colour (un-premultiply)
            paperc = np.median(edge, 0)
            pix = rgb[y0 + by0:y0 + by1, x0 + bx0:x0 + bx1].astype(float)
            dist = np.abs(pix - paperc).max(2)
            soft = np.clip((dist - SOFT[0]) / (SOFT[1] - SOFT[0]), 0, 1)
            region = np.asarray(Image.fromarray(inside.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(3))) > 0
            core = np.asarray(Image.fromarray(inside.astype(np.uint8) * 255).filter(ImageFilter.MinFilter(5))) > 0
            if f"{page}{r + 1}" in FLOWERS:
                a = np.where(core, 1.0, soft) * region          # white petals: only the rim is soft
            else:
                a = soft * region                               # leaves: any paper showing between them goes
            a = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.5))) / 255.0
            av = np.maximum(a, 0.02)[..., None]
            colour = np.clip((pix - (1 - av) * paperc) / av, 0, 255)
            crop = Image.fromarray(np.dstack([colour, a * 255]).astype(np.uint8), "RGBA")
            name = f"{page}{r + 1}{c + 1}"
            crop.save(os.path.join(out, name + ".png"))
            frames.append((name, crop))

print(len(frames), "frames")
if not contact: sys.exit()

# contact sheet on black, as the wall will show them
cw, ch = 300, 300
sheet = Image.new("RGB", (cw * 6, ch * 8), "black")
d = ImageDraw.Draw(sheet)
for i, (name, f) in enumerate(frames):
    s = min((cw - 20) / f.width, (ch - 40) / f.height, 1.5)
    t = f.resize((max(1, int(f.width * s)), max(1, int(f.height * s))), Image.LANCZOS)
    x, y = (i % 6) * cw, (i // 6) * ch
    sheet.paste(t, (x + (cw - t.width) // 2, y + ch - 30 - t.height), t)
    d.text((x + 8, y + 6), name, fill=(237, 28, 36))
sheet.save(contact)
