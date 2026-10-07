// War section (Promachos). Arrows fly slowly in from the edges of the frame towards the statue.
// A hand held still turns into the gorgoneion (its icon becomes assets/gorgon.svg, through handSkin)
// and every arrow that comes near turns to stone, greys and crumbles. A moving hand does nothing. Arrows nobody stops fall short before
// they reach her, so nothing is ever lost. Every few arrows turned to stone one War sentence appears
// (content/texts.js, war.lines); after the last one the volley stops, and starts again after T.rest.
//
//   import { createWar } from "./war/war.js";
//   const war = createWar({ stage, texts, statueBand, stoneTexture });
//   war.frame(pts, dt);   // pts: [{ id?, px, py, mouse? }] in viewport pixels, once per animation frame
//
// Drawn on one 2D canvas the size of the 1920×1080 frame; everything below is in frame pixels.

import { sfx } from "./sound.js";

const W = 1920, H = 1080;

// tuning: most of the feel is here
const T = {
  stillTol: 38,              // px a hand may drift and still count as still (camera jitter at 2 m)
  stillAfter: 350,           // ms of stillness before the aegis starts to rise
  rise: 500,                 // ms for it to open fully
  fall: 220,                 // ms for it to close once the hand moves
  reach: 130,                // px around a still hand where arrows turn to stone (the icon itself is 90)
  spawnEvery: [900, 1700],   // ms between arrows
  maxArrows: 9,
  speed: [200, 280],         // px per second along the flight
  gravity: 90,               // px/s², a slight arc
  firstLine: 2,              // arrows turned to stone before the first sentence
  perLine: 2,                // then one more sentence every this many
  rest: 15000,               // ms of calm after the last sentence before the volley starts again
  petrify: 550,              // ms from terracotta to marble
  hold: 350,                 // ms it hangs there as stone
  crumble: 1300              // ms the pieces take to fall and fade
};

const CLAY = "#C8693A";
const rand = (a, b) => a + Math.random() * (b - a);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

function roman(n){
  if (n <= 0) return "·";
  const map = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
               [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let s = "";
  for (const [v, r] of map) while (n >= v){ s += r; n -= v; }
  return s;
}

export function createWar(opts){
  const stage = opts.stage;
  stage.classList.add("war-stage");
  const gorgonSrc = opts.gorgon || "assets/gorgon.svg";
  stage.innerHTML = `
    <canvas class="war-canvas" width="${W}" height="${H}"></canvas>
    <div class="war-tally"><div class="t-label name"></div><div class="num stone-text"></div></div>
    <div class="war-hint">
      <div class="t-hint text"></div>
      <div class="war-demo"><div class="war-demo-ring"></div><img class="war-demo-hand" src="assets/openHand.svg" alt=""><img class="war-demo-g" src="${gorgonSrc}" alt=""></div>
    </div>
    <div class="war-line"><div class="t-label count"></div><div class="t-rule"></div><div class="t-sentence text"></div></div>`;
  const cv = stage.querySelector(".war-canvas"), g = cv.getContext("2d");
  const tallyName = stage.querySelector(".war-tally .name"), tallyNum = stage.querySelector(".war-tally .num");
  const hintEl = stage.querySelector(".war-hint .text"), lineEl = stage.querySelector(".war-line");
  const lineCount = lineEl.querySelector(".count"), lineText = lineEl.querySelector(".text");

  const gorgon = new Image();
  gorgon.src = gorgonSrc;
  const ICON = 140;                // the hand icon's size (js/scripts.js HAND_ICON), for the mouse's gorgoneion
  let stone = null;               // the statue's marble, for arrows turned to stone
  if (opts.stoneTexture){
    const img = new Image();
    img.onload = () => { stone = g.createPattern(img, "repeat"); };
    img.src = opts.stoneTexture;
  }

  let TX = opts.texts || {};
  let band = [700, 1240];         // where the statue stands, frame px
  let arrows = [], bits = [], hands = new Map();
  let count = 0, shown = 0, phase = "volley", calm = 0, nextIn = 600, running = false, swap = 0;

  function relayout(){
    const b = opts.statueBand && opts.statueBand();
    band = b ? [(b[0] + 1) / 2 * W, (b[1] + 1) / 2 * W] : [700, 1240];
  }

  // one sentence at a time: the counter (II / IV), a hairline, the sentence
  function renderLine(){
    const lines = TX.lines || [];
    lineCount.innerHTML = shown ? `${roman(shown)}&nbsp;&nbsp;/&nbsp;&nbsp;${roman(lines.length)}` : "";
    lineText.textContent = shown ? lines[shown - 1] || "" : "";
    lineEl.classList.toggle("in", shown > 0);
  }
  function applyTexts(){
    hintEl.textContent = TX.hint || "";
    tallyName.textContent = TX.tally || "";
    renderLine();
  }
  // the old sentence fades out, then the new one fades in
  function showLine(){
    const lines = TX.lines || [];
    shown++;
    sfx("line");
    if (shown >= lines.length){ phase = "calm"; calm = 0; }
    lineEl.classList.remove("in");
    clearTimeout(swap);
    swap = setTimeout(renderLine, shown > 1 ? 700 : 60);
  }

  // an arrow from the left or right edge, aimed at the edge of the statue band, in a slight arc
  function spawn(){
    const left = Math.random() < 0.5;
    const x = left ? -60 : W + 60, y = rand(120, 720);
    const tx = left ? band[0] - 40 : band[1] + 40, ty = rand(380, 820);
    const t = Math.abs(tx - x) / rand(T.speed[0], T.speed[1]);
    arrows.push({ x, y, vx: (tx - x) / t, vy: (ty - y - 0.5 * T.gravity * t * t) / t, tx, left,
                  state: "fly", t: 0, a: 0, len: rand(105, 130), alpha: 1 });
    sfx("arrow", { x: left ? 150 : W - 150 });
  }

  function turnToStone(ar){
    ar.state = "stone"; ar.t = 0;
    sfx("stone", { x: ar.x });
    count++;
    tallyNum.textContent = roman(count);
    const lines = TX.lines || [];
    if (shown < lines.length && count >= T.firstLine + shown * T.perLine) showLine();
  }

  function crumble(ar){
    sfx("crumble", { x: ar.x });
    const ca = Math.cos(ar.a), sa = Math.sin(ar.a);
    for (let i = 0; i < 18; i++){
      const k = Math.random() * ar.len;
      bits.push({ x: ar.x - ca * k, y: ar.y - sa * k, vx: rand(-35, 35), vy: rand(-40, 10),
                  s: rand(2, 5.5), r: rand(0, 6.3), vr: rand(-6, 6), t: 0 });
    }
    ar.state = "gone";
  }

  // hands: a hand counts as still while it stays inside T.stillTol of where it settled
  function trackHands(pts, dt){
    const r = stage.getBoundingClientRect();
    const seen = new Set();
    pts.forEach((p, i) => {
      const key = p.id ?? (p.mouse ? "mouse" : "i" + i);
      const x = (p.px - r.left) / r.width * W, y = (p.py - r.top) / r.height * H;
      let h = hands.get(key);
      if (!h){ h = { x, y, ax: x, ay: y, still: 0, g: 0 }; hands.set(key, h); }
      h.x += (x - h.x) * 0.45; h.y += (y - h.y) * 0.45;          // smooth out the jitter a little
      if (Math.hypot(h.x - h.ax, h.y - h.ay) > T.stillTol){ h.ax = h.x; h.ay = h.y; h.still = 0; }
      else h.still += dt;
      const was = h.g;
      h.g = h.still > T.stillAfter ? Math.min(1, h.g + dt / T.rise) : Math.max(0, h.g - dt / T.fall);
      if (was === 0 && h.g > 0) sfx("gorgon", { x: h.x });   // the gorgoneion begins to rise
      seen.add(key);
    });
    for (const k of hands.keys()) if (!seen.has(k)) hands.delete(k);
  }

  function step(dt){
    const s = dt / 1000;
    if (phase === "volley"){
      nextIn -= dt;
      if (nextIn <= 0 && arrows.filter((a) => a.state === "fly").length < T.maxArrows){
        spawn(); nextIn = rand(T.spawnEvery[0], T.spawnEvery[1]);
      }
    } else {
      calm += dt;
      if (calm > T.rest) reset();
    }

    for (const ar of arrows){
      ar.t += dt;
      if (ar.state === "fly"){
        ar.vy += T.gravity * s;
        ar.x += ar.vx * s; ar.y += ar.vy * s;
        ar.a = Math.atan2(ar.vy, ar.vx);
        for (const h of hands.values())
          if (h.g > 0.6 && Math.hypot(ar.x - h.x, ar.y - h.y) < T.reach * h.g){ turnToStone(ar); break; }
        // nobody stopped it: it loses its force just before the statue and drops
        if (ar.state === "fly" && (ar.left ? ar.x >= ar.tx : ar.x <= ar.tx)){ ar.state = "short"; ar.t = 0; ar.vx *= 0.25; }
      } else if (ar.state === "short"){
        ar.vy += 900 * s;
        ar.x += ar.vx * s; ar.y += ar.vy * s;
        ar.a += (ar.left ? 1 : -1) * 2.2 * s;
        ar.alpha = 1 - ar.t / 900;
        if (ar.alpha <= 0 || ar.y > H + 150) ar.state = "gone";
      } else if (ar.state === "stone" && ar.t > T.petrify + T.hold) crumble(ar);
    }
    arrows = arrows.filter((a) => a.state !== "gone");

    for (const b of bits){ b.t += dt; b.vy += 700 * s; b.x += b.vx * s; b.y += b.vy * s; b.r += b.vr * s; }
    bits = bits.filter((b) => b.t < T.crumble);
  }

  function drawArrow(ar, style, alpha){
    const L = ar.len;
    g.save();
    g.globalAlpha = alpha;
    g.translate(ar.x, ar.y); g.rotate(ar.a);
    g.strokeStyle = style; g.fillStyle = style; g.lineWidth = 3.5; g.lineCap = "round";
    g.beginPath(); g.moveTo(-L, 0); g.lineTo(-14, 0); g.stroke();                          // shaft
    g.beginPath(); g.moveTo(0, 0); g.lineTo(-18, -7); g.lineTo(-14, 0); g.lineTo(-18, 7); g.closePath(); g.fill();   // head
    g.lineWidth = 3;
    for (const d of [0, 9]){                                                                // fletching
      g.beginPath(); g.moveTo(-L + d + 14, 0); g.lineTo(-L + d, -9); g.stroke();
      g.beginPath(); g.moveTo(-L + d + 14, 0); g.lineTo(-L + d, 9); g.stroke();
    }
    g.restore();
  }

  function draw(){
    g.clearRect(0, 0, W, H);

    // hands: a white ring while the hand settles, filling red; once still, the icon itself becomes the
    // gorgoneion (handSkin below). The mouse has no icon, so its gorgoneion is drawn here.
    for (const [key, h] of hands){
      const p = clamp01(h.still / (T.stillAfter + T.rise));
      if (h.g < 1){
        g.lineWidth = 3;
        g.globalAlpha = 1 - h.g;
        g.strokeStyle = "rgba(255,255,255,.3)";
        g.beginPath(); g.arc(h.x, h.y, 60, 0, Math.PI * 2); g.stroke();
        if (p > 0){
          g.strokeStyle = "#ED1C24";
          g.beginPath(); g.arc(h.x, h.y, 60, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); g.stroke();
        }
        g.globalAlpha = 1;
      }
      if (key === "mouse" && h.g > 0 && gorgon.complete){
        g.globalAlpha = h.g;
        g.drawImage(gorgon, h.x - ICON / 2, h.y - ICON / 2, ICON, ICON);
        g.globalAlpha = 1;
      }
    }

    for (const ar of arrows){
      if (ar.state === "stone"){
        const k = clamp01(ar.t / T.petrify);
        drawArrow(ar, CLAY, 1 - k);
        drawArrow(ar, stone || "#D8D0C0", k);
      } else drawArrow(ar, CLAY, ar.alpha);
    }

    for (const b of bits){
      g.save();
      g.globalAlpha = 1 - b.t / T.crumble;
      g.translate(b.x, b.y); g.rotate(b.r);
      g.fillStyle = stone || "#D8D0C0";
      g.fillRect(-b.s / 2, -b.s / 2, b.s, b.s * 0.8);
      g.restore();
    }
  }

  function frame(pts, dt){
    if (!running) return;
    trackHands(pts, dt);
    step(dt);
    draw();
  }

  function reset(){
    arrows = []; bits = []; hands.clear();
    count = 0; shown = 0; phase = "volley"; calm = 0; nextIn = 600; clearTimeout(swap);
    tallyNum.textContent = roman(0);
    applyTexts();
    g.clearRect(0, 0, W, H);
  }

  relayout();
  reset();

  return {
    start(){ relayout(); running = true; },
    stop(){ running = false; },
    reset,
    setTexts(t){ TX = t || {}; applyTexts(); },
    frame,
    relayout,
    // js/scripts.js asks for each hand's icon: a still hand blends into the gorgoneion
    handSkin(id){ const h = hands.get(id); return h && h.g > 0 ? { img: gorgon, mix: h.g } : null; },
    get running(){ return running; },
    get count(){ return count; },
    get hands(){ return [...hands.values()]; },
    timing: T
  };
}
