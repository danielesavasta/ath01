// Egg section (Birth): a gallery of artworks depicting Athena's birth, described in content/egg.json
// (English fields, and Turkish in each work's "tr": { title, meta, text }).
// Pictures: assets/gallery/small/<id>.webp while floating, assets/gallery/large/<id>.webp when brought forward,
// made from the originals in assets/gallery/ by tools/gallery/resize.py.
//
// The works float in a dark space on both sides of the statue (never behind it, where the mask hides it),
// each at its own depth: near ones large and bright, far ones small and dim, all drifting slowly. A hand
// resting on a work for a moment (T.settle) brings it to the front of its side, large, with its name, place
// and story in the visitor's language; the others on that side sink back. Moving off it, it goes back to its
// place after T.linger. The other side stays free, so a second visitor can bring one forward there.
//
//   import { createEgg } from "./egg.js";
//   const egg = await createEgg({ stage, texts, dataUrl: "content/egg.json", imagesDir: "assets/gallery/", statueBand });
//   egg.frame(pts, dt);   // pts: [{ px, py, mouse? }] in viewport pixels, once per animation frame

import { sfx } from "./sound.js";

const W = 1920, H = 1080;
const T = {
  settle: 500,       // ms a hand rests on a work before it comes forward
  linger: 2200,      // ms the work stays forward after the hand leaves it
  fly: 0.0032,       // how fast a work comes forward / goes back (per ms, eased)
  near: 240,         // px: the height of a work at the front of the space (depth 0)
  far: 0.34,         // a work at the back is this much the size of one at the front
  dimFar: 0.28,      // and this bright
  drift: 18,         // px a work wanders around its place
  invite: 3200,      // ms between works drifting forward by themselves while nobody is there
  inviteAfter: 4000, // ms without hands before that starts
  top: 210,          // px: the space starts below the hint
  bottom: 1010,      // px
  left: 270,         // px: right of the back button
  right: 1880,
  aside: 40,         // px kept free beside the statue
  textH: 380         // px under a work brought forward, for its texts
};

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => k * k * (3 - 2 * k);
const inside = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

// egg.json is not uniform (artist / artist_or_workshop, current_location / current_locations, ...)
function metaEn(a){
  const bits = [];
  const artist = a.artist || a.artist_or_workshop;
  if (artist) bits.push(artist);
  if (a.date) bits.push(a.date);
  const loc = a.current_location || (Array.isArray(a.current_locations) ? a.current_locations.join(", ") : a.current_locations);
  if (loc) bits.push(loc);
  return bits.join(" · ");
}
function textsOf(a, lang){
  if (lang === "tr" && a.tr) return a.tr;
  return { title: a.title || "", meta: metaEn(a), text: a.scene_description || a.importance || "" };
}

function loadImage(src){
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ src, ratio: img.naturalWidth / img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// places for n works in a box, spread out (best of a few random tries each), with a depth each
function scatter(n, box, rand){
  const pts = [];
  for (let i = 0; i < n; i++){
    let best = null, bestD = -1;
    for (let k = 0; k < 24; k++){
      const p = { x: box.x + rand() * box.w, y: box.y + rand() * box.h };
      const d = pts.reduce((m, q) => Math.min(m, Math.hypot((p.x - q.x) / box.w, (p.y - q.y) / box.h)), 9);
      if (d > bestD){ bestD = d; best = p; }
    }
    pts.push(best);
  }
  // depths spread evenly from front to back, in a shuffled order
  const depths = pts.map((_, i) => 0.08 + 0.92 * i / Math.max(1, n - 1)).sort(() => rand() - 0.5);
  return pts.map((p, i) => ({ ...p, z: depths[i] }));
}

export async function createEgg(opts){
  const stage = opts.stage;
  const dataUrl = opts.dataUrl || "content/egg.json";
  const dir = opts.imagesDir || "assets/gallery/";

  const data = await fetch(dataUrl).then((r) => r.json());
  const artworks = data.artworks || [];
  await Promise.all(artworks.map(async (a) => { a.image = await loadImage(`${dir}small/${a.id}.webp`); }));

  stage.classList.add("egg-stage");
  stage.innerHTML = `<div class="egg-space"></div><div class="egg-hint t-hint"></div>`;
  const space = stage.querySelector(".egg-space");
  const hintEl = stage.querySelector(".egg-hint");

  let TX = opts.texts || {}, lang = "tr";
  const works = artworks.map((a, i) => {
    const el = document.createElement("div");
    el.className = "egg-work";
    el.innerHTML = `<div class="egg-pic"><img alt=""><i class="egg-shade"></i><i class="egg-settle"></i></div>
      <div class="egg-text"><div class="t-title stone-text egg-title"></div><div class="t-label egg-meta"></div><div class="t-rule"></div><div class="t-body egg-desc"></div></div>`;
    const img = el.querySelector("img");
    if (a.image) img.src = a.image.src; else el.classList.add("egg-noimg");
    space.appendChild(el);
    return {
      a, el, img, pic: el.querySelector(".egg-pic"), text: el.querySelector(".egg-text"),
      side: i % 2 ? "right" : "left", ratio: a.image ? a.image.ratio : 1,
      home: null, phase: Math.random() * Math.PI * 2, speed: 0.6 + Math.random() * 0.6,
      f: 0,                 // 0 floating at its place … 1 at the front of its side
      rest: 0, box: null, large: false, fwd: null
    };
  });

  function fillTexts(w){
    const t = textsOf(w.a, lang);
    w.el.querySelector(".egg-title").textContent = t.title;
    w.el.querySelector(".egg-meta").textContent = t.meta;
    w.el.querySelector(".egg-desc").textContent = t.text;
  }
  function applyTexts(){
    hintEl.textContent = TX.hint || "";
    works.forEach(fillTexts);
  }

  // ───────────── the space: two sides of the statue ─────────────
  let band = [700, 1240], zone = {};
  function relayout(){
    const b = opts.statueBand && opts.statueBand();
    band = b ? [(b[0] + 1) / 2 * W, (b[1] + 1) / 2 * W] : [700, 1240];
    zone = {
      left:  { x: T.left, y: T.top, w: band[0] - T.aside - T.left, h: T.bottom - T.top },
      right: { x: band[1] + T.aside, y: T.top, w: T.right - band[1] - T.aside, h: T.bottom - T.top }
    };
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (const side of ["left", "right"]){
      const list = works.filter((w) => w.side === side), z = zone[side];
      // places are for the works' centres, kept far enough in that a near (large) work still fits
      const inner = { x: z.x + T.near * 0.45, y: z.y + T.near * 0.5, w: Math.max(10, z.w - T.near * 0.9), h: Math.max(10, z.h - T.near) };
      scatter(list.length, inner, rand).forEach((p, i) => { list[i].home = p; });
      // each work is laid out once at its forward size and only moved and scaled after that (cheap to animate)
      for (const w of list){
        const maxH = z.h - T.textH, bw = Math.min(z.w, maxH * w.ratio), bh = bw / w.ratio;
        w.fwd = { x: z.x + (z.w - bw) / 2, y: z.y, w: bw, h: bh };
        w.el.style.setProperty("--bw", bw.toFixed(1));
        w.el.style.setProperty("--bh", bh.toFixed(1));
        w.el.style.setProperty("--zw", z.w.toFixed(1));
        w.el.style.setProperty("--tx", ((z.w - bw) / 2).toFixed(1));
      }
    }
  }

  // where a work is now: floating at its place, or brought to the front of its side
  function place(w, t){
    const h = w.home, z = zone[w.side];
    const k = ease(w.f);
    // floating: its depth sets its size and brightness; it wanders slowly around its place
    const depth = h.z + (opened[w.side] && opened[w.side] !== w ? 0.35 * openK[w.side] : 0);   // the others sink back
    const s = lerp(1, T.far, clamp01(depth));
    const fh = Math.min(T.near, z.w * 0.55 / w.ratio) * s, fw = fh * w.ratio;   // wide works (pediments) a little lower
    // it wanders around its place but never out of its side (never behind the statue)
    const fx = Math.max(z.x, Math.min(z.x + z.w - fw, h.x + Math.sin(t * 0.00021 * w.speed + w.phase) * T.drift - fw / 2));
    const fy = Math.max(z.y, Math.min(z.y + z.h - fh, h.y + Math.cos(t * 0.00017 * w.speed + w.phase * 1.3) * T.drift * 0.7 - fh / 2));
    // while another work of its side is forward, it sinks back and almost out of sight
    const behind = opened[w.side] && opened[w.side] !== w ? openK[w.side] : 0;
    // forward: as large as fits the side above its texts
    const { x: bx, y: by, w: bw, h: bh } = w.fwd;
    return {
      x: lerp(fx, bx, k), y: lerp(fy, by, k), w: lerp(fw, bw, k), h: lerp(fh, bh, k),
      bright: lerp(lerp(1, T.dimFar, clamp01(depth)) * (1 - 0.88 * behind), 1, k),
      depth: lerp(depth, -1, k)
    };
  }

  // ───────────── per frame ─────────────
  const opened = { left: null, right: null }, openK = { left: 0, right: 0 };
  let running = false, idle = 0, inviteT = 0, invited = null, linger = { left: 0, right: 0 };

  function bringForward(w){
    const side = w.side;
    if (opened[side] === w) return;
    opened[side] = w;
    linger[side] = 0;
    sfx("tile", { x: side === "left" ? 500 : 1420 });
    fillTexts(w);
    if (!w.large && w.a.image){   // the sharp picture, once it has loaded
      w.large = true;
      const big = new Image();
      big.onload = () => { w.img.src = big.src; };
      big.src = `${dir}large/${w.a.id}.webp`;
    }
  }

  function frame(pts, dt){
    if (!running) return;
    const t = performance.now();
    const r = stage.getBoundingClientRect();
    const toFrame = (p) => ({ x: (p.px - r.left) / r.width * W, y: (p.py - r.top) / r.height * H });
    const hands = pts.map(toFrame);

    // which work each hand is on: the nearest (frontmost) under it
    const under = new Set();
    for (const p of hands){
      let best = null;
      for (const w of works){
        if (!w.box || !inside(w.box, p.x, p.y)) continue;
        if (opened[w.side] && opened[w.side] !== w) continue;   // the side's forward work covers the rest
        if (!best || w.box.depth < best.box.depth) best = w;
      }
      if (best) under.add(best);
    }
    for (const w of works){
      w.rest = under.has(w) ? w.rest + dt : 0;
      if (w.rest >= T.settle && opened[w.side] !== w) bringForward(w);
    }
    // a forward work goes back once no hand has been on it for a while
    for (const side of ["left", "right"]){
      const w = opened[side];
      if (!w) continue;
      linger[side] = under.has(w) ? 0 : linger[side] + dt;
      if (linger[side] > T.linger) opened[side] = null;
    }

    // nobody there: now and then a work drifts forward a little by itself
    idle = hands.length ? 0 : idle + dt;
    inviteT += dt;
    if (idle > T.inviteAfter && inviteT > T.invite){ inviteT = 0; invited = works[Math.floor(Math.random() * works.length)]; }
    if (idle <= T.inviteAfter) invited = null;

    // move everything
    for (const side of ["left", "right"]) openK[side] += ((opened[side] ? 1 : 0) - openK[side]) * Math.min(1, dt * T.fly);
    for (const w of works){
      const goal = opened[w.side] === w ? 1 : (w === invited && inviteT < T.invite * 0.6 ? 0.12 : 0);
      w.f += (goal - w.f) * Math.min(1, dt * T.fly);
      const b = place(w, t);
      w.box = b;
      const st = w.el.style;
      st.setProperty("--x", b.x.toFixed(1));
      st.setProperty("--y", b.y.toFixed(1));
      st.setProperty("--s", (b.w / w.fwd.w).toFixed(4));
      st.setProperty("--shade", (1 - b.bright).toFixed(3));
      w.el.style.setProperty("--settle", clamp01(w.rest / T.settle).toFixed(3));
      w.el.style.zIndex = String(1000 - Math.round(b.depth * 500));
      w.el.classList.toggle("near", under.has(w) && opened[w.side] !== w);
      w.el.classList.toggle("forward", opened[w.side] === w && w.f > 0.6);
    }
  }

  function reset(){
    opened.left = opened.right = null; openK.left = openK.right = 0;
    linger = { left: 0, right: 0 }; idle = 0; inviteT = 0; invited = null;
    works.forEach((w) => { w.f = 0; w.rest = 0; w.el.classList.remove("near", "forward"); });
  }

  relayout();
  applyTexts();

  return {
    start(){
      running = true;
      stage.classList.remove("shown"); void stage.offsetWidth; stage.classList.add("shown");   // the works come up out of the dark
    },
    stop(){ running = false; reset(); },
    reset,
    get running(){ return running; },
    setTexts(t){ TX = t || {}; lang = TX.lang || lang; applyTexts(); },
    frame,
    relayout,
    timing: T
  };
}
