"""Light copies of the gallery pictures for the wall: the originals in assets/gallery/ can be huge (one is
95 megapixels), and decoding those makes the gallery stutter.

    python3 tools/gallery/resize.py

Writes assets/gallery/small/<id>.webp (tiles, at most 560 px on the long side) and
assets/gallery/large/<id>.webp (the open view, at most 1600 px) for every id in content/egg.json.
Run it again after adding or replacing a picture; the originals are not touched.
"""
import json, os, sys
from PIL import Image

Image.MAX_IMAGE_PIXELS = None          # the originals are ours, some are just very large
root = os.path.join(os.path.dirname(__file__), "..", "..")
src = os.path.join(root, "assets", "gallery")
ids = [a["id"] for a in json.load(open(os.path.join(root, "content", "egg.json")))["artworks"]]
for sub, size, q in (("small", 560, 80), ("large", 1600, 84)):
    os.makedirs(os.path.join(src, sub), exist_ok=True)
    for i in ids:
        f = next((os.path.join(src, i + e) for e in (".webp", ".jpg", ".jpeg", ".png") if os.path.exists(os.path.join(src, i + e))), None)
        if not f: print("no picture for", i); continue
        im = Image.open(f)
        im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
        im.thumbnail((size, size), Image.LANCZOS)
        im.save(os.path.join(src, sub, i + ".webp"), "WEBP", quality=q, method=5)
print("done:", len(ids), "pictures")
