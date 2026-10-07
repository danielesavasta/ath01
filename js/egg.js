// Egg section (Birth): a gallery of artworks depicting Athena's birth, described in content/egg.json.
// Pictures: assets/gallery/small/<id>.webp for the tiles and assets/gallery/large/<id>.webp for the open
// view, made from the originals in assets/gallery/ by tools/gallery/resize.py.
//
// Two mosaics, one on each side of the statue (nothing behind it, where the mask hides it), each sized to
// fill its side. A hand resting on a tile for a moment (T.settle) lifts it, and the artwork opens large with
// its story on the OTHER side of the statue, so the same hand can go on browsing: moving to a neighbour
// changes the open view. With no hand on the tiles for T.linger the view closes. With nobody there, a tile
// now and then lifts by itself, to show that they can be picked.
//
//   import { createEgg } from "./egg.js";
//   const egg = await createEgg({ stage, texts, dataUrl: "content/egg.json", imagesDir: "assets/gallery/", statueBand });
//   egg.frame(pts, dt);   // pts: [{ px, py, mouse? }] in viewport pixels, once per animation frame

import { sfx } from "./sound.js";

const W = 1920, H = 1080;
const T = {
  settle: 450,      // ms a hand rests on a tile before it opens (a shaking hand doesn't flicker)
  linger: 2500,     // ms the open view stays after the hands leave the tiles
  invite: 2600,     // ms between tiles lifting by themselves while nobody is there
  inviteAfter: 4000,// ms without hands before that starts
  gap: 10,          // px between tiles
  top: 230,         // px: the mosaics start below the hint
  bottom: 1000,     // px: and end here
  left: 280,        // px: right of the back button
  right: 1860,
  aside: 50         // px kept free beside the statue
};

function inside(r, x, y){
  return r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

// egg.json is not uniform (artist / artist_or_workshop, current_location / current_locations, ...)
function meta(a){
  const bits = [];
  const artist = a.artist || a.artist_or_workshop;
  if (artist) bits.push(artist);
  if (a.date) bits.push(a.date);
  const loc = a.current_location || (Array.isArray(a.current_locations) ? a.current_locations.join(", ") : a.current_locations);
  if (loc) bits.push(loc);
  return bits.join(" · ");
}

function loadImage(src){
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ src, ratio: img.naturalWidth / img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// rows of tiles, all the same height in a row and filling its width; the row height is the largest that
// lets every tile fit in the box
function justify(items, box, gap){
  function rows(h){
    const out = []; let row = [], w = 0;
    for (const it of items){
      const iw = it.ratio * h;
      if (row.length && w + gap + iw > box.w){ out.push(row); row = []; w = 0; }
      w += (row.length ? gap : 0) + iw; row.push(it);
    }
    if (row.length) out.push(row);
    let y = 0;
    const placed = out.map((r, i) => {
      const natural = r.reduce((s, it) => s + it.ratio * h, 0), room = box.w - gap * (r.length - 1);
      const rh = i < out.length - 1 || natural > room ? h * room / natural : h;   // the last row isn't stretched
      let x = 0;
      const cells = r.map((it) => { const c = { it, x, y, w: it.ratio * rh, h: rh }; x += c.w + gap; return c; });
      y += rh + gap;
      return { cells, width: x - gap };
    });
    return { placed, height: y - gap };
  }
  let lo = 40, hi = 400;
  for (let k = 0; k < 24; k++){ const mid = (lo + hi) / 2; if (rows(mid).height <= box.h) lo = mid; else hi = mid; }
  const { placed, height } = rows(lo);
  const dy = (box.h - height) / 2;                    // centred vertically
  const cells = [];
  for (const r of placed){
    const dx = (box.w - r.width) / 2;                 // a short last row is centred
    for (const c of r.cells) cells.push({ ...c, x: box.x + c.x + dx, y: box.y + c.y + dy });
  }
  return cells;
}

export async function createEgg(opts){
  const stage = opts.stage;
  const dataUrl = opts.dataUrl || "content/egg.json";
  const dir = opts.imagesDir || "assets/gallery/";

  const data = await fetch(dataUrl).then((r) => r.json());
  const artworks = data.artworks || [];
  await Promise.all(artworks.map(async (a) => { a.image = await loadImage(`${dir}small/${a.id}.webp`); }));

  stage.classList.add("egg-stage");
  stage.innerHTML = `<div class="egg-tiles"></div>
    <div class="egg-view">
      <div class="egg-view-pic"><img alt=""><img alt=""></div>
      <div class="egg-view-label">
        <div class="t-title stone-text egg-view-title"></div>
        <div class="t-label egg-view-meta"></div>
        <div class="t-rule"></div>
        <div class="t-body egg-view-desc"></div>
      </div>
    </div>
    <div class="egg-hint t-hint"></div>`;
  const tilesEl = stage.querySelector(".egg-tiles");
  const view = stage.querySelector(".egg-view");
  const pics = [...view.querySelectorAll(".egg-view-pic img")];
  const vTitle = view.querySelector(".egg-view-title"), vMeta = view.querySelector(".egg-view-meta"), vDesc = view.querySelector(".egg-view-desc");
  const label = view.querySelector(".egg-view-label");
  const hintEl = stage.querySelector(".egg-hint");

  let TX = opts.texts || {};
  const tiles = artworks.map((a, i) => {
    const el = document.createElement("div");
    el.className = "egg-tile";
    el.style.setProperty("--i", i);
    if (a.image) el.style.backgroundImage = `url("${a.image.src}")`;
    else { el.classList.add("egg-noimg"); el.innerHTML = `<div class="stone-text"></div><div class="t-label"></div>`; el.firstChild.textContent = a.title || ""; }
    el.innerHTML += `<i class="egg-settle"></i>`;
    tilesEl.appendChild(el);
    const side = i % 2 ? "right" : "left";
    el.classList.add("side-" + side);
    return { a, el, i, side, ratio: a.image ? a.image.ratio : 1, rect: null, rest: 0 };
  });

  function applyTexts(){
    hintEl.textContent = TX.hint || "";
    tiles.forEach((t) => { if (!t.a.image) t.el.lastChild.previousSibling.textContent = TX.noImage || ""; });
  }

  // ───────────── layout: one mosaic each side of the statue ─────────────
  let band = [700, 1240];
  const pct = (v, of) => (v / of * 100).toFixed(3) + "%";
  function relayout(){
    const b = opts.statueBand && opts.statueBand();
    band = b ? [(b[0] + 1) / 2 * W, (b[1] + 1) / 2 * W] : [700, 1240];
    const zone = {
      left:  { x: T.left, y: T.top, w: band[0] - T.aside - T.left, h: T.bottom - T.top },
      right: { x: band[1] + T.aside, y: T.top, w: T.right - band[1] - T.aside, h: T.bottom - T.top }
    };
    for (const side of ["left", "right"]){
      const cells = justify(tiles.filter((t) => t.side === side), zone[side], T.gap);
      for (const c of cells){
        const s = c.it.el.style;
        s.left = pct(c.x, W); s.top = pct(c.y, H); s.width = pct(c.w, W); s.height = pct(c.h, H);
      }
    }
    // the open view takes the whole of a side
    stage.style.setProperty("--zl-x", pct(zone.left.x, W)); stage.style.setProperty("--zl-w", pct(zone.left.w, W));
    stage.style.setProperty("--zr-x", pct(zone.right.x, W)); stage.style.setProperty("--zr-w", pct(zone.right.w, W));
    stage.style.setProperty("--z-y", pct(zone.left.y, H)); stage.style.setProperty("--z-h", pct(zone.left.h, H));
  }

  // ───────────── the open view ─────────────
  let open = null, viewSide = null, pic = 0, linger = 0, idle = 0, inviteT = 0, invited = null, running = false, rectAge = 0;
  function show(t){
    if (open === t) return;
    const first = !open;
    open = t;
    sfx("tile", { x: t.side === "left" ? 500 : 1420 });
    viewSide = t.side === "left" ? "right" : "left";
    stage.classList.toggle("view-left", viewSide === "left");
    stage.classList.toggle("view-right", viewSide === "right");
    // the next picture fades in over the last one; the text changes while it is faded out
    pic = 1 - pic;
    const img = pics[pic], other = pics[1 - pic];
    img.classList.remove("in");
    img.onload = () => { img.classList.add("in"); other.classList.remove("in"); };
    img.src = `${opts.imagesDir || "assets/gallery/"}large/${t.a.id}.webp`;
    if (!t.a.image) { img.removeAttribute("src"); other.classList.remove("in"); }
    label.classList.remove("in");
    clearTimeout(label._t);
    label._t = setTimeout(() => {
      vTitle.textContent = t.a.title || "";
      vMeta.textContent = meta(t.a);
      vDesc.textContent = t.a.scene_description || t.a.importance || "";
      label.classList.add("in");
    }, first ? 0 : 250);
    view.classList.add("open");
    tiles.forEach((x) => x.el.classList.toggle("open", x === t));
  }
  function close(){
    if (!open) return;
    open = null;
    view.classList.remove("open");
    stage.classList.remove("view-left", "view-right");
    tiles.forEach((x) => x.el.classList.remove("open"));
  }

  // ───────────── per frame ─────────────
  function frame(pts, dt){
    if (!running) return;
    rectAge += dt;   // where the tiles are on screen, refreshed now and then (cheaper than every frame)
    if (rectAge > 400 || !tiles[0].rect || tiles[0].rect.width === 0){ rectAge = 0; tiles.forEach((t) => { t.rect = t.el.getBoundingClientRect(); }); }
    const under = new Set();
    for (const p of pts){
      for (const t of tiles){
        if (viewSide && t.side === viewSide) continue;   // that side is covered by the open view
        if (inside(t.rect, p.px, p.py)){ under.add(t); break; }
      }
    }
    for (const t of tiles){
      t.rest = under.has(t) ? t.rest + dt : 0;
      t.el.classList.toggle("near", under.has(t) && t !== open);
      t.el.style.setProperty("--settle", Math.min(t.rest / T.settle, 1).toFixed(3));
    }
    // the tile rested on longest (and long enough) opens
    let best = null;
    for (const t of under) if (t.rest >= T.settle && (!best || t.rest < best.rest)) best = t;
    if (best && best !== open) show(best);

    // closing: no hand on any tile for a while
    linger = under.size ? 0 : linger + dt;
    if (open && linger > T.linger) close();

    // nobody there: now and then a tile lifts by itself
    idle = pts.length ? 0 : idle + dt;
    inviteT += dt;
    const inviting = !open && idle > T.inviteAfter;
    if (inviting && inviteT > T.invite){
      inviteT = 0;
      if (invited) invited.el.classList.remove("invite");
      invited = tiles[Math.floor(Math.random() * tiles.length)];
      invited.el.classList.add("invite");
    } else if (!inviting && invited){ invited.el.classList.remove("invite"); invited = null; }
  }

  function reset(){
    close();
    linger = 0; idle = 0; inviteT = 0;
    tiles.forEach((t) => { t.rest = 0; t.el.classList.remove("near", "invite"); });
    invited = null;
    pics.forEach((p) => { p.classList.remove("in"); p.removeAttribute("src"); });
  }

  relayout();
  applyTexts();
  window.addEventListener("resize", () => tiles.forEach((t) => { t.rect = null; }));

  return {
    start(){
      running = true;
      tiles.forEach((t) => { t.rect = null; });
      stage.classList.remove("shown"); void stage.offsetWidth; stage.classList.add("shown");   // the tiles come in one by one
    },
    stop(){ running = false; close(); },
    reset,
    get running(){ return running; },
    setTexts(t){ TX = t || {}; applyTexts(); },
    frame,
    relayout(){ relayout(); tiles.forEach((t) => { t.rect = null; }); },
    timing: T
  };
}
