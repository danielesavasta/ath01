// War section (Promachos). Arrows fly slowly in from the edges of the frame towards the statue.
// A hand held still raises the aegis: the gorgoneion opens around it and every arrow that comes near
// turns to stone, greys and crumbles. A moving hand does nothing. Arrows nobody stops fall short before
// they reach her, so nothing is ever lost. Every few arrows turned to stone one War sentence appears
// (content/texts.js, war.lines); after the last one the volley stops, and starts again after T.rest.
//
//   import { createWar } from "./war/war.js";
//   const war = createWar({ stage, texts, statueBand, stoneTexture });
//   war.frame(pts, dt);   // pts: [{ id?, px, py, mouse? }] in viewport pixels, once per animation frame
//
// Drawn on one 2D canvas the size of the 1920×1080 frame; everything below is in frame pixels.

const W = 1920, H = 1080;

// tuning: most of the feel is here
const T = {
  stillTol: 38,              // px a hand may drift and still count as still (camera jitter at 2 m)
  stillAfter: 350,           // ms of stillness before the aegis starts to rise
  rise: 500,                 // ms for it to open fully
  fall: 220,                 // ms for it to close once the hand moves
  reach: 170,                // px around a raised aegis where arrows turn to stone
  spawnEvery: [900, 1700],   // ms between arrows
  maxArrows: 9,
  speed: [200, 280],         // px per second along the flight
  gravity: 90,               // px/s², a slight arc
  firstLine: 2,              // arrows turned to stone before the first sentence
  perLine: 4,                // then one more sentence every this many
  rest: 15000,               // ms of calm after the last sentence before the volley starts again
  petrify: 550,              // ms from terracotta to marble
  hold: 350,                 // ms it hangs there as stone
  crumble: 1300              // ms the pieces take to fall and fade
};

const CLAY = "#C8693A", CLAY_DARK = "#8E4424";
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

// the gorgoneion, black-figure style: a terracotta disc, the face in black, snakes around the rim
function drawGorgoneion(){
  const R = 100, c = document.createElement("canvas");
  c.width = c.height = 2 * (R + 30);
  const g = c.getContext("2d");
  g.translate(R + 30, R + 30);
  g.lineCap = "round"; g.lineJoin = "round";

  // snakes: wavy strokes out from the rim, each with a small head
  g.strokeStyle = CLAY; g.fillStyle = CLAY; g.lineWidth = 5;
  for (let i = 0; i < 14; i++){
    const a = (i / 14) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    g.beginPath();
    for (let k = 0; k <= 10; k++){
      const r = R * 0.78 + k * 3.2, w = Math.sin(k * 1.1 + i) * 5;
      const x = ca * r - sa * w, y = sa * r + ca * w;
      k ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
    const hr = R * 0.78 + 34, hw = Math.sin(11 + i) * 5;
    g.beginPath(); g.arc(ca * hr - sa * hw, sa * hr + ca * hw, 5.5, 0, Math.PI * 2); g.fill();
  }

  // the disc and an incised ring
  g.beginPath(); g.arc(0, 0, R * 0.8, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "#000"; g.lineWidth = 2.5;
  g.beginPath(); g.arc(0, 0, R * 0.72, 0, Math.PI * 2); g.stroke();

  // the face, in black
  g.fillStyle = "#000"; g.strokeStyle = "#000"; g.lineWidth = 4;
  for (const s of [-1, 1]){
    g.beginPath(); g.arc(s * 24, -16, 11, 0, Math.PI * 2); g.fill();                       // eye
    g.fillStyle = CLAY; g.beginPath(); g.arc(s * 24, -16, 4, 0, Math.PI * 2); g.fill(); g.fillStyle = "#000";
    g.beginPath(); g.moveTo(s * 8, -30); g.quadraticCurveTo(s * 24, -40, s * 40, -28); g.stroke();   // brow
  }
  g.beginPath(); g.moveTo(0, -18); g.lineTo(-7, 6); g.lineTo(7, 6); g.stroke();              // nose
  g.beginPath(); g.ellipse(0, 26, 32, 15, 0, 0, Math.PI * 2); g.fill();                      // mouth
  g.fillStyle = CLAY;
  for (const s of [-1, 1]){                                                                  // tusks
    g.beginPath(); g.moveTo(s * 20, 14); g.lineTo(s * 14, 14); g.lineTo(s * 18, 30); g.fill();
  }
  g.beginPath(); g.moveTo(-9, 22); g.lineTo(9, 22); g.lineTo(6, 46); g.quadraticCurveTo(0, 52, -6, 46); g.fill();   // tongue
  g.fillStyle = "#000"; g.beginPath(); g.moveTo(0, 26); g.lineTo(0, 44); g.lineWidth = 1.5; g.stroke();
  return { canvas: c, R };
}

export function createWar(opts){
  const stage = opts.stage;
  stage.classList.add("war-stage");
  stage.innerHTML = `
    <canvas class="war-canvas" width="${W}" height="${H}"></canvas>
    <div class="war-tally"><span class="name stone-text"></span><span class="num stone-text"></span></div>
    <div class="war-hint"></div>
    <div class="war-lines"></div>`;
  const cv = stage.querySelector(".war-canvas"), g = cv.getContext("2d");
  const tallyName = stage.querySelector(".war-tally .name"), tallyNum = stage.querySelector(".war-tally .num");
  const hintEl = stage.querySelector(".war-hint"), linesEl = stage.querySelector(".war-lines");

  const gorgon = drawGorgoneion();
  let stone = null;               // the statue's marble, for arrows turned to stone
  if (opts.stoneTexture){
    const img = new Image();
    img.onload = () => { stone = g.createPattern(img, "repeat"); };
    img.src = opts.stoneTexture;
  }

  let TX = opts.texts || {};
  let band = [700, 1240];         // where the statue stands, frame px
  let arrows = [], bits = [], hands = new Map();
  let count = 0, shown = 0, phase = "volley", calm = 0, nextIn = 600, running = false;

  function relayout(){
    const b = opts.statueBand && opts.statueBand();
    band = b ? [(b[0] + 1) / 2 * W, (b[1] + 1) / 2 * W] : [700, 1240];
  }

  function applyTexts(){
    hintEl.textContent = TX.hint || "";
    tallyName.textContent = TX.tally || "";
    const lines = TX.lines || [];
    linesEl.innerHTML = "";
    for (let i = 0; i < shown; i++){
      const d = document.createElement("div");
      d.className = "war-line in" + (i === shown - 1 ? " now" : "");
      d.textContent = lines[i] || "";
      linesEl.appendChild(d);
    }
  }
  function showLine(){
    const lines = TX.lines || [];
    for (const d of linesEl.children) d.classList.remove("now");
    const d = document.createElement("div");
    d.className = "war-line now";
    d.textContent = lines[shown] || "";
    linesEl.appendChild(d);
    void d.offsetWidth;
    d.classList.add("in");
    shown++;
    if (shown >= lines.length){ phase = "calm"; calm = 0; }
  }

  // an arrow from the left or right edge, aimed at the edge of the statue band, in a slight arc
  function spawn(){
    const left = Math.random() < 0.5;
    const x = left ? -60 : W + 60, y = rand(120, 720);
    const tx = left ? band[0] - 40 : band[1] + 40, ty = rand(380, 820);
    const t = Math.abs(tx - x) / rand(T.speed[0], T.speed[1]);
    arrows.push({ x, y, vx: (tx - x) / t, vy: (ty - y - 0.5 * T.gravity * t * t) / t, tx, left,
                  state: "fly", t: 0, a: 0, len: rand(105, 130), alpha: 1 });
  }

  function turnToStone(ar){
    ar.state = "stone"; ar.t = 0;
    count++;
    tallyNum.textContent = roman(count);
    const lines = TX.lines || [];
    if (shown < lines.length && count >= T.firstLine + shown * T.perLine) showLine();
  }

  function crumble(ar){
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
      h.g = h.still > T.stillAfter ? Math.min(1, h.g + dt / T.rise) : Math.max(0, h.g - dt / T.fall);
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

    // hands: a white ring while the hand settles (amber as it fills), the gorgoneion once it is still
    for (const h of hands.values()){
      const p = clamp01(h.still / (T.stillAfter + T.rise));
      if (h.g < 1){
        g.lineWidth = 3;
        g.strokeStyle = "rgba(255,255,255,.3)";
        g.beginPath(); g.arc(h.x, h.y, 70, 0, Math.PI * 2); g.stroke();
        if (p > 0){
          g.strokeStyle = "#F0B429";
          g.beginPath(); g.arc(h.x, h.y, 70, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); g.stroke();
        }
      }
      if (h.g > 0){
        const k = (0.55 + 0.45 * h.g) * 1.3, size = gorgon.canvas.width * k;   // big enough to show round the hand icon
        g.save();
        g.globalAlpha = h.g;
        g.drawImage(gorgon.canvas, h.x - size / 2, h.y - size / 2, size, size);
        g.globalAlpha = 0.22 * h.g;
        g.strokeStyle = CLAY; g.lineWidth = 2;
        g.setLineDash([4, 10]);
        g.beginPath(); g.arc(h.x, h.y, T.reach * h.g, 0, Math.PI * 2); g.stroke();
        g.restore();
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
    count = 0; shown = 0; phase = "volley"; calm = 0; nextIn = 600;
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
    get running(){ return running; },
    get count(){ return count; },
    get hands(){ return [...hands.values()]; },
    timing: T
  };
}
