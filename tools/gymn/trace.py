"""Trace the ground plan of the Vedius Gymnasion into walls and columns for the 3D ruin (js/gymn.js).

    python3 tools/gymn/trace.py [refs/Ephesos-Gymnasion-of-Vedius-ground-plan-MS-Marmorsaal-resp-Kaisersaal.png]

Needs OpenCV (pip install opencv-python-headless). Writes assets/gymn/plan.json:
  { w, h,                       the plan image's size; all coordinates are its pixels (x right, y down)
    walls: [[outer, hole, ...]] each wall a polygon with its holes, [[x, y], ...]
    columns: [[x, y, r]] }      the small dots: columns of the palaestra and the street
The dark parts of the drawing are the walls. Thin lines (vault outlines, hatching) and the lettering are removed
by an opening of 2x2 px; what is left and is small and square is a column.
"""
import json, os, sys
import cv2
import numpy as np

root = os.path.join(os.path.dirname(__file__), "..", "..")
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, "refs", "Ephesos-Gymnasion-of-Vedius-ground-plan-MS-Marmorsaal-resp-Kaisersaal.png")
im = cv2.imread(src, cv2.IMREAD_GRAYSCALE)
h, w = im.shape
dark = (im < 140).astype(np.uint8) * 255
solid = cv2.morphologyEx(dark, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2)))

n, lab, stats, cent = cv2.connectedComponentsWithStats(solid)
walls_mask = np.zeros_like(solid)
columns = []
for i in range(1, n):
    x, y, bw, bh, area = stats[i]
    if area < 6: continue                                    # specks, bits of lettering
    if area <= 40 and max(bw, bh) <= 8 and min(bw, bh) >= 2 and max(bw, bh) <= 2.2 * min(bw, bh):
        cx, cy = cent[i]
        columns.append([round(float(cx), 1), round(float(cy), 1), round(float(max(bw, bh)) / 2, 1)])
        continue
    walls_mask[lab == i] = 255

# a column stands in a row: dots with no other dot near them are leftovers (room numbers, the north arrow)
columns = [c for c in columns if any(o is not c and (o[0] - c[0]) ** 2 + (o[1] - c[1]) ** 2 < 24 ** 2 for o in columns)]

# outlines with their holes, simplified a little
contours, hier = cv2.findContours(walls_mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
walls = []
if hier is not None:
    hier = hier[0]
    simplify = lambda c: [[int(p[0][0]), int(p[0][1])] for p in cv2.approxPolyDP(c, 0.7, True)]
    for i, c in enumerate(contours):
        if hier[i][3] != -1: continue                        # a hole: added with its outer contour
        if cv2.contourArea(c) < 6: continue
        poly = [simplify(c)]
        j = hier[i][2]
        while j != -1:
            if cv2.contourArea(contours[j]) >= 4: poly.append(simplify(contours[j]))
            j = hier[j][0]
        if len(poly[0]) >= 3: walls.append(poly)

out = os.path.join(root, "assets", "gymn", "plan.json")
json.dump({ "w": w, "h": h, "walls": walls, "columns": columns }, open(out, "w"), separators=(",", ":"))
print(f"{len(walls)} walls, {len(columns)} columns -> {out} ({os.path.getsize(out) // 1024} KB)")
