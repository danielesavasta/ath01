// Mind section (mētis). The story is told one sentence at a time (content/texts.js,
// mind.lines) while an olive grows beside the statue, from the seed to a full tree, then a branch that buds
// and flowers. The drawings come from Daniele's olive plate (refs/olive-plate.png), cut into single frames by
// tools/olive/slice.py into assets/mind/<page><row><col>.png. After the last sentence the picture stays for
// T.hold and fades out; then `done` turns true and js/sections.js goes back to the menu.
//
// The olive is drawn by particles: a few thousand fine points, each resting on the drawing in the drawing's own
// colour. When the next drawing comes they flow over, each on a gently curved path and a little after the others,
// changing colour on the way, and settle into its shape. At rest they shimmer very slightly. After each sentence's
// drawings the olive rests a moment (T.rest) before the next sentence.
//
// The only gesture, and a slight one: a hand in front of the olive parts the points like leaves in the wind. They
// slip aside around it (and along with it when it moves), brighten a little while they move, and spring back.
//
//   import { createMind } from "./mind.js";
//   const mind = createMind({ stage, texts, statueBand });
//   mind.frame(pts, dt);   // pts: [{ px, py, mouse? }] in viewport pixels, once per animation frame
//
// Drawn on one 2D canvas the size of the 1920×1080 frame; everything below is in frame pixels.

import { sfx } from "./sound.js";

const W = 1920, H = 1080;

const T = {
  line: 7500,      // ms each sentence's drawings are spread over; K → Mind overrides
  rest: 2000,      // ms the finished drawing rests before the next sentence comes; K → Mind overrides
  hold: 4000,      // ms the last sentence and flower stay before the section closes
  out: 1200,       // ms the picture and sentence take to fade out at the end
  height: 1000,     // px the tallest drawing is drawn at (the plate's cells are ~250 px tall)
  left: 300,       // px: the olive is centred between this (right of the back button) and the statue
  ground: 930,     // px: the drawings stand on this line
  grow: [0.5, 1],  // the seedling is drawn this much smaller than the tree, growing in between
  particles: 30000,  // points that draw the olive; K → Mind overrides
  dot: 2,          // px, each point's size
  morph: 2800,     // ms the points take to flow into the next drawing; K → Mind overrides
  flowShare: 0.8,  // a flow takes at most this share of the time until the next drawing
  stagger: 0.4,    // share of the flow over which the points set off one after another
  swirl: 70,       // px the flow's paths curve aside
  shimmer: 0.6,    // px the points tremble at rest
  // hands parting the points
  reach: 120,      // px around a hand that the points feel it
  push: 1000,      // px/s² they are pushed away from its middle
  sweep: 2.2,      // how much of a moving hand's speed they take along
  spring: 14,      // 1/s² pulling them back to their place
  damp: 4.5,       // 1/s their motion dies down
  glow: 0.5        // how much brighter a fast-moving point gets
};

// the drawings for each sentence, in the order of mind.lines (plate pages a–d, row, column)
const CHAPTERS = [
  ["b11", "b12", "b13"],                              // the seed opens
  ["b21", "b22", "b23", "b31"],                       // the seedling
  ["b32", "b33", "b41", "b42", "b43"],                // the tree
  ["c11", "c12", "d11", "d12", "d13"],                // a branch buds
  ["d21", "d22", "d23", "d31", "d33", "d41", "d43"]   // and flowers
];
const TREE = 3;   // the first chapters grow as one tree; the rest is a close-up

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ease = (t) => t * t * (3 - 2 * t);

function roman(n){
  return ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"][n] || String(n);
}

export function createMind(opts){
  const stage = opts.stage;
  const dir = opts.imagesDir || "assets/mind/";
  stage.classList.add("mind-stage");
  stage.innerHTML = `
    <canvas class="mind-canvas" width="${W}" height="${H}"></canvas>
    <div class="mind-species t-label"></div>
    <div class="mind-line"><div class="t-label count"></div><div class="t-rule"></div><div class="t-sentence text"></div></div>`;
  const cv = stage.querySelector(".mind-canvas"), g = cv.getContext("2d");
  const speciesEl = stage.querySelector(".mind-species");
  const lineEl = stage.querySelector(".mind-line");
  const lineCount = lineEl.querySelector(".count"), lineText = lineEl.querySelector(".text");

  // every drawing with the time it comes in and its size on the wall
  const steps = [];
  const treeCount = CHAPTERS.slice(0, TREE).flat().length;
  CHAPTERS.forEach((names, c) => names.forEach((name, i) => {
    const img = new Image();
    img.src = dir + name + ".png";
    const n = steps.length;   // drawings of the tree so far
    steps.push({
      img, chapter: c,
      chapter: c, index: i, of: names.length,
      grow: c < TREE ? T.grow[0] + (T.grow[1] - T.grow[0]) * n / (treeCount - 1) : 1
    });
  }));
  // the pace: from the room settings (K, Mind) when there are any, else T; read each time Mind opens
  // A chapter lasts line + rest: its drawings come over `line`, then the last one rests.
  let line = T.line, rest = T.rest, chapter = T.line + T.rest, morph = T.morph, storyEnd = 0;
  function schedule(){
    const m = (opts.settings && opts.settings()) || {};
    line = (m.line || T.line / 1000) * 1000;
    rest = (m.rest ?? T.rest / 1000) * 1000;
    chapter = line + rest;
    morph = (m.morph || T.morph / 1000) * 1000;
    for (const s of steps){
      const gap = line / s.of;
      s.at = s.chapter * chapter + s.index * gap;
      // the flow into this drawing: as set, but over before the next drawing starts, so each one forms and rests
      s.morph = Math.min(s.index === 0 && s.chapter === TREE ? morph * 1.4 : morph, gap * T.flowShare);
    }
    storyEnd = (CHAPTERS.length - 1) * chapter + line + T.hold;   // the last chapter's rest is the hold
    const want = m.particles || T.particles;
    if (want !== P){ alloc(want); sampled = false; }
  }

  let TX = opts.texts || {};
  let band = [700, 1240];
  let t = 0, shown = 0, done = false, running = false, swap = 0, scale = 0, lastStep = -1;

  const oliveX = () => (T.left + band[0]) / 2;

  function relayout(){
    const b = opts.statueBand && opts.statueBand();
    band = b ? [(b[0] + 1) / 2 * W, (b[1] + 1) / 2 * W] : [700, 1240];
    // the olive in the middle of the space between the back button and the statue, the sentences right of it
    stage.style.setProperty("--olive-x", oliveX().toFixed(0));
    stage.style.setProperty("--line-x", (band[1] + 80).toFixed(0));
    stage.style.setProperty("--line-w", Math.max(360, W - band[1] - 80 - 80).toFixed(0));
  }

  // the plate's cells are all about the same height; the tallest drawing sets the scale
  function measure(){
    const tallest = Math.max(...steps.map((s) => s.img.naturalHeight || 0));
    if (tallest > 0) scale = T.height / tallest;
  }

  function renderLine(){
    const lines = TX.lines || [];
    lineCount.innerHTML = shown ? `${roman(shown)}&nbsp;&nbsp;/&nbsp;&nbsp;${roman(lines.length)}` : "";
    lineText.textContent = shown ? lines[shown - 1] || "" : "";
    lineEl.classList.toggle("in", shown > 0);
  }
  function applyTexts(){
    speciesEl.textContent = TX.species || "";
    renderLine();
  }
  // the old sentence fades out, then the new one fades in
  function showLine(n){
    shown = n;
    if (n > 0) sfx("line");
    lineEl.classList.remove("in");
    clearTimeout(swap);
    swap = setTimeout(renderLine, n > 1 ? 700 : 60);
  }

  // ───────────── particles ─────────────
  // each drawing, sampled once: where its points go and their colours (frame px), in the same order for all
  // drawings (sorted from the ground up, so the flow keeps the tree's shape: roots stay low, crowns high)
  // ox/oy/vx/vy: how far a hand has pushed each point from its place, and how fast it moves
  let P = 0, px, py, pr, pg, pb, sx, sy, sr, sg, sb, cxp, cyp, delay, seed, ox, oy, vx, vy;
  function alloc(n){
    P = n;
    const f = () => new Float32Array(P);
    px = f(); py = f(); pr = f(); pg = f(); pb = f(); sx = f(); sy = f(); sr = f(); sg = f(); sb = f();
    cxp = f(); cyp = f(); delay = f(); seed = f(); ox = f(); oy = f(); vx = f(); vy = f();
    for (let i = 0; i < P; i++) seed[i] = Math.random() * Math.PI * 2;
  }
  let sampled = false, from = -1, to = -1, morphAt = 0, morphMs = T.morph;
  let box = { x: 0, y: 0, w: 1, h: 1 }, buf = null, buf32 = null;

  function sample(){
    if (!scale || steps.some((s) => !s.img.complete || !s.img.naturalWidth)) return false;
    const off = document.createElement("canvas"), oc = off.getContext("2d", { willReadFrequently: true });
    let x0 = W, y0 = H, x1 = 0, y1 = 0;
    for (const s of steps){
      const k = scale * s.grow, w = Math.max(1, Math.round(s.img.naturalWidth * k)), h = Math.max(1, Math.round(s.img.naturalHeight * k));
      off.width = w; off.height = h;
      oc.clearRect(0, 0, w, h); oc.drawImage(s.img, 0, 0, w, h);
      const d = oc.getImageData(0, 0, w, h).data;
      const left = oliveX() - w / 2, top = T.ground - h, cand = [];
      for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2){
        const a = d[(y * w + x) * 4 + 3];
        if (a > 140 && Math.random() < 0.85) cand.push(y * w + x);
      }
      const n = cand.length || 1;
      s.tx = new Float32Array(P); s.ty = new Float32Array(P); s.tr = new Float32Array(P); s.tg = new Float32Array(P); s.tb = new Float32Array(P);
      const pick = [];
      for (let i = 0; i < P; i++) pick.push(cand[Math.floor(Math.random() * n)] || 0);
      pick.sort((a, b) => Math.floor(b / w) - Math.floor(a / w) + (Math.random() - 0.5) * 40);   // ground first
      pick.forEach((q, i) => {
        const x = q % w, y = Math.floor(q / w), o = q * 4;
        s.tx[i] = left + x; s.ty[i] = top + y;
        s.tr[i] = Math.min(255, d[o] * 1.12); s.tg[i] = Math.min(255, d[o + 1] * 1.12); s.tb[i] = Math.min(255, d[o + 2] * 1.12);
      });
      x0 = Math.min(x0, left); y0 = Math.min(y0, top); x1 = Math.max(x1, left + w); y1 = Math.max(y1, top + h);
    }
    // only the part of the frame the olive can reach is drawn each frame
    const m = T.swirl + T.reach;   // room for the flow's curves and for points a hand pushes out
    box = { x: Math.max(0, Math.floor(x0 - m)), y: Math.max(0, Math.floor(y0 - m)) };
    box.w = Math.min(W, Math.ceil(x1 + m)) - box.x; box.h = Math.min(H, Math.ceil(y1 + m)) - box.y;
    buf = g.createImageData(box.w, box.h); buf32 = new Uint32Array(buf.data.buffer);
    // before the first drawing the points lie scattered low on the ground, like seed
    for (let i = 0; i < P; i++){
      px[i] = oliveX() + (Math.random() - 0.5) * 500; py[i] = T.ground - Math.random() * 40;
      pr[i] = 60; pg[i] = 50; pb[i] = 40;
      ox[i] = oy[i] = vx[i] = vy[i] = 0;
    }
    return true;
  }

  // the points set off from where they are now towards drawing `n`
  function morphTo(n, ms){
    from = to; to = n; morphAt = t; morphMs = ms;
    const s = steps[n];
    for (let i = 0; i < P; i++){
      sx[i] = px[i]; sy[i] = py[i]; sr[i] = pr[i]; sg[i] = pg[i]; sb[i] = pb[i];
      // a control point beside the straight path: the flow curves a little, each point its own way
      const mx = (sx[i] + s.tx[i]) / 2, my = (sy[i] + s.ty[i]) / 2, a = seed[i];
      cxp[i] = mx + Math.cos(a) * T.swirl; cyp[i] = my + Math.sin(a) * T.swirl * 0.6;
      delay[i] = (i / P) * T.stagger + Math.random() * 0.08;   // from the ground up, a little uneven
    }
  }

  // the hands in frame px, with their speed (px/s) from the nearest hand of the frame before
  let hands = [], stirred = 0;
  function trackHands(pts, dt){
    const r = stage.getBoundingClientRect();
    if (!r.width) return;
    const prev = hands;
    hands = pts.map((p) => {
      const x = (p.px - r.left) / r.width * W, y = (p.py - r.top) / r.height * H;
      let best = null, bd = 160 * 160;
      for (const q of prev){ const d = (q.x - x) ** 2 + (q.y - y) ** 2; if (d < bd){ bd = d; best = q; } }
      const k = dt > 0 ? 1000 / dt : 0;
      return { x, y, vx: best ? (x - best.x) * k : 0, vy: best ? (y - best.y) * k : 0 };
    });
    // a soft rustle when a hand sweeps through the olive
    for (const h of hands){
      const fast = Math.hypot(h.vx, h.vy);
      if (fast > 250 && h.x > box.x && h.x < box.x + box.w && h.y > box.y && h.y < box.y + box.h)
        sfx("stir", { x: h.x, v: Math.min(1, fast / 1500) });
    }
  }

  // the hands push the points aside; a spring brings them back (ox/oy are added to where they would be)
  function stir(dt){
    if (!hands.length && stirred <= 0) return;
    const s = Math.min(dt, 50) / 1000, R = T.reach, R2 = R * R, damp = Math.exp(-T.damp * s);
    let moving = 0;
    for (let i = 0; i < P; i++){
      let ax = -T.spring * ox[i], ay = -T.spring * oy[i];
      const x = px[i] + ox[i], y = py[i] + oy[i];
      for (const h of hands){
        const dx = x - h.x, dy = y - h.y, d2 = dx * dx + dy * dy;
        if (d2 >= R2) continue;
        const d = Math.sqrt(d2) || 1, w = (1 - d / R) * (1 - d / R);
        ax += dx / d * w * T.push + h.vx * w * T.sweep;
        ay += dy / d * w * T.push + h.vy * w * T.sweep;
      }
      vx[i] = (vx[i] + ax * s) * damp; vy[i] = (vy[i] + ay * s) * damp;
      ox[i] += vx[i] * s; oy[i] += vy[i] * s;
      if (Math.abs(ox[i]) + Math.abs(oy[i]) > 0.3) moving++;
    }
    stirred = moving;
  }

  function draw(){
    if (!sampled) sampled = sample();
    if (!sampled) return;
    let cur = -1;
    for (let i = 0; i < steps.length; i++) if (steps[i].at <= t) cur = i;
    if (cur < 0) return;
    if (cur !== to){
      if (cur > 0) sfx("grow", { x: oliveX() });   // a soft rustle as the olive grows
      const s = steps[cur];
      morphTo(cur, s.morph);
    }
    const s = steps[to];
    // at the very end everything fades out
    const out = 1 - clamp01((t - (storyEnd - T.out)) / T.out);
    const life = (t - morphAt) / morphMs, travel = 1 - T.stagger - 0.08;   // the last point to leave still lands by the end of the flow
    buf32.fill(0xff000000);
    const BW = box.w, BH = box.h, D = T.dot, now = t * 0.003;
    for (let i = 0; i < P; i++){
      const k = clamp01((life - delay[i]) / travel), e = ease(k);
      if (k < 1){
        const u = 1 - e;
        px[i] = u * u * sx[i] + 2 * u * e * cxp[i] + e * e * s.tx[i];
        py[i] = u * u * sy[i] + 2 * u * e * cyp[i] + e * e * s.ty[i];
        pr[i] = sr[i] + (s.tr[i] - sr[i]) * e; pg[i] = sg[i] + (s.tg[i] - sg[i]) * e; pb[i] = sb[i] + (s.tb[i] - sb[i]) * e;
      } else {
        px[i] = s.tx[i] + Math.sin(now + seed[i] * 7) * T.shimmer;
        py[i] = s.ty[i] + Math.cos(now * 1.3 + seed[i] * 5) * T.shimmer;
        pr[i] = s.tr[i]; pg[i] = s.tg[i]; pb[i] = s.tb[i];
      }
      const x = Math.round(px[i] + ox[i] - box.x), y = Math.round(py[i] + oy[i] - box.y);
      if (x < 0 || y < 0 || x >= BW - D || y >= BH - D) continue;
      // a point a hand set moving catches a little more light
      const lit = out * (1 + Math.min(T.glow, (Math.abs(vx[i]) + Math.abs(vy[i])) / 600));
      const c = 0xff000000 | (Math.min(255, pb[i] * lit) << 16) | (Math.min(255, pg[i] * lit) << 8) | Math.min(255, pr[i] * lit);
      for (let dy = 0; dy < D; dy++){ const row = (y + dy) * BW + x; for (let dx = 0; dx < D; dx++) buf32[row + dx] = c; }
    }
    g.putImageData(buf, box.x, box.y);
    speciesEl.style.opacity = out;
  }

  function frame(pts, dt){
    if (!running) return;
    if (!scale) measure();
    t = Math.min(t + dt, storyEnd);
    if (t >= storyEnd) done = true;
    const n = Math.min(CHAPTERS.length, Math.floor(t / chapter) + 1);
    if (n !== shown) showLine(n);
    lineEl.classList.toggle("in", shown > 0 && t < storyEnd - T.out);
    trackHands(pts, dt);
    if (sampled) stir(dt);
    draw();
  }

  function reset(){
    t = 0; shown = 0; done = false; lastStep = -1; clearTimeout(swap); hands = []; stirred = 0;
    applyTexts();
    g.clearRect(0, 0, W, H);
    if (sampled) sampled = false;   // the points start again from the ground (and the layout may have changed)
    from = to = -1;
  }

  relayout();
  reset();

  return {
    start(){ relayout(); schedule(); running = true; },
    stop(){ running = false; clearTimeout(swap); },
    reset,
    setTexts(x){ TX = x || {}; applyTexts(); },
    frame,
    relayout,
    // while the story is told the section stays open, even with nobody's hands up; when it has ended
    // js/sections.js goes back to the menu
    get playing(){ return running && !done; },
    get done(){ return done; },
    get running(){ return running; },
    timing: T
  };
}
