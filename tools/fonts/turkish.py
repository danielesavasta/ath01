"""Add the Turkish letters Sporting Grotesque lacks (ğ Ğ ş Ş İ) and ē Ē (mētis), built from its own parts.

    python3 tools/fonts/turkish.py assets/fonts/SportingGrotesque-Regular.otf assets/fonts/AthenaGrotesque-Regular.otf

ş Ş take its cedilla at the depth it has under ç Ç, İ the dot of ż Ż; the breve (ğ Ğ) and the macron (ē Ē) are drawn here at the
weight of the font's own accents, at the height of its dieresis. The result is renamed ("Athena Grotesque"):
the font is under the SIL Open Font Licence, which allows changes to a copy under another name.
"""
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.transformPen import TransformPen

src, out = sys.argv[1], sys.argv[2]
f = TTFont(src)
gs = f.getGlyphSet()
cff = f["CFF "].cff
top = cff.topDictIndex[0]
cs = top.CharStrings
hmtx = f["hmtx"]

def contours(name):
    p = DecomposingRecordingPen(gs); gs[name].draw(p)
    out, cur = [], []
    for op, args in p.value:
        cur.append((op, args))
        if op in ("closePath", "endPath"): out.append(cur); cur = []
    return out

def bounds(cons):
    b = BoundsPen(gs)
    for c in cons:
        for op, args in c: getattr(b, op)(*args)
    return b.bounds

def replay(cons, pen, dx=0, dy=0):
    tp = TransformPen(pen, (1, 0, 0, 1, dx, dy))
    for c in cons:
        for op, args in c: getattr(tp, op)(*args)

def accent_of(composite, base):
    """The contours of `composite` that `base` does not have (the accent), compared by their bounds."""
    have = {tuple(round(v) for v in bounds([c])) for c in contours(base)}
    return [c for c in contours(composite) if tuple(round(v) for v in bounds([c])) not in have]

def arc(pen, cx, y, w, h, t):
    """A breve: a bowl open at the top, w wide, h tall, stroke t, its bottom at y."""
    k = 0.5523
    rx, ry = w / 2, h
    ix, iy = rx - t, ry - t * 0.9
    pen.moveTo((cx - rx, y + ry))
    pen.curveTo((cx - rx, y + ry - k * ry), (cx - k * rx, y), (cx, y))
    pen.curveTo((cx + k * rx, y), (cx + rx, y + ry - k * ry), (cx + rx, y + ry))
    pen.lineTo((cx + ix, y + ry))
    pen.curveTo((cx + ix, y + ry - k * iy), (cx + k * ix, y + ry - iy), (cx, y + ry - iy))
    pen.curveTo((cx - k * ix, y + ry - iy), (cx - ix, y + ry - k * iy), (cx - ix, y + ry))
    pen.closePath()

def bar(pen, cx, y, w, t):
    pen.moveTo((cx - w / 2, y)); pen.lineTo((cx + w / 2, y)); pen.lineTo((cx + w / 2, y + t)); pen.lineTo((cx - w / 2, y + t)); pen.closePath()

def centre(name):
    b = bounds(contours(name)); return (b[0] + b[2]) / 2

# where accents sit: the dieresis over o and over O
dl = bounds(accent_of("odieresis", "o")); du = bounds(accent_of("Odieresis", "O"))
stroke = (bounds(contours("l"))[2] - bounds(contours("l"))[0]) * 0.72      # accents are a little lighter than stems
# the font's own cedilla, dropped to the depth it has under ç / Ç
ced = contours("cedilla"); ced_b = bounds(ced)
def cedilla(p, cx, composite):
    replay(ced, p, cx - (ced_b[0] + ced_b[2]) / 2, bounds(contours(composite))[1] - ced_b[1])
dot = accent_of("Zdotaccent", "Z"); dot_dx = centre("Z")
dotl = accent_of("zdotaccent", "z"); dotl_dx = centre("z")

def add(name, uni, base, draw_accent):
    w = hmtx[base][0]
    # the CFF charstring stores its width relative to nominalWidthX; Safari (CoreText) reads that one, not hmtx
    pen = T2CharStringPen(w - getattr(top.Private, "nominalWidthX", 0), gs)
    replay(contours(base), pen)
    draw_accent(pen, centre(base))
    charstring = pen.getCharString(private=top.Private, globalSubrs=cff.GlobalSubrs)
    if name in cs.charStrings: return
    cs.charStringsIndex.append(charstring)
    cs.charStrings[name] = len(cs.charStringsIndex) - 1
    order = f.getGlyphOrder()
    if top.charset is not order: top.charset.append(name)    # often the same list as the glyph order
    if order[-1] != name: order.append(name)
    f.setGlyphOrder(order)
    hmtx[name] = (w, hmtx[base][1])
    for t in f["cmap"].tables:
        if t.isUnicode(): t.cmap[uni] = name

dw = lambda b: b[2] - b[0]
add("gbreve", 0x011F, "g", lambda p, cx: arc(p, cx, dl[1], dw(dl) * 0.78, (dl[3] - dl[1]) * 1.05, stroke))
add("Gbreve", 0x011E, "G", lambda p, cx: arc(p, cx, du[1], dw(du) * 0.78, (du[3] - du[1]) * 1.05, stroke))
add("scedilla", 0x015F, "s", lambda p, cx: cedilla(p, cx, "ccedilla"))
add("Scedilla", 0x015E, "S", lambda p, cx: cedilla(p, cx, "Ccedilla"))
add("Idotaccent", 0x0130, "I", lambda p, cx: replay(dot, p, cx - dot_dx))
add("emacron", 0x0113, "e", lambda p, cx: bar(p, cx, dl[1] + (dl[3] - dl[1]) * 0.3, dw(dl) * 0.85, stroke * 0.9))
add("Emacron", 0x0112, "E", lambda p, cx: bar(p, cx, du[1] + (du[3] - du[1]) * 0.3, dw(du) * 0.85, stroke * 0.9))

# a new name, as the licence asks for a changed copy
for rec in f["name"].names:
    s = rec.toUnicode()
    if "Sporting Grotesque" in s or "SportingGrotesque" in s:
        rec.string = s.replace("Sporting Grotesque", "Athena Grotesque").replace("SportingGrotesque", "AthenaGrotesque")
top.FamilyName = "Athena Grotesque"
top.FullName = top.FullName.replace("Sporting Grotesque", "Athena Grotesque")
cff.fontNames = [n.replace("SportingGrotesque", "AthenaGrotesque") for n in cff.fontNames]
f.save(out)
print("saved", out)
