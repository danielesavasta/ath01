// Craft section (Ergane): the cloth of the statue, part by part. The parts are outlines on the statue
// (content/venue.js `parts`, redrawn at the venue with the setup screen, K). A hand in front of a part
// lights that whole part; the hand icon is hidden there, the lit part is the cursor. Resting on it, the
// light grows brighter and turns from warm to pure white; when full the part is chosen and its panel
// (content/texts.js craft.parts, photo assets/craft/<id>.jpg) opens on the side of the statue nearer to it.
// With nobody around, the parts light up one after another to show where they are.
//
//   import { createCraft } from "./craft/craft.js";
//   const craft = createCraft({ stage, texts, parts: () => VENUE.get().parts, statue: () => VENUE.get().mask.points });
//   craft.frame(pts, dt);   // pts: [{ id?, px, py, mouse? }] in viewport pixels, once per animation frame
//
// The light is drawn on one canvas above the venue mask, because it is projected onto the statue itself: the
// rest of the statue a little darker, the part in light. At the venue the mask below is black, so this is
// exactly what the projector shows. Over the statue photo (working without the statue) the light is held
// back, so the carving stays visible. Redrawn only when the light changes (full-frame layers are costly).

import { sfx } from "./sound.js";

const W = 1920, H = 1080;

const T = {
  dwell: 1500,        // ms resting on a part to choose it
  hover: 0.32,        // light on a part with a hand in front of it
  ready: 0.8,         // light just before it is chosen (the dwell fills from hover to here)
  dim: 0.55,          // how much the rest of the statue is darkened while the section is open
  near: 30,           // px: a hand this close to a part's edge still counts as on it
  invite: 1800,       // ms each part stays lit while nobody is there
  inviteAfter: 2500,  // ms without hands before the parts start to show themselves
  onPhoto: 0.5        // light held back over the statue photo, so the folds stay visible there
};
const WARM = [255, 226, 188], WHITE = [255, 255, 255];

function inside(pt, poly){
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++){
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function edgeDistance(pt, poly){
  let best = Infinity;
  for (let i = 0; i < poly.length; i++){
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / L));
    best = Math.min(best, Math.hypot(a[0] + t * dx - pt[0], a[1] + t * dy - pt[1]));
  }
  return best;
}
const centroid = (poly) => poly.reduce((s, p) => [s[0] + p[0] / poly.length, s[1] + p[1] / poly.length], [0, 0]);
const pad2 = (n) => String(n).padStart(2, "0");

export function createCraft(opts){
  const stage = opts.stage;
  const imagesDir = opts.imagesDir || "assets/craft/";
  stage.classList.add("craft-stage");
  stage.innerHTML = `
    <div class="craft-hint t-hint"></div>
    <div class="craft-panel">
      <div class="t-label count"></div><div class="t-rule"></div>
      <div class="t-title stone-text title"></div>
      <div class="t-greek greek"></div>
      <div class="t-body text"></div>
      <div class="craft-photo"><img alt=""></div>
    </div>`;
  const hintEl = stage.querySelector(".craft-hint"), panel = stage.querySelector(".craft-panel");
  const q$ = (s) => panel.querySelector(s);
  const photo = q$(".craft-photo"), photoImg = photo.querySelector("img");
  photoImg.onload = () => photo.classList.remove("none");
  photoImg.onerror = () => photo.classList.add("none");

  // the light canvas sits on the body, above the venue mask (css/main.css)
  const lightCv = document.createElement("canvas");
  lightCv.id = "craftLight"; lightCv.width = W; lightCv.height = H;
  document.body.appendChild(lightCv);
  const lg = lightCv.getContext("2d");
  let drawn = "";

  let TX = opts.texts || {};
  let parts = [], running = false, chosen = null, side = "left", swap = 0, idle = 0, clock = 0;
  const onPart = new Map();     // hand id -> part id, for handSkin

  function load(){
    const old = new Map(parts.map((p) => [p.id, p]));
    parts = (opts.parts ? opts.parts() : []).map((p) => {
      const o = old.get(p.id);
      return { id: p.id, points: p.points, dwell: o ? o.dwell : 0, level: o ? o.level : 0, warm: o ? o.warm : 1 };
    });
  }

  function partTexts(id){ return (TX.parts && TX.parts[id]) || {}; }
  function renderPanel(){
    if (!chosen){ panel.classList.remove("in"); return; }
    const t = partTexts(chosen), i = parts.findIndex((p) => p.id === chosen);
    q$(".count").innerHTML = `${pad2(i + 1)}&nbsp;&nbsp;/&nbsp;&nbsp;${pad2(parts.length)}`;
    q$(".title").textContent = t.title || chosen;
    q$(".greek").textContent = t.greek || "";
    q$(".text").textContent = t.text || "";
    if (!photoImg.src.endsWith(`/${chosen}.jpg`)){ photo.classList.add("none"); photoImg.src = `${imagesDir}${chosen}.jpg`; }
    panel.classList.toggle("right", side === "right");
    panel.classList.add("in");
  }
  function applyTexts(){
    hintEl.textContent = TX.hint || "";
    if (chosen) renderPanel();
  }

  // choose a part: its panel opens beside the statue, on the side nearer to the part
  function choose(p){
    if (chosen === p.id) return;
    chosen = p.id;
    sfx("choose", { x: centroid(p.points)[0] });
    const band = opts.statueBand ? opts.statueBand() : null;
    const mid = band ? ((band[0] + band[1]) / 2 + 1) / 2 * W : W / 2;
    const nextSide = centroid(p.points)[0] < mid ? "left" : "right";
    panel.classList.remove("in");
    clearTimeout(swap);
    swap = setTimeout(() => { side = nextSide; renderPanel(); }, panel.classList.contains("was") ? 450 : 30);
    panel.classList.add("was");
  }

  function partAt(x, y){
    for (const p of parts) if (inside([x, y], p.points)) return p;
    let best = null, bd = T.near;
    for (const p of parts){ const d = edgeDistance([x, y], p.points); if (d < bd){ bd = d; best = p; } }
    return best;
  }

  function frame(pts, dt){
    if (!running) return;
    clock += dt;
    const r = stage.getBoundingClientRect();
    const over = new Set();
    onPart.clear();
    pts.forEach((pt, i) => {
      const p = partAt((pt.px - r.left) / r.width * W, (pt.py - r.top) / r.height * H);
      if (!p) return;
      over.add(p);
      onPart.set(pt.id ?? (pt.mouse ? "mouse" : "i" + i), p.id);
    });
    const anyHands = pts.length > 0;
    idle = anyHands ? 0 : idle + dt;

    // nobody there and nothing chosen: the parts show themselves one after another
    const inviting = !chosen && idle > T.inviteAfter && parts.length;
    const invited = inviting ? parts[Math.floor(clock / T.invite) % parts.length] : null;

    for (const p of parts){
      const hovered = over.has(p);
      if (hovered && !p.over && chosen !== p.id) sfx("light", { x: centroid(p.points)[0] });   // a hand comes onto it
      p.over = hovered;
      p.dwell = hovered && chosen !== p.id ? p.dwell + dt : Math.max(0, p.dwell - dt * 3);
      if (p.dwell >= T.dwell){ p.dwell = 0; choose(p); }
      const k = Math.min(p.dwell / T.dwell, 1);
      let target = 0, warm = 1;
      if (chosen === p.id){ target = 1; warm = 0; }
      else if (hovered){ target = T.hover + (T.ready - T.hover) * k; warm = 1 - k; }
      else if (p === invited){ target = T.hover * (0.6 + 0.4 * Math.sin((clock % T.invite) / T.invite * Math.PI)); }
      const ease = Math.min(1, dt / (target > p.level ? 90 : 220));
      p.level += (target - p.level) * ease;
      p.warm += (warm - p.warm) * Math.min(1, dt / 150);
    }
    draw();
  }

  function trace(g, poly){
    g.beginPath();
    poly.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]));
    g.closePath();
  }
  function draw(force){
    const photo = opts.photo ? opts.photo() : false;
    const key = parts.map((p) => p.level.toFixed(3) + p.warm.toFixed(2)).join() + photo;
    if (key === drawn && !force) return;
    drawn = key;
    lg.clearRect(0, 0, W, H);
    // the rest of the statue, a little darker, so the lit part stands out
    const statue = opts.statue ? opts.statue() : null;
    if (statue && statue.length > 2){
      lg.fillStyle = `rgba(0,0,0,${T.dim})`;
      trace(lg, statue); lg.fill();
    }
    for (const p of parts){
      if (p.level <= 0.001) continue;
      lg.globalCompositeOperation = "destination-out";          // no darkening under the part
      trace(lg, p.points); lg.fillStyle = "#000"; lg.fill();
      lg.globalCompositeOperation = "source-over";
      const c = WARM.map((w, i) => Math.round(WHITE[i] + (w - WHITE[i]) * p.warm));
      const a = photo ? p.level * T.onPhoto : p.level;
      lg.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;
      trace(lg, p.points); lg.fill();
    }
  }

  function reset(){
    load();
    for (const p of parts){ p.dwell = 0; p.level = 0; p.warm = 1; }
    chosen = null; idle = T.inviteAfter; clock = 0; clearTimeout(swap);
    panel.classList.remove("in", "was");
    onPart.clear();
    draw(true);
  }

  load();
  applyTexts();

  return {
    start(){ load(); running = true; },
    stop(){ running = false; onPart.clear(); lg.clearRect(0, 0, W, H); drawn = ""; },
    reset,
    setTexts(t){ TX = t || {}; applyTexts(); },
    frame,
    relayout(){ load(); drawn = ""; },
    // js/scripts.js asks for each hand's icon: none while it is on a part (the lit part shows where it is)
    handSkin(id){ return onPart.has(id) ? false : null; },
    get chosen(){ return chosen; },
    get parts(){ return parts; },
    timing: T
  };
}
