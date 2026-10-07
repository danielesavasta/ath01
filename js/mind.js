// Mind section (mētis). No gesture for now: the story is told one sentence at a time (content/texts.js,
// mind.lines) while an olive grows beside the statue, from the seed to a full tree, then a branch that buds
// and flowers. The drawings come from Daniele's olive plate (refs/olive-plate.png), cut into single frames by
// tools/olive/slice.py into assets/mind/<page><row><col>.png. After the last sentence the picture stays for
// T.hold and fades out; then `done` turns true and js/sections.js goes back to the menu.
//
//   import { createMind } from "./mind.js";
//   const mind = createMind({ stage, texts, statueBand });
//   mind.frame(pts, dt);   // once per animation frame; the hands are not used
//
// Drawn on one 2D canvas the size of the 1920×1080 frame; everything below is in frame pixels.

const W = 1920, H = 1080;

const T = {
  line: 5500,      // ms each sentence stays (its drawings are spread over this time)
  fade: 1100,      // ms one drawing dissolves into the next (at most; shorter when drawings come faster)
  chapterFade: 1400,  // ms for the cut from the tree to the branch
  hold: 4000,      // ms the last sentence and flower stay before the section closes
  out: 1200,       // ms the picture and sentence take to fade out at the end
  height: 560,     // px the tallest drawing is drawn at (the plate's cells are ~250 px tall)
  left: 300,       // px: the olive is centred between this (right of the back button) and the statue
  ground: 930,     // px: the drawings stand on this line
  grow: [0.5, 1]   // the seedling is drawn this much smaller than the tree, growing in between
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
  let t = 0, shown = 0, done = false, running = false, swap = 0, scale = 0;

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
    lineEl.classList.remove("in");
    clearTimeout(swap);
    swap = setTimeout(renderLine, n > 1 ? 700 : 60);
  }

  function drawStep(s, alpha){
    if (!s || alpha <= 0 || !scale || !s.img.complete || !s.img.naturalWidth) return;
    const k = scale * s.grow;
    const w = s.img.naturalWidth * k, h = s.img.naturalHeight * k;
    g.globalAlpha = alpha;
    g.drawImage(s.img, oliveX() - w / 2, T.ground - h, w, h);
  }

  function draw(){
    g.clearRect(0, 0, W, H);
    g.imageSmoothingQuality = "high";
    let cur = -1;
    for (let i = 0; i < steps.length; i++) if (steps[i].at <= t) cur = i;
    if (cur < 0) return;
    const s = steps[cur], prev = steps[cur - 1];
    const k = ease(clamp01((t - s.at) / s.fade));
    // at the very end everything fades out before the story starts again
    const out = 1 - clamp01((t - (storyEnd - T.out)) / T.out);
    if (s.chapter === TREE && cur > 0 && prev.chapter < TREE){
      // the cut from tree to branch: one fades out fully before the other comes in
      drawStep(prev, out * (1 - clamp01(k * 2)));
      drawStep(s, out * clamp01(k * 2 - 1));
    } else {
      drawStep(prev, out * (1 - k));
      drawStep(s, out * k);
    }
    g.globalAlpha = 1;
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
    t = 0; shown = 0; done = false; clearTimeout(swap);
    applyTexts();
    g.clearRect(0, 0, W, H);
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
