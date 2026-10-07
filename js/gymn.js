// Gymnasion section: the Vedius Gymnasion in Ephesus, where the statue was found, as a dark ruin in 3D that
// visitors explore with their hands as torches. The walls come from the building's ground plan
// (refs/…ground-plan…png, traced by tools/gymn/trace.py into assets/gymn/plan.json).
//
// Opening: the plan draws itself on the floor in thin red lines, the walls rise out of them, and the camera
// tilts from above to a three-quarter view. Each raised hand carries a warm light into the ruin (walls catch it
// and cast shadows); what has been lit keeps a faint glow. Four places hold a sentence each (content/texts.js,
// gymn): lighting a place for a moment shows its name and its sentence, right of the statue. With nobody's hands
// up, a torch wanders to the next place by itself. When all four are found, the ruin fades and a niche is drawn
// in light around the real statue, with the last sentence: it was made to stand against a wall. Then `done`.
//
//   import { createGymn } from "./gymn.js";
//   const gymn = createGymn({ stage, texts, statueBand, statue: () => VENUE.get().mask.points });
//   gymn.frame(pts, dt);   // pts: [{ px, py, mouse? }] in viewport pixels, once per animation frame

import * as THREE from "three";
import { sfx } from "./sound.js";

const W = 1920, H = 1080;
const T = {
  wallH: 16,          // plan px: how high the ruined walls stand
  colH: 24, colR: 2.2,
  draw: 1700,         // ms the plan takes to draw itself
  rise: 2200,         // ms the walls take to rise (a wave across the building)
  tilt: 3600,         // ms for the camera to tilt from above to its view
  find: 900,          // ms a place must be lit to be found
  reach: 46,          // plan px around a place that counts as lighting it
  idleTorch: 5000,    // ms without hands before a torch wanders by itself
  torchSpeed: 90,     // plan px per second, the wandering torch
  memory: 0.5,        // how brightly a lit spot keeps glowing afterwards (0..1)
  endAfter: 2600,     // ms after the last place is found before the ending
  endFade: 1800,      // ms the ruin takes to fade out
  niche: 2600,        // ms the niche takes to draw itself around the statue
  endHold: 9000,      // ms the last sentence stays, then back to the menu
  shift: 0.24,        // the ruin sits left of the statue (its places within reach): view offset, share of the width
  maxTorches: 3
};

// the four places that hold a sentence (plan px of the drawing), and the order an idle torch visits them
const PLACES = [
  { id: "entrance", x: 650, y: 494 },
  { id: "marble",   x: 478, y: 292 },
  { id: "baths",    x: 393, y: 285 },
  { id: "palaestra",x: 650, y: 292 }
];

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ease = (k) => k * k * (3 - 2 * k);

export function createGymn(opts){
  const stage = opts.stage;
  stage.classList.add("gymn-stage");
  stage.innerHTML = `
    <canvas class="gymn-canvas"></canvas>
    <div class="gymn-labels"></div>
    <svg class="gymn-niche" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"></svg>
    <div class="gymn-hint t-hint"></div>
    <div class="gymn-line"><div class="t-label count"></div><div class="t-rule"></div><div class="t-sentence text"></div></div>`;
  const canvas = stage.querySelector(".gymn-canvas");
  const labelsEl = stage.querySelector(".gymn-labels");
  const nicheEl = stage.querySelector(".gymn-niche");
  const hintEl = stage.querySelector(".gymn-hint");
  const lineEl = stage.querySelector(".gymn-line");
  const lineCount = lineEl.querySelector(".count"), lineText = lineEl.querySelector(".text");

  // ───────────── three.js: renderer, camera, light ─────────────
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, W / H, 10, 6000);
  scene.add(new THREE.AmbientLight(0x6f86b0, 0.16));            // moonlight, just enough to sense the walls
  const moon = new THREE.DirectionalLight(0x8aa0c8, 0.32);
  moon.position.set(-300, 500, 200);
  scene.add(moon);

  // what has been lit keeps a faint glow: a canvas over the plan, painted where the torches pass
  const MEM = 256;
  const memCv = document.createElement("canvas"); memCv.width = MEM; memCv.height = MEM;
  const mem = memCv.getContext("2d");
  mem.fillStyle = "#000"; mem.fillRect(0, 0, MEM, MEM);
  const memTex = new THREE.CanvasTexture(memCv);
  memTex.colorSpace = THREE.SRGBColorSpace;

  const stone = new THREE.MeshStandardMaterial({ color: 0xcfc3b0, roughness: 0.92, metalness: 0,
    emissive: 0xffb070, emissiveMap: memTex, emissiveIntensity: 0.22 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x4a443c, roughness: 1, metalness: 0,
    emissive: 0xffa060, emissiveMap: memTex, emissiveIntensity: 0.16 });

  let plan = null, PW = 850, PH = 591;
  const walls = [], cols = [];
  let lines = null, lineCountTotal = 0;
  const group = new THREE.Group();
  scene.add(group);

  // plan px -> world (x right, z down the drawing), centred
  const wx = (x) => x - PW / 2, wz = (y) => y - PH / 2;
  // every vertex's uv from where it is on the plan, so the glow canvas lands in the right place on walls too
  function planUV(geo){
    const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++){ uv[i * 2] = (p.getX(i) + PW / 2) / PW; uv[i * 2 + 1] = 1 - (p.getZ(i) + PH / 2) / PH; }
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  }

  async function build(){
    plan = await fetch(opts.planUrl || "assets/gymn/plan.json").then((r) => r.json());
    PW = plan.w; PH = plan.h;
    // the floor: much larger than the building and fading softly into the black, so it has no edge to see
    const FW = PW * 2.4, FH = PH * 2.4;
    const fg = new THREE.PlaneGeometry(FW, FH, 1, 1);
    fg.rotateX(-Math.PI / 2);
    planUV(fg);                                   // uv: the glow, in plan space
    const fp = fg.attributes.position, uv1 = new Float32Array(fp.count * 2);
    for (let i = 0; i < fp.count; i++){ uv1[i * 2] = fp.getX(i) / FW + 0.5; uv1[i * 2 + 1] = 0.5 - fp.getZ(i) / FH; }
    fg.setAttribute("uv1", new THREE.BufferAttribute(uv1, 2));
    const fade = document.createElement("canvas"); fade.width = fade.height = 256;
    const fc = fade.getContext("2d");
    fc.fillStyle = "#000"; fc.fillRect(0, 0, 256, 256);
    fc.filter = "blur(16px)"; fc.fillStyle = "#fff";
    const mx = (PW + 60) / FW * 256, my = (PH + 60) / FH * 256;
    fc.fillRect(128 - mx / 2, 128 - my / 2, mx, my);
    const fadeTex = new THREE.CanvasTexture(fade);
    fadeTex.channel = 1;                          // uv1: across the whole floor
    floorMat.map = fadeTex; floorMat.color.set(0x8a8070); floorMat.needsUpdate = true;
    const floor = new THREE.Mesh(fg, floorMat);
    floor.receiveShadow = true;
    group.add(floor);
    // the walls: each outline raised; they rise one after another, from the entrance side
    const linePts = [];
    for (const poly of plan.walls){
      const shape = new THREE.Shape(poly[0].map(([x, y]) => new THREE.Vector2(wx(x), -wz(y))));
      for (const hole of poly.slice(1)) shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(wx(x), -wz(y)))));
      const g = new THREE.ExtrudeGeometry(shape, { depth: T.wallH, bevelEnabled: false });
      g.rotateX(-Math.PI / 2);            // shape in x/z, extruded up
      planUV(g);
      const m = new THREE.Mesh(g, stone);
      m.castShadow = m.receiveShadow = true;
      const cx = poly[0].reduce((s, p) => s + p[0], 0) / poly[0].length;
      m.userData.delay = (1 - cx / PW) * 0.55;      // from the palaestra (east, right) to the baths (west)
      m.scale.y = 0.001; m.visible = false;
      walls.push(m); group.add(m);
      for (const ring of poly) ring.forEach((p, i) => { const q = ring[(i + 1) % ring.length]; linePts.push(wx(p[0]), 0.4, wz(p[1]), wx(q[0]), 0.4, wz(q[1])); });
    }
    // columns
    const cg = new THREE.CylinderGeometry(1, 1, 1, 10);
    cg.translate(0, 0.5, 0);
    for (const [x, y, r] of plan.columns){
      const g = cg.clone();
      g.scale(Math.max(1.4, r) * 0.9, T.colH, Math.max(1.4, r) * 0.9);
      g.translate(wx(x), 0, wz(y));
      planUV(g);
      const m = new THREE.Mesh(g, stone);
      m.castShadow = true;
      m.userData.delay = (1 - x / PW) * 0.55 + 0.1;
      m.scale.y = 0.001; m.visible = false;
      cols.push(m); group.add(m);
    }
    // the drawing on the floor: every outline, in red, drawn bit by bit
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.Float32BufferAttribute(linePts, 3));
    lineCountTotal = linePts.length / 3;
    lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xed1c24, transparent: true, opacity: 1 }));
    group.add(lines);
    // labels for the places
    for (const p of PLACES){
      const el = document.createElement("div");
      el.className = "gymn-label t-label";
      labelsEl.appendChild(el);
      p.el = el;
    }
    applyTexts();
    ready = true;
    resize();
  }

  // ───────────── torches ─────────────
  const torches = [];
  for (let i = 0; i < T.maxTorches + 1; i++){
    const l = new THREE.SpotLight(0xffc48a, 0, 0, 0.36, 0.9, 0);   // a soft-edged pool of light (no falloff at this scale)
    l.castShadow = true;
    l.shadow.mapSize.set(1024, 1024);
    l.shadow.bias = -0.006;
    l.shadow.normalBias = 2.5;          // no striped "acne" on the floor
    l.shadow.camera.near = 100; l.shadow.camera.far = 600;
    scene.add(l); scene.add(l.target);
    torches.push({ light: l, x: 0, y: 0, on: 0, want: 0 });
  }
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  // a point on the wall (frame px) -> plan px on the floor, or null
  function toPlan(fx, fy){
    ndc.set(fx / W * 2 - 1, -(fy / H * 2 - 1));
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(floorPlane, hit)) return null;
    return { x: hit.x + PW / 2, y: hit.z + PH / 2 };
  }
  function toFrame(x, y, h = 0){
    const v = new THREE.Vector3(wx(x), h, wz(y)).project(camera);
    return { x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, z: v.z };
  }

  // ───────────── layout ─────────────
  let band = [700, 1240];
  function relayout(){
    const b = opts.statueBand && opts.statueBand();
    band = b ? [(b[0] + 1) / 2 * W, (b[1] + 1) / 2 * W] : [700, 1240];
    stage.style.setProperty("--line-x", (band[1] + 80).toFixed(0));
    stage.style.setProperty("--line-w", Math.max(360, Math.min(560, W - band[1] - 160)).toFixed(0));
  }
  function resize(){
    const r = stage.getBoundingClientRect();
    if (!r.width) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = W / H;
    // the ruin sits left of the statue (and runs behind her): shift the view
    camera.setViewOffset(W, H, W * T.shift, 0, W, H);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage);

  // camera: from straight above to a low three-quarter view from the south-east
  function placeCamera(k){
    const top = new THREE.Vector3(0, 2200, 1), view = new THREE.Vector3(445, 1020, 1470);
    camera.position.lerpVectors(top, view, ease(k));
    camera.lookAt(-10, 0, 10);
    camera.updateMatrixWorld();
  }

  // ───────────── texts ─────────────
  let TX = opts.texts || {};
  function placeText(id){ return (TX.places && TX.places[id]) || {}; }
  function applyTexts(){
    hintEl.textContent = TX.hint || "";
    for (const p of PLACES) if (p.el) p.el.textContent = placeText(p.id).name || "";
    renderLine();
  }
  let shownLine = null;    // the place whose sentence is showing, or "end"
  function renderLine(){
    const total = PLACES.length + 1;
    if (!shownLine){ lineEl.classList.remove("in"); return; }
    const n = shownLine === "end" ? total : found.length;
    lineCount.innerHTML = `${roman(n)}&nbsp;&nbsp;/&nbsp;&nbsp;${roman(total)}`;
    lineText.textContent = shownLine === "end" ? (TX.end || "") : (placeText(shownLine).line || "");
    lineEl.classList.add("in");
  }
  let swap = 0;
  function showLine(id){
    shownLine = id;
    lineEl.classList.remove("in");
    clearTimeout(swap);
    swap = setTimeout(renderLine, 650);
  }
  const roman = (n) => ["", "I", "II", "III", "IV", "V", "VI"][n] || String(n);

  // ───────────── the ending: a niche drawn around the real statue ─────────────
  function drawNiche(){
    const pts = opts.statue ? opts.statue() : null;
    const xs = pts && pts.length ? pts.map((p) => p[0]) : [band[0], band[1]];
    const ys = pts && pts.length ? pts.map((p) => p[1]) : [60, 1060];
    const cw = 34, ped = 70;
    const x0 = Math.min(...xs) - 70, x1 = Math.max(...xs) + 70, mid = (x0 + x1) / 2, base = Math.min(H - 10, Math.max(...ys) + 8);
    // the pediment only if there is room above the head; the lines crossing the statue fall on the mask (no light)
    const room = Math.min(...ys) - 40 >= ped + 30;
    const top = room ? Math.min(...ys) - 40 : 14;
    const path = [
      // the two columns
      `M${x0} ${base} V${top + 30} M${x0 + cw} ${base} V${top + 30}`,
      `M${x1} ${base} V${top + 30} M${x1 - cw} ${base} V${top + 30}`,
      // capitals and the entablature
      `M${x0 - 10} ${top + 30} H${x1 + 10} M${x0 - 10} ${top + 12} H${x1 + 10} M${x0 - 10} ${top + 30} V${top + 12} M${x1 + 10} ${top + 30} V${top + 12}`,
      // the pediment
      room ? `M${x0 - 16} ${top + 12} L${mid} ${top + 12 - ped} L${x1 + 16} ${top + 12}` : "",
      // the base
      `M${x0 - 20} ${base} H${x1 + 20}`
    ];
    nicheEl.innerHTML = path.filter(Boolean).map((d, i) => `<path d="${d}" style="--i:${i}"/>`).join("");
    stage.classList.add("ended");
    nicheEl.querySelectorAll("path").forEach((p) => { const L = p.getTotalLength(); p.style.strokeDasharray = L; p.style.strokeDashoffset = L; });
    void nicheEl.offsetWidth;
    nicheEl.classList.add("in");
  }

  // ───────────── per frame ─────────────
  let ready = false, running = false, t = 0, found = [], finding = new Map(), idle = 0, endAt = 0, done = false, rumbled = false;
  const auto = { x: 650, y: 560, on: 0 };   // the wandering torch, from the entrance

  function frame(pts, dt){
    if (!running || !ready) return;
    t += dt;
    const intro = t < T.tilt;
    // the opening: lines, walls rising, the camera tilting
    placeCamera(clamp01(t / T.tilt));
    if (lines){
      lines.geometry.setDrawRange(0, Math.floor(lineCountTotal * clamp01(t / T.draw) / 2) * 2);
      lines.material.opacity = 1 - 0.75 * clamp01((t - T.draw) / 1500);
    }
    const riseK = (t - T.draw * 0.6) / T.rise;
    if (riseK > 0 && !rumbled){ rumbled = true; sfx("rise", { x: 500 }); }
    for (const m of walls.concat(cols)){
      const k = clamp01((riseK - m.userData.delay) / 0.45);
      m.scale.y = Math.max(0.001, ease(k));
      m.visible = k > 0;                  // not there at all until it starts to rise (no flat shapes on the floor)
    }

    // hands -> torches on the floor
    const hands = intro ? [] : pts.map((p) => {
      const r = stage.getBoundingClientRect();
      return toPlan((p.px - r.left) / r.width * W, (p.py - r.top) / r.height * H);
    }).filter(Boolean).slice(0, T.maxTorches);
    idle = hands.length ? 0 : idle + dt;
    // with nobody there the wandering torch goes to the next place not found yet
    const next = PLACES.find((p) => !found.includes(p.id));
    auto.on += ((!intro && !endAt && idle > T.idleTorch && next ? 1 : 0) - auto.on) * Math.min(1, dt / 600);
    if (next){
      const dx = next.x - auto.x, dy = next.y - auto.y, d = Math.hypot(dx, dy), step = T.torchSpeed * dt / 1000;
      if (auto.on > 0.05 && d > 4){ auto.x += dx / d * Math.min(step, d); auto.y += dy / d * Math.min(step, d); }
    }
    const sources = hands.map((h) => ({ x: h.x, y: h.y, k: 1 }));
    if (auto.on > 0.01) sources.push({ x: auto.x, y: auto.y, k: auto.on });

    // lights follow; a light with nobody under it fades
    torches.forEach((tc, i) => {
      const s = sources[i];
      tc.want = s && !endAt ? s.k : 0;
      if (s){ tc.x = tc.on > 0.02 ? tc.x + (s.x - tc.x) * Math.min(1, dt / 90) : s.x; tc.y = tc.on > 0.02 ? tc.y + (s.y - tc.y) * Math.min(1, dt / 90) : s.y; }
      if (tc.want > 0.5 && tc.on < 0.05 && i < hands.length) sfx("torch", { x: toFrame(tc.x, tc.y).x });   // a hand's torch catches
      tc.on += (tc.want - tc.on) * Math.min(1, dt / 250);
      tc.light.intensity = 7 * tc.on;
      tc.light.position.set(wx(tc.x) + 30, 260, wz(tc.y) + 120);
      tc.light.target.position.set(wx(tc.x), 0, wz(tc.y));
      tc.light.target.updateMatrixWorld();
      // the glow it leaves behind
      if (tc.on > 0.2){
        const gx = tc.x / PW * MEM, gy = tc.y / PH * MEM, gr = 26;
        const v = Math.round(255 * T.memory * tc.on);
        const grd = mem.createRadialGradient(gx, gy, 0, gx, gy, gr);
        grd.addColorStop(0, `rgb(${v},${v},${v})`); grd.addColorStop(1, "rgb(0,0,0)");
        mem.globalCompositeOperation = "lighten";      // keeps the brightest, never piles up into rings
        mem.save(); mem.beginPath(); mem.rect(3, 3, MEM - 6, MEM - 6); mem.clip();   // never on the texture's edge,
        mem.fillStyle = grd; mem.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);        // which is stretched over the floor beyond
        mem.restore();
        memTex.needsUpdate = true;
      }
    });

    // places: lit for a while -> found
    for (const p of PLACES){
      const lit = torches.some((tc) => tc.on > 0.5 && Math.hypot(tc.x - p.x, tc.y - p.y) < T.reach);
      const f = lit ? (finding.get(p.id) || 0) + dt : Math.max(0, (finding.get(p.id) || 0) - dt);
      finding.set(p.id, f);
      // its name floats above it while lit (and stays, dimmer, once found)
      const s = toFrame(p.x, p.y, T.wallH + 14);
      p.el.style.left = (s.x / W * 100).toFixed(2) + "%"; p.el.style.top = (s.y / H * 100).toFixed(2) + "%";
      p.el.classList.toggle("lit", lit && !endAt);
      p.el.classList.toggle("found", found.includes(p.id) && !endAt);
      if (f >= T.find && !found.includes(p.id) && !endAt){
        found.push(p.id);
        sfx("choose", { x: s.x });
        showLine(p.id);
        if (found.length === PLACES.length) endAt = t + T.endAfter;
      }
    }

    // the ending
    if (endAt && t >= endAt){
      const k = clamp01((t - endAt) / T.endFade);
      canvas.style.opacity = (1 - k).toFixed(3);
      labelsEl.style.opacity = (1 - k).toFixed(3);
      if (k >= 1 && !nicheEl.classList.contains("in")){ drawNiche(); showLine("end"); sfx("open"); }
      if (t >= endAt + T.endFade + T.niche + T.endHold) done = true;
    }

    renderer.render(scene, camera);
  }

  function reset(){
    t = 0; found = []; finding = new Map(); idle = 0; endAt = 0; done = false; rumbled = false;
    auto.x = 650; auto.y = 560; auto.on = 0;
    torches.forEach((tc) => { tc.on = 0; tc.light.intensity = 0; });
    mem.globalCompositeOperation = "source-over"; mem.fillStyle = "#000"; mem.fillRect(0, 0, MEM, MEM); memTex.needsUpdate = true;
    for (const m of walls.concat(cols)){ m.scale.y = 0.001; m.visible = false; }
    canvas.style.opacity = 1; labelsEl.style.opacity = 1;
    nicheEl.classList.remove("in"); nicheEl.innerHTML = ""; stage.classList.remove("ended");
    shownLine = null; clearTimeout(swap); renderLine();
    PLACES.forEach((p) => p.el && p.el.classList.remove("lit", "found"));
  }

  relayout();
  build();

  return {
    start(){ relayout(); resize(); running = true; },
    stop(){ running = false; },
    reset,
    setTexts(x){ TX = x || {}; applyTexts(); },
    frame,
    relayout,
    // the story tells itself (with the wandering torch), so the section stays open until it has ended
    get playing(){ return running && !done; },
    get done(){ return done; },
    timing: T,
    // for checking from the console: where each place is on the wall (frame px), and the three.js parts
    get debug(){ return { scene, renderer, camera, torches, places: PLACES.map((p) => ({ id: p.id, ...toFrame(p.x, p.y) })), band }; }
  };
}
