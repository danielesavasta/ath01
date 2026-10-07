// Mind section (mētis). No gesture for now: the story is told one sentence at a time (content/texts.js,
// mind.lines) while an olive grows beside the statue, from the seed to a full tree, then a branch that buds
// and flowers. The drawings come from Daniele's olive plate (refs/olive-plate.png), cut into single frames by
// tools/olive/slice.py into assets/mind/<page><row><col>.png. After the last sentence the picture stays for
// T.hold and fades out; then `done` turns true and js/sections.js goes back to the menu.
//
// The olive is drawn by particles: a few thousand fine points, each resting on the drawing in the drawing's own
// colour. When the next drawing comes they flow over, each on a gently curved path and a little after the others,
// changing colour on the way, and settle into its shape. At rest they shimmer very slightly.
//
//   import { createMind } from "./mind.js";
//   const mind = createMind({ stage, texts, statueBand });
//   mind.frame(pts, dt);   // once per animation frame; the hands are not used
//
// Drawn on one 2D canvas the size of the 1920×1080 frame; everything below is in frame pixels.

import { sfx } from "./sound.js";

const W = 1920, H = 1080;

const T = {
  line: 5500,      // ms each sentence stays (its drawings are spread over this time)
  fade: 1100,      // ms one drawing dissolves into the next (at most; shorter when drawings come faster)
  chapterFade: 1400,  // ms for the cut from the tree to the branch
  hold: 4000,      // ms the last sentence and flower stay before the section closes
  out: 1200,       // ms the picture and sentence take to fade out at the end
  height: 1200,     // px the tallest drawing is drawn at (the plate's cells are ~250 px tall)
  left: 300,       // px: the olive is centred between this (right of the back button) and the statue
  ground: 930,     // px: the drawings stand on this line
  grow: [0.5, 1],  // the seedling is drawn this much smaller than the tree, growing in between
  particles: 18000,  // points that draw the olive
  dot: 2,          // px, each point's size
  morph: 1500,     // ms the points take to flow into the next drawing (at most; less when drawings come faster)
  chapterMorph: 2200, // ms for the change from the tree to the branch
  stagger: 0.4,    // share of the flow over which the points set off one after another
  swirl: 70,       // px the flow's paths curve aside
  shimmer: 0.6     // px the points tremble at rest
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
      at: c * T.line + i * T.line / names.length,
      fade: i === 0 && c === TREE ? T.chapterFade : Math.min(T.fade, 0.95 * T.line / names.length),
      grow: c < TREE ? T.grow[0] + (T.grow[1] - T.grow[0]) * n / (treeCount - 1) : 1
    });
  }));
  const storyEnd = CHAPTERS.length * T.line + T.hold;

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
  const P = T.particles;
  const px = new Float32Array(P), py = new Float32Array(P), pr = new Float32Array(P), pg = new Float32Array(P), pb = new Float32Array(P);
  const sx = new Float32Array(P), sy = new Float32Array(P), sr = new Float32Array(P), sg = new Float32Array(P), sb = new Float32Array(P);
  const cxp = new Float32Array(P), cyp = new Float32Array(P), delay = new Float32Array(P), seed = new Float32Array(P);
  for (let i = 0; i < P; i++){ seed[i] = Math.random() * Math.PI * 2; }
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
    const m = T.swirl + 20;
    box = { x: Math.max(0, Math.floor(x0 - m)), y: Math.max(0, Math.floor(y0 - m)) };
    box.w = Math.min(W, Math.ceil(x1 + m)) - box.x; box.h = Math.min(H, Math.ceil(y1 + m)) - box.y;
    buf = g.createImageData(box.w, box.h); buf32 = new Uint32Array(buf.data.buffer);
    // before the first drawing the points lie scattered low on the ground, like seed
    for (let i = 0; i < P; i++){
      px[i] = oliveX() + (Math.random() - 0.5) * 500; py[i] = T.ground - Math.random() * 40;
      pr[i] = 60; pg[i] = 50; pb[i] = 40;
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

  function draw(){
    if (!sampled) sampled = sample();
    if (!sampled) return;
    let cur = -1;
    for (let i = 0; i < steps.length; i++) if (steps[i].at <= t) cur = i;
    if (cur < 0) return;
    if (cur !== to){
      if (cur > 0) sfx("grow", { x: oliveX() });   // a soft rustle as the olive grows
      const s = steps[cur], prev = steps[cur - 1];
      morphTo(cur, prev && s.chapter === TREE && prev.chapter < TREE ? T.chapterMorph : (cur === 0 ? T.morph : Math.min(T.morph, s.fade * 1.3)));
    }
    const s = steps[to];
    // at the very end everything fades out
    const out = 1 - clamp01((t - (storyEnd - T.out)) / T.out);
    const life = (t - morphAt) / morphMs, travel = 1 - T.stagger;
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
      const x = Math.round(px[i] - box.x), y = Math.round(py[i] - box.y);
      if (x < 0 || y < 0 || x >= BW - D || y >= BH - D) continue;
      const c = 0xff000000 | ((pb[i] * out) << 16) | ((pg[i] * out) << 8) | (pr[i] * out);
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
    const n = Math.min(CHAPTERS.length, Math.floor(t / T.line) + 1);
    if (n !== shown && t < CHAPTERS.length * T.line) showLine(n);
    lineEl.classList.toggle("in", shown > 0 && t < storyEnd - T.out);
    draw();
  }

  function reset(){
    t = 0; shown = 0; done = false; lastStep = -1; clearTimeout(swap);
    applyTexts();
    g.clearRect(0, 0, W, H);
    if (sampled) sampled = false;   // the points start again from the ground (and the layout may have changed)
    from = to = -1;
  }

  relayout();
  reset();

  return {
    start(){ relayout(); running = true; },
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
