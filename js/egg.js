// Egg section (Birth): a gallery of artworks depicting Athena's birth, described in content/egg.json
// (English fields, and Turkish in each work's "tr": { title, meta, text }).
// Pictures: assets/gallery/small/<id>.webp while floating, assets/gallery/large/<id>.webp when brought forward,
// made from the originals in assets/gallery/ by tools/gallery/resize.py.
//
// The works float in one dark space across the whole wall, the statue standing in front of it: each at its own
// depth and drifting slowly nearer and further, seen in perspective (far ones small, dim and gathered towards the
// middle, behind the statue, where the mask hides them; near ones large, bright and spread out). A hand resting
// on a work for a moment (T.settle) brings it to the front on its side of the statue, large, with its name,
// place and story in the visitor's language; the others on that side sink back. Moving off it, it goes back
// after T.linger. Each side brings one work forward on its own, so two visitors can read at once.
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
  near: 250,         // px: the height of a work at the front of the space (depth 0)
  far: 0.3,          // a work at the back is this much the size of one at the front
  dimFar: 0.28,      // and this bright
  wander: 14,        // px/s: how fast a work wanders through the space (on the front plane)
  wanderZ: 0.012,    // per s: how fast it drifts nearer or further (depth 0..1)
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
      side: "left", ratio: a.image ? a.image.ratio : 1,   // side: where it comes forward, set when it does
      home: null, vel: { x: (Math.random() - 0.5) * 16, y: (Math.random() - 0.5) * 10, z: (Math.random() - 0.5) * 0.02 },
      f: 0,                 // 0 floating at its place … 1 at the front of its side
      rest: 0, box: null, large: false, fwd: {}
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

  // ───────────── the space: the whole wall, in perspective around its centre ─────────────
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
    // places on the front plane, wider than the wall: seen from further back they gather towards the middle
    scatter(works.length, { x: -180, y: 120, w: W + 360, h: H - 160 }, rand).forEach((p, i) => { works[i].home = p; });
    for (const w of works){
      for (const side of ["left", "right"]){   // its size and place when it comes forward on either side
        const z = zone[side], maxH = z.h - T.textH, bw = Math.min(z.w, maxH * w.ratio), bh = bw / w.ratio;
        w.fwd[side] = { x: z.x + (z.w - bw) / 2, y: z.y, w: bw, h: bh, zw: z.w };
      }
      setSide(w, w.side);
    }
  }
  // each work is laid out once at its forward size (for the side it comes forward on) and only moved and
  // scaled after that, which is cheap to animate
  function setSide(w, side){
    w.side = side;
    const f = w.fwd[side];
    w.el.style.setProperty("--bw", f.w.toFixed(1));
    w.el.style.setProperty("--bh", f.h.toFixed(1));
    w.el.style.setProperty("--zw", f.zw.toFixed(1));
    w.el.style.setProperty("--tx", ((f.zw - f.w) / 2).toFixed(1));
  }

  // where a work is now: floating at its place, or brought to the front of its side
  function place(w, t){
    const h = w.home;
    const k = ease(w.f);
    // which side of the statue it is on now
    const side = w.box && w.box.cx > (band[0] + band[1]) / 2 ? "right" : "left";
    // while another work is forward on its side, it sinks back and almost out of sight
    const behind = opened[side] && opened[side] !== w ? openK[side] : 0;
    // floating: its depth (which wanders, see frame) sets its size and brightness
    const depth = clamp01(h.z + 0.35 * behind);
    const s = lerp(1, T.far, depth);
    const fh = Math.min(T.near, 620 / w.ratio) * s, fw = fh * w.ratio;   // wide works (pediments) a little lower
    // its place on the front plane, seen in perspective from the middle of the wall
    const cx = W / 2 + (h.x - W / 2) * s, cy = H / 2 + (h.y - H / 2) * s;
    const fx = cx - fw / 2, fy = cy - fh / 2;
    // forward: as large as fits its side above its texts
    const { x: bx, y: by, w: bw, h: bh } = w.fwd[w.side];
    return {
      x: lerp(fx, bx, k), y: lerp(fy, by, k), w: lerp(fw, bw, k), h: lerp(fh, bh, k), cx: lerp(cx, bx + bw / 2, k), behindStatue: cx > band[0] && cx < band[1],
      bright: lerp(lerp(1, T.dimFar, clamp01(depth)) * (1 - 0.88 * behind), 1, k),
      depth: lerp(depth, -1, k)
    };
  }

  // ───────────── per frame ─────────────
  const opened = { left: null, right: null }, openK = { left: 0, right: 0 };
  let running = false, idle = 0, inviteT = 0, invited = null, linger = { left: 0, right: 0 };

  function bringForward(w){
    const side = w.box && w.box.cx > (band[0] + band[1]) / 2 ? "right" : "left";
    if (opened[side] !== w && w.f < 0.05) setSide(w, side);
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
        if (!w.box || w.box.behindStatue || !inside(w.box, p.x, p.y)) continue;
        const side = w.box.cx > (band[0] + band[1]) / 2 ? "right" : "left";
        if (opened[side] && opened[side] !== w) continue;   // the side's forward work covers the rest
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

    // every work wanders very slowly through the space: a velocity that turns a little at random, turning back
    // at the edges of the space (front plane wider than the wall, depth 0.05..1)
    const sec = dt / 1000;
    for (const w of works){
      const h = w.home, v = w.vel;
      v.x += (Math.random() - 0.5) * T.wander * 0.6 * sec; v.y += (Math.random() - 0.5) * T.wander * 0.6 * sec;
      v.z += (Math.random() - 0.5) * T.wanderZ * 0.6 * sec;
      const sp = Math.hypot(v.x, v.y);
      if (sp > T.wander){ v.x *= T.wander / sp; v.y *= T.wander / sp; }
      v.z = Math.max(-T.wanderZ, Math.min(T.wanderZ, v.z));
      h.x += v.x * sec; h.y += v.y * sec; h.z += v.z * sec;
      if (h.x < -180 && v.x < 0 || h.x > W + 180 && v.x > 0) v.x *= -1;
      if (h.y < 140 && v.y < 0 || h.y > H - 60 && v.y > 0) v.y *= -1;
      if (h.z < 0.05 && v.z < 0 || h.z > 1 && v.z > 0) v.z *= -1;
    }

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
      st.setProperty("--s", (b.w / w.fwd[w.side].w).toFixed(4));
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
