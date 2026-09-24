// Tetradrachm section: a scanned Athenian owl you can grab, throw and inspect.
// three.js + cannon-es. Works with a mouse and with hands (see setHands).
//
//   import { createCoin } from "./coin/coin.js";
//   const coin = await createCoin({ stage, model: "assets/coin/coin.glb", texts, stoneTexture: "assets/stone.jpg" });
//   // texts: the `owl` part of one language in content/texts.js; coin.setTexts(...) switches language
//   coin.start();                 // render + simulate
//   coin.setHands([{ x, y, open }])  // x, y in normalised device coords (-1..1), y up
//
// Model: "An Athenian tetradrachm", Classics and Ancient History at Warwick, CC BY 4.0.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import * as CANNON from "cannon-es";

const V3 = THREE.Vector3;
const clamp = THREE.MathUtils.clamp;

// ───────────── facts measured from the scan ─────────────
// Model is normalised to diameter 1, coin normal on local Y.
// local +Y face = Athena, local -Y face = owl (checked by rendering both faces).
const R = 0.5, H = 0.2323 * 0.82;
// the direction each face's image points "up", in coin-local space
const UP_BASE = { 1: new V3(1, 0, 0), [-1]: new V3(0.996, 0, -0.087).normalize() };
const FACE_NAME = { 1: "athena", [-1]: "owl" };

// Rings on the coin: face (s), position on the face (x, z). Their words are in content/texts.js
// (owl.cards.<id>), one entry per id.
export const HOTSPOTS = [
  { id: "olive",   s: 1,  x: 0.25,  z: 0.12 },
  { id: "helmet",  s: 1,  x: 0.12,  z: -0.2 },
  { id: "eye",     s: 1,  x: -0.04, z: 0.29 },
  { id: "earring", s: 1,  x: -0.1,  z: -0.02 },
  { id: "owl",     s: -1, x: 0.22,  z: -0.07 },
  { id: "ethe",    s: -1, x: -0.05, z: -0.27 },
  { id: "branch",  s: -1, x: 0.2,   z: 0.25 },
  { id: "silver",  s: -1, x: -0.22, z: 0.3 }
];

export const DEFAULTS = {
  view: -1,          // -1 camera under the glass, +1 above the table
  span: 11,          // visible table width in coin diameters
  gravity: 14,       // low on purpose: a thrown coin hangs in the air long enough to see it turn
  timeScale: 1,
  align: 0.7,        // how strongly a landing coin turns upright for the viewer
  spin: 1,           // spin given by a throw
  idle: 6,           // seconds without a grab before the close-up
  dwell: 1000,       // ms over a ring before its card opens
  flick: 1.4,        // hand/pointer speed (frame heights / s) that counts as a throw in the close-up
  idleSpin: true,    // slow swaying about the vertical axis in the close-up
  turnEvery: 10,     // seconds of swaying before it turns round to show the other face
  metal: 0.72,
  rough: 0.46,
  offA: 0, offO: 0,  // upright fine-tune per face, degrees
  statueBlock: false, // true: the statue is a solid block the coin bounces off (it splits the table in two)
  blockHeight: 1.6,  // height of that block: throws higher than this pass over Athena
  showCollider: false,
  showBlock: false
};

// Roman numerals for the tally (no zero in Latin: an empty count shows a dot)
export function roman(n){
  if (!n) return "·";
  const T = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [v, r] of T) while (n >= v){ out += r; n -= v; }
  return out;
}

export async function createCoin(opts){
  const P = Object.assign({}, DEFAULTS, opts.params || {});
  const stage = opts.stage;
  const statueBand = opts.statueBand || (() => null);   // () => [ndcX0, ndcX1] or null
  const bgColor = opts.background ?? 0x0e0f11;
  const onResult = opts.onResult || (() => {});

  // ───────────── DOM ─────────────
  stage.classList.add("coin-stage");
  if (opts.stoneTexture) stage.style.setProperty("--coin-stone-tex", `url("${new URL(opts.stoneTexture, location.href).href}")`);
  stage.innerHTML = `
    <canvas class="coin-gl"></canvas>
    <div class="coin-labels"></div>
    <div class="coin-tally">
      <div class="coin-count" data-t="athena"><span class="name"></span><span class="num">·</span></div>
      <div class="coin-count" data-t="owl"><span class="name"></span><span class="num">·</span></div>
    </div>
    <div class="coin-hint"></div>
    <div class="coin-loading"></div>
    <div class="coin-blockviz"></div>`;
  const q$ = (s) => stage.querySelector(s);
  const canvas = q$(".coin-gl"), hintEl = q$(".coin-hint");
  const loadingEl = q$(".coin-loading"), blockViz = q$(".coin-blockviz");

  // ───────────── words (content/texts.js, one language at a time) ─────────────
  let TX = opts.texts || {};
  const tx = (path, fallback = "") => path.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), TX) ?? fallback;
  let loadState = opts.lite ? "done" : "loading";
  function applyTexts(){
    stage.querySelectorAll(".coin-count").forEach((c) => { c.querySelector(".name").textContent = tx("tally." + c.dataset.t, c.dataset.t.toUpperCase()); });
    loadingEl.textContent = loadState === "loading" ? tx("loading") : loadState === "failed" ? tx("loadFailed") + loadError : "";
    for (const h of hotspots){
      h.el.querySelector(".k").textContent = tx(`cards.${h.id}.title`, h.id);
      h.el.querySelector(".t").textContent = tx(`cards.${h.id}.text`);
    }
    if (uiReady) setModeUI();
  }
  let loadError = "", uiReady = false;

  // ───────────── renderer / scene ─────────────
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const labelRenderer = new CSS2DRenderer({ element: q$(".coin-labels") });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(bgColor);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;

  const camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.05, 200);
  camera.up.set(0, 0, -1);

  const hemi = new THREE.HemisphereLight(0xdad4c8, 0x0b0b0c, 0.45);
  const key = new THREE.DirectionalLight(0xfff1dc, 2.2);
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 5;
  const rim = new THREE.DirectionalLight(0xbfd9ff, 0.7);
  scene.add(hemi, key, key.target, rim);

  function canvasTex(draw, size = 512){
    const c = document.createElement("canvas"); c.width = c.height = size;
    draw(c.getContext("2d"), size);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({
    roughness: 0.95, metalness: 0,
    map: canvasTex((g, n) => {
      const grd = g.createRadialGradient(n / 2, n / 2, 20, n / 2, n / 2, n * 0.6);
      grd.addColorStop(0, "#2a2c30"); grd.addColorStop(0.6, "#1b1c1f"); grd.addColorStop(1, "#111214");
      g.fillStyle = grd; g.fillRect(0, 0, n, n);
    })
  }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  scene.add(floor);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    transparent: true, depthWrite: false, opacity: opts.glassOpacity ?? 0.55, side: THREE.DoubleSide,
    map: canvasTex((g, n) => {
      for (let i = 0; i < 2600; i++){
        g.fillStyle = `rgba(255,255,255,${(Math.random() * 0.16).toFixed(3)})`;
        g.beginPath(); g.arc(Math.random() * n, Math.random() * n, Math.random() * 1.3 + 0.2, 0, Math.PI * 2); g.fill();
      }
    }, 1024)
  }));
  glass.rotation.x = -Math.PI / 2; glass.renderOrder = 10;
  scene.add(glass);

  // ───────────── physics ─────────────
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -P.gravity, 0) });
  world.allowSleep = true;
  world.solver.iterations = 20;
  world.defaultContactMaterial.friction = 0.36;
  world.defaultContactMaterial.restitution = 0.26;
  world.defaultContactMaterial.contactEquationStiffness = 1e7;
  function plane(e){
    const b = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    b.quaternion.setFromEuler(e[0], e[1], e[2]); world.addBody(b); return b;
  }
  const W = {
    floor: plane([-Math.PI / 2, 0, 0]), left: plane([0, Math.PI / 2, 0]), right: plane([0, -Math.PI / 2, 0]),
    top: plane([0, 0, 0]), bottom: plane([0, Math.PI, 0]), ceil: plane([Math.PI / 2, 0, 0])
  };
  let block = null;                     // the statue: an invisible block the coin bounces off
  // the statue's band in world x: `on` when there is a statue (used to frame the close-up and place cards
  // beside it), `solid` when it is also a physics block
  const blockX = { on: false, solid: false, x0: 0, x1: 0 };
  const coinBody = new CANNON.Body({
    mass: 1, shape: new CANNON.Cylinder(R, R, H, 40),
    linearDamping: 0.03, angularDamping: 0.05, sleepSpeedLimit: 0.14, sleepTimeLimit: 0.45
  });
  world.addBody(coinBody);

  // ───────────── coin visuals ─────────────
  const coinGroup = new THREE.Group();
  scene.add(coinGroup);
  const placeholder = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 64),
    new THREE.MeshStandardMaterial({ color: 0xb8b2a4, metalness: 0.7, roughness: 0.45 }));
  coinGroup.add(placeholder);
  const colliderViz = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 40, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xf0b429, wireframe: true, transparent: true, opacity: 0.55 }));
  colliderViz.visible = P.showCollider;
  coinGroup.add(colliderViz);
  const pickProxy = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.35, R * 1.35, H * 3, 24),
    new THREE.MeshBasicMaterial({ visible: false }));
  coinGroup.add(pickProxy);

  // rings: a disc between `inner` and 1, cut to an arc by `progress`
  function ringMat(color, inner, progress = 1, opacity = 0.95){
    return new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false,
      uniforms: { color: { value: new THREE.Color(color) }, opacity: { value: opacity }, progress: { value: progress }, inner: { value: inner } },
      vertexShader: "varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "uniform vec3 color; uniform float opacity; uniform float progress; uniform float inner; varying vec2 vP;" +
        "void main(){ float r = length(vP); if (r > 1.0 || r < inner) discard; float a = atan(vP.x, vP.y) / 6.2831853 + 0.5; if (a > progress) discard; gl_FragColor = vec4(color, opacity); }"
    });
  }
  const quad = new THREE.PlaneGeometry(2, 2);
  const hotspots = [];
  function buildHotspots(model){
    coinGroup.updateMatrixWorld(true);
    const M = coinGroup.matrixWorld, rc = new THREE.Raycaster();
    for (const h of HOTSPOTS){
      rc.set(new V3(h.x, h.s * 0.6, h.z).applyMatrix4(M), new V3(0, -h.s, 0).transformDirection(M));
      const hit = rc.intersectObject(model, true)[0];
      const p = hit ? coinGroup.worldToLocal(hit.point.clone()) : new V3(h.x, h.s * H * 0.55, h.z);
      p.y += h.s * 0.006;
      const col = 0xffffff;
      const g = new THREE.Group();
      g.position.copy(p);
      g.rotation.x = h.s > 0 ? -Math.PI / 2 : Math.PI / 2;
      const ring = new THREE.Mesh(quad, ringMat(col, 0.74, 1, 0.8)); ring.scale.setScalar(0.042); ring.renderOrder = 20;
      const dot = new THREE.Mesh(quad, ringMat(col, 0.0)); dot.scale.setScalar(0.012); dot.renderOrder = 20;
      const prog = new THREE.Mesh(quad, ringMat(0xffffff, 0.84, 0)); prog.scale.setScalar(0.062); prog.renderOrder = 21;
      const hitDisc = new THREE.Mesh(new THREE.CircleGeometry(0.095, 20), new THREE.MeshBasicMaterial({ visible: false }));
      g.add(ring, dot, prog, hitDisc);
      const el = document.createElement("div");
      el.className = "coin-hs" + (h.s < 0 ? " owl" : "");
      el.innerHTML = '<div class="lead"></div><div class="card"><div class="k"></div><div class="t"></div></div>';
      g.add(new CSS2DObject(el));
      coinGroup.add(g);
      hotspots.push({ ...h, g, ring, dot, prog, hitDisc, el, dwell: 0, open: false, closeAt: 0, fade: 0 });
    }
    applyTexts();
  }

  let coinMats = [];
  function adoptModel(model){
    model.traverse((o) => {
      if (o.isMesh){
        o.castShadow = true; o.receiveShadow = true;
        o.material.side = THREE.DoubleSide;
        o.material.metalness = P.metal; o.material.roughness = P.rough;
        o.material.needsUpdate = true; coinMats.push(o.material);
      }
    });
    coinGroup.remove(placeholder);
    coinGroup.add(model);
    loadState = "done";
    buildHotspots(model);
  }
  async function loadModel(){
    const url = opts.model || "coin.glb";
    if (url.endsWith(".glb") || url.endsWith(".gltf")){
      const gltf = await new GLTFLoader().loadAsync(url);
      adoptModel(gltf.scene);
      return;
    }
    // base64 geometry + separate texture (used where .glb can't be served)
    const [b64, tex] = await Promise.all([
      fetch(url).then((r) => { if (!r.ok) throw new Error(url + " " + r.status); return r.text(); }),
      new THREE.TextureLoader().loadAsync(opts.texture || "coin.jpg")
    ]);
    const raw = atob(b64.trim()), bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const gltf = await new GLTFLoader().parseAsync(bytes.buffer, "");
    gltf.scene.traverse((o) => { if (o.isMesh) o.material.map = tex; });
    adoptModel(gltf.scene);
  }
  if (opts.lite) buildHotspots(placeholder);
  else loadModel().catch((err) => {
    loadState = "failed";
    loadError = " · " + (location.protocol === "file:" ? "local server needed" : err.message);
    applyTexts();
    console.error(err);
  });

  // ───────────── geometry of the table ─────────────
  const bounds = { x: 5.5, z: 3.1, camH: 10 };
  const camGoal = { pos: new V3(), look: new V3() };
  const camLook = new V3();
  const screenRight = () => new V3(P.view > 0 ? 1 : -1, 0, 0);
  const screenUp = () => new V3(0, 0, -1);
  const ndcToWorldX = (nx) => nx * bounds.x * (P.view > 0 ? 1 : -1);    // at floor level
  const worldToNdcX = (wx) => wx / bounds.x * (P.view > 0 ? 1 : -1);

  function playCamera(){ camGoal.pos.set(0, P.view * bounds.camH, 0); camGoal.look.set(0, 0, 0); }
  function stageRect(){ return stage.getBoundingClientRect(); }

  function layout(snap){
    const halfW = P.span / 2, halfH = halfW / camera.aspect;
    const camH = halfH / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    Object.assign(bounds, { x: halfW, z: halfH, camH });
    W.left.position.set(-halfW, 0, 0); W.right.position.set(halfW, 0, 0);
    W.top.position.set(0, 0, -halfH); W.bottom.position.set(0, 0, halfH);
    W.ceil.position.set(0, camH * 0.55, 0);
    floor.scale.set(halfW * 2.6, halfH * 2.6, 1);
    glass.scale.set(halfW * 2.6, halfH * 2.6, 1);
    floor.visible = P.view > 0; glass.visible = P.view < 0 && (opts.glassOpacity ?? 0.55) > 0;
    key.position.set(-halfW * 0.45, P.view * camH, -halfH * 0.55);
    key.castShadow = P.view > 0;
    const sc = key.shadow.camera;
    sc.left = -halfW - 1; sc.right = halfW + 1; sc.top = halfH + 1; sc.bottom = -halfH - 1;
    sc.near = 0.5; sc.far = camH * 2.2; sc.updateProjectionMatrix();
    rim.position.set(halfW * 0.6, -P.view * camH, halfH * 0.4);
    hemi.color.set(P.view > 0 ? 0xdad4c8 : 0xc9d3e0);
    // statue block
    if (block){ world.removeBody(block); block = null; }
    const band = statueBand();
    blockX.on = !!band; blockX.solid = false;
    if (band){
      const a = ndcToWorldX(band[0]), b = ndcToWorldX(band[1]);
      blockX.x0 = Math.min(a, b); blockX.x1 = Math.max(a, b);
      if (P.statueBlock){
        block = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3((blockX.x1 - blockX.x0) / 2, P.blockHeight / 2, halfH + 1)) });
        block.position.set((blockX.x0 + blockX.x1) / 2, P.blockHeight / 2, 0);
        world.addBody(block);
        blockX.solid = true;
      }
      const l = (band[0] + 1) / 2 * 100, r = (band[1] + 1) / 2 * 100;
      Object.assign(blockViz.style, { left: l + "%", width: (r - l) + "%", display: P.showBlock ? "block" : "none" });
    } else blockViz.style.display = "none";
    if (mode === "play"){ playCamera(); if (snap){ camera.position.copy(camGoal.pos); camLook.copy(camGoal.look); } }
    coinBody.wakeUp();
  }
  // world x of the middle of the free area on one side of the statue (or the table centre)
  function zoneCentreX(side){
    if (!blockX.on) return 0;
    return side < 0 ? (-bounds.x + blockX.x0) / 2 : (blockX.x1 + bounds.x) / 2;
  }

  // ───────────── orientation helpers ─────────────
  const upOffset = { 1: THREE.MathUtils.degToRad(P.offA), [-1]: THREE.MathUtils.degToRad(P.offO) };
  const faceUp = (s) => UP_BASE[s].clone().applyAxisAngle(new V3(0, 1, 0), upOffset[s]);
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
  const bodyQ = (out = new THREE.Quaternion()) => out.set(coinBody.quaternion.x, coinBody.quaternion.y, coinBody.quaternion.z, coinBody.quaternion.w);
  const setBodyQ = (q) => coinBody.quaternion.set(q.x, q.y, q.z, q.w);
  function visibleFace(q = bodyQ()){
    return new V3(0, 1, 0).applyQuaternion(q).y * P.view >= 0 ? 1 : -1;
  }
  // orientation showing face s towards `towardCam` with its image upright on screen (screen-up = world -Z)
  function uprightQuat(s, towardCam, out = new THREE.Quaternion()){
    const nL = new V3(0, s, 0), uL = faceUp(s), tL = new V3().crossVectors(uL, nL);
    const nW = towardCam.clone().normalize();
    const uW = new V3(0, 0, -1).addScaledVector(nW, nW.z).normalize();
    const tW = new V3().crossVectors(uW, nW);
    _m.makeBasis(uL, nL, tL); _m2.makeBasis(uW, nW, tW);
    _m2.multiply(_m.transpose());
    return out.setFromRotationMatrix(_m2);
  }
  function steerTo(qT, gain, maxW){
    bodyQ(_q);
    _q2.copy(qT).multiply(_q.clone().invert());
    if (_q2.w < 0){ _q2.x *= -1; _q2.y *= -1; _q2.z *= -1; _q2.w *= -1; }
    const ang = 2 * Math.acos(clamp(_q2.w, -1, 1));
    const s = Math.sqrt(Math.max(1 - _q2.w * _q2.w, 0));
    if (s < 1e-5){ coinBody.angularVelocity.setZero(); return; }
    const w = Math.min(ang * gain, maxW);
    coinBody.angularVelocity.set(_q2.x / s * w, _q2.y / s * w, _q2.z / s * w);
  }

  // ───────────── results ─────────────
  let pending = false;
  const counts = { athena: 0, owl: 0 };
  function showTally(){
    stage.querySelectorAll(".coin-count").forEach((c) => { c.querySelector(".num").textContent = roman(counts[c.dataset.t]); });
  }
  // a landing adds one to its face's count, and that count lights up for a moment
  function showResult(kind){
    if (kind === "edge"){ onResult(kind, { ...counts }); return; }   // rare, not counted
    counts[kind]++;
    showTally();
    const c = stage.querySelector(`.coin-count[data-t="${kind}"]`);
    c.classList.remove("hit"); void c.offsetWidth; c.classList.add("hit");
    onResult(kind, { ...counts });
  }
  function clearResult(){ stage.querySelectorAll(".coin-count.hit").forEach((c) => c.classList.remove("hit")); }
  function evaluate(){
    if (!pending || grabBy !== null || mode !== "play") return;
    pending = false;
    const up = coinBody.quaternion.vmult(new CANNON.Vec3(0, 1, 0)).y;
    showResult(Math.abs(up) < 0.55 ? "edge" : FACE_NAME[visibleFace()]);
  }
  coinBody.addEventListener("sleep", evaluate);

  // ───────────── modes ─────────────
  let mode = "play";                  // "play" | "inspect"
  let lastTouch = performance.now();  // last grab / throw
  const INS = { t: 1, fromP: new V3(), toP: new V3(), fromQ: new THREE.Quaternion(),
                drag: false, hist: [], lastX: 0, lastY: 0, idleSince: 0, face: 1,
                amp: 0, phase: 0, sinceTurn: 0, turnT: -1, side: -1, dist: 1.9 };
  const INSPECT_Y = 0.6;

  function setModeUI(){
    stage.classList.toggle("inspect", mode === "inspect");
    hintEl.textContent = tx(mode === "inspect" ? "hint.inspect" : "hint.play");
  }
  // close-up framing: coin centred in its free zone, sized to fit it
  function inspectFrame(){
    const r = stageRect(), band = blockX.on ? statueBand() : null;
    let ndcX = 0, zoneFrac = 1;
    if (band){
      const cx = worldToNdcX(coinBody.position.x);
      INS.side = cx < (band[0] + band[1]) / 2 ? -1 : 1;
      const z0 = INS.side < 0 ? -1 : band[1], z1 = INS.side < 0 ? band[0] : 1;
      ndcX = (z0 + z1) / 2; zoneFrac = (z1 - z0) / 2;
    }
    const zonePx = zoneFrac * r.width;
    const coinPx = band ? Math.min(0.7 * r.height, 0.62 * zonePx) : 0.8 * r.height;
    INS.dist = 1 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * (coinPx / r.height));
    const halfWAtD = INS.dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    camGoal.pos.copy(INS.toP).add(new V3(0, P.view * INS.dist, 0)).addScaledVector(screenRight(), -ndcX * halfWAtD);
    camGoal.look.copy(camGoal.pos).add(new V3(0, -P.view * INS.dist, 0));
  }
  function enterInspect(){
    if (mode === "inspect" || grabBy !== null) return;
    mode = "inspect";
    coinBody.type = CANNON.Body.KINEMATIC;
    coinBody.velocity.setZero(); coinBody.angularVelocity.setZero();
    INS.face = visibleFace();
    INS.fromP.set(coinBody.position.x, coinBody.position.y, coinBody.position.z);
    INS.toP.set(clamp(INS.fromP.x, -bounds.x + 1.0, bounds.x - 1.0), INSPECT_Y, clamp(INS.fromP.z, -bounds.z + 0.8, bounds.z - 0.8));
    bodyQ(INS.fromQ);
    INS.t = 0; INS.drag = false; INS.idleSince = performance.now();
    INS.amp = 0; INS.sinceTurn = 0; INS.turnT = -1;
    inspectFrame();
    setModeUI();
  }
  function exitInspect(){
    if (mode !== "inspect") return;
    mode = "play";
    closeAllCards();
    coinBody.type = CANNON.Body.DYNAMIC;
    coinBody.wakeUp();
    playCamera();
    setModeUI();
  }
  function dropFromInspect(){
    if (mode !== "inspect") return;
    exitInspect();
    coinBody.velocity.setZero(); coinBody.angularVelocity.setZero();
    pending = true; lastTouch = performance.now();
  }

  // ───────────── grabbing ─────────────
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const holdPlane = new THREE.Plane(new V3(0, 1, 0), 0);
  const HOLD = { on: false, face: 1, target: new V3(), hist: [], wheel: 0, flipAt: 0 };
  let grabBy = null;                  // null | "mouse" | hand id
  let noGrabUntil = 0;                // after a flick the throwing hand is still closed: don't let it re-grab
  const holdY = () => P.view > 0 ? 1.15 : 0.5;

  function pointerOnPlane(nx, ny, out){
    holdPlane.constant = -holdY();
    ndc.set(nx, ny); raycaster.setFromCamera(ndc, camera);
    return raycaster.ray.intersectPlane(holdPlane, out);
  }
  function clampTarget(t){
    const s = Math.abs(t.y - P.view * bounds.camH) / bounds.camH;
    const mx = bounds.x * s - R * 0.95, mz = bounds.z * s - R * 0.95;
    t.x = clamp(t.x, -mx, mx); t.z = clamp(t.z, -mz, mz);
    if (blockX.solid){   // can't be carried through a solid statue
      const m = R * 1.05;
      if (t.x > blockX.x0 - m && t.x < blockX.x1 + m){
        const toLeft = Math.abs(t.x - (blockX.x0 - m)), toRight = Math.abs(t.x - (blockX.x1 + m));
        t.x = toLeft < toRight ? blockX.x0 - m : blockX.x1 + m;
      }
    }
  }
  function coinScreen(){
    const c = coinGroup.getWorldPosition(new V3());
    const a = c.clone().project(camera), b = c.clone().addScaledVector(screenRight(), R).project(camera);
    return { x: a.x, y: a.y, r: Math.abs(b.x - a.x) };
  }
  function nearCoin(nx, ny, generous){
    ndc.set(nx, ny); raycaster.setFromCamera(ndc, camera);
    if (raycaster.intersectObject(pickProxy, false)[0]) return true;
    if (!generous) return false;
    const c = coinScreen(), asp = camera.aspect;
    return Math.hypot((nx - c.x) * asp, ny - c.y) < c.r * asp * 1.8;
  }

  function beginGrab(nx, ny, who = "mouse"){
    if (grabBy !== null || !nearCoin(nx, ny, who !== "mouse")) return false;
    grabBy = who;
    lastTouch = performance.now();
    if (mode === "inspect"){
      INS.drag = true; INS.hist = [{ t: performance.now(), x: nx, y: ny }]; INS.lastX = nx; INS.lastY = ny;
      INS.t = 1; INS.amp = 0; INS.turnT = -1; INS.sinceTurn = 0;
      stage.classList.add("holding");
      return true;
    }
    HOLD.on = true;
    HOLD.face = visibleFace();
    HOLD.hist.length = 0; HOLD.wheel = 0;
    coinBody.type = CANNON.Body.KINEMATIC;
    coinBody.velocity.setZero(); coinBody.angularVelocity.setZero();
    coinBody.wakeUp();
    if (pointerOnPlane(nx, ny, HOLD.target)) clampTarget(HOLD.target);
    HOLD.hist.push({ t: performance.now(), p: HOLD.target.clone() });
    clearResult();
    stage.classList.add("holding");
    return true;
  }
  // speed of the last ~150 ms of a pointer/hand track, ending at its last sample
  function trackVelocity(hist, window = 150){
    if (hist.length < 2) return null;
    const b = hist[hist.length - 1];
    let a = hist[hist.length - 2];
    for (let i = hist.length - 2; i >= 0 && b.t - hist[i].t <= window; i--) a = hist[i];
    const dt = (b.t - a.t) / 1000;
    return dt > 0.012 ? { a, b, dt } : null;
  }
  function moveGrab(nx, ny){
    const now = performance.now();
    if (mode === "inspect" && INS.drag){
      rotateInHand(nx - INS.lastX, ny - INS.lastY);
      INS.lastX = nx; INS.lastY = ny;
      INS.hist.push({ t: now, x: nx, y: ny });
      while (INS.hist.length > 2 && now - INS.hist[0].t > 400) INS.hist.shift();
      lastTouch = now;
      // a fast flick throws straight away, without waiting for the hand to open
      const v = trackVelocity(INS.hist, 120);
      if (v){
        const vx = (v.b.x - v.a.x) / v.dt, vy = (v.b.y - v.a.y) / v.dt, sp = Math.hypot(vx, vy) / 2;
        if (sp > P.flick){
          INS.drag = false; INS.idleSince = now; noGrabUntil = now + 900;
          grabBy = null; stage.classList.remove("holding");
          throwFromInspect(vx, vy, sp);
        }
      }
      return;
    }
    if (!HOLD.on) return;
    if (pointerOnPlane(nx, ny, HOLD.target)) clampTarget(HOLD.target);
    HOLD.hist.push({ t: now, p: HOLD.target.clone() });
    while (HOLD.hist.length > 2 && now - HOLD.hist[0].t > 400) HOLD.hist.shift();
  }
  function endGrab(silent){
    stage.classList.remove("holding");
    const now = performance.now();
    grabBy = null;
    lastTouch = now;
    if (mode === "inspect"){
      if (!INS.drag) return;
      INS.drag = false; INS.idleSince = now; INS.face = visibleFace();
      const v = !silent && trackVelocity(INS.hist);
      if (v){
        const vx = (v.b.x - v.a.x) / v.dt, vy = (v.b.y - v.a.y) / v.dt;
        const sp = Math.hypot(vx, vy) / 2;
        if (sp > P.flick) throwFromInspect(vx, vy, sp);
      }
      return;
    }
    if (!HOLD.on) return;
    HOLD.on = false;
    coinBody.type = CANNON.Body.DYNAMIC;
    if (silent) return;
    const tv = trackVelocity(HOLD.hist);
    const v = new V3();
    if (tv) v.subVectors(tv.b.p, tv.a.p).divideScalar(tv.dt);
    v.y = 0; v.clampLength(0, 16);
    const speed = v.length();
    if (speed > 0.7){
      // a coin flip: mostly up, a little along the swing, turning end over end
      launch(v.clone().multiplyScalar(0.3).clampLength(0, 4.5),
             clamp(0.9 + speed * 0.3, 1.2, 4), clamp(2 + speed * 0.28, 2.5, 6), new V3(v.z, 0, -v.x));
    } else {
      coinBody.velocity.set(v.x, 0, v.z);
      coinBody.angularVelocity.setZero();
    }
    coinBody.wakeUp();
    pending = true;
  }
  function rotateInHand(dnx, dny){
    const drag = screenRight().multiplyScalar(dnx * camera.aspect).addScaledVector(screenUp(), dny);
    const len = drag.length();
    if (len < 1e-6) return;
    const axis = new V3().crossVectors(new V3(0, P.view, 0), drag).normalize();
    _q.setFromAxisAngle(axis, len * 1.7);
    setBodyQ(_q.multiply(bodyQ(_q2)).normalize());
  }
  function throwFromInspect(vx, vy, sp){
    exitInspect();
    const dir = screenRight().multiplyScalar(vx).addScaledVector(screenUp(), vy); dir.y = 0;
    const hor = dir.lengthSq() > 0 ? dir.clone().normalize().multiplyScalar(Math.min(sp * 0.6, 2.5)) : new V3();
    const drag = screenRight().multiplyScalar(vx * camera.aspect).addScaledVector(screenUp(), vy);
    const axis = new V3().crossVectors(new V3(0, P.view, 0), drag);
    launch(hor, clamp(1.4 + sp * 0.5, 1.6, 4), clamp(3 + sp * 0.5, 3, 6), axis);
    clearResult();
  }
  // Throw the coin up to `height`, turning `turns` times about `axis` (horizontal) before it lands.
  // The low gravity and the spin tied to the flight time are what make it read as a coin flip.
  function launch(hor, height, turns, axis){
    coinBody.type = CANNON.Body.DYNAMIC;
    const vy = Math.sqrt(2 * P.gravity * height);
    const drop = Math.max(coinBody.position.y - H / 2, 0);
    const flight = (vy + Math.sqrt(vy * vy + 2 * P.gravity * drop)) / P.gravity;
    aimClear(hor, flight);
    coinBody.velocity.set(hor.x, vy, hor.z);
    axis.y = 0;
    if (axis.lengthSq() < 1e-6) axis.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    axis.normalize();
    const w = turns * Math.PI * 2 / flight * P.spin;
    coinBody.angularVelocity.set(axis.x * w, (Math.random() - 0.5) * 1.2, axis.z * w);
    coinBody.wakeUp();
    pending = true; lastTouch = performance.now();
  }
  // Don't let a throw come down behind the statue, where nobody could see the result:
  // if it would land there, stretch or shorten the throw to land just beside her.
  function aimClear(hor, flight){
    if (!blockX.on || blockX.solid) return;
    const m = R * 1.4, x0 = blockX.x0 - m, x1 = blockX.x1 + m;
    const land = coinBody.position.x + hor.x * flight;
    if (land <= x0 || land >= x1) return;
    const goal = hor.x > 0.3 ? x1 : hor.x < -0.3 ? x0 : (land - x0 < x1 - land ? x0 : x1);
    hor.x = clamp((goal - coinBody.position.x) / flight, -7, 7);
  }
  function flipInHand(){
    if (!HOLD.on || performance.now() < HOLD.flipAt) return;
    HOLD.face *= -1;
    HOLD.flipAt = performance.now() + 420;
  }
  function toss(){
    if (mode === "inspect") exitInspect();
    if (grabBy !== null) endGrab(true);
    clearResult();
    coinBody.type = CANNON.Body.DYNAMIC;
    coinBody.wakeUp();
    if (coinBody.position.y < 0.6) coinBody.position.y = 0.6;
    const a = Math.random() * Math.PI * 2;
    launch(new V3((Math.random() - 0.5) * 1.5, 0, (Math.random() - 0.5) * 1.5), 2.4 + Math.random(), 3.5 + Math.random() * 2,
           new V3(Math.cos(a), 0, Math.sin(a)));
  }
  function place(){
    coinBody.type = CANNON.Body.DYNAMIC;
    coinBody.velocity.setZero(); coinBody.angularVelocity.setZero();
    coinBody.position.set(zoneCentreX(-1), 2.2, 0);
    coinBody.quaternion.setFromEuler(0.35, 0.9, -0.25);
    coinBody.angularVelocity.set(1.2, 0.3, -1.6);
    coinBody.wakeUp();
    pending = true; lastTouch = performance.now();
  }

  // ───────────── hands ─────────────
  // setHands([{ x, y, open }]) — x, y NDC (-1..1, y up), one entry per visible hand, called per camera frame.
  // Hands are matched frame to frame by position; the first closed hand on the coin holds it until it opens.
  let tracked = new Map(), nextHandId = 1, handHover = [], lastHandsAt = 0;
  function setHands(list){
    const now = performance.now();
    const prev = [...tracked.values()], used = new Set(), next = new Map();
    for (const h of list){
      let best = null, bd = 0.35;
      if (h.id !== undefined) best = prev.find((p) => p.id === h.id) || null;
      else for (const p of prev){
        if (used.has(p.id)) continue;
        const d = Math.hypot(p.x - h.x, p.y - h.y);
        if (d < bd){ bd = d; best = p; }
      }
      const id = h.id !== undefined ? h.id : (best ? best.id : nextHandId++);
      if (best) used.add(best.id);
      const k = 0.55;   // smoothing
      next.set(id, {
        id, open: !!h.open, seen: now, cool: best ? best.cool : 0,
        x: best ? best.x + (h.x - best.x) * k : h.x,
        y: best ? best.y + (h.y - best.y) * k : h.y
      });
    }
    for (const p of prev) if (!used.has(p.id) && now - p.seen < 300) next.set(p.id, p);   // brief dropouts
    tracked = next;
    if (list.length) lastHandsAt = now;

    if (typeof grabBy === "number"){
      const h = tracked.get(grabBy);
      if (!h || h.open){ if (h) h.cool = now + 500; endGrab(false); }
      else if (h.seen === now) moveGrab(h.x, h.y);
    }
    if (grabBy === null && now > noGrabUntil){
      for (const h of tracked.values()){
        if (!h.open && h.seen === now && now > h.cool && beginGrab(h.x, h.y, h.id)) break;
      }
    }
    handHover = [...tracked.values()].filter((h) => h.open).map((h) => [h.x, h.y]);
  }

  // ───────────── hotspots ─────────────
  let mouseHover = null;
  function closeAllCards(){ hotspots.forEach((h) => { h.open = false; h.dwell = 0; h.el.classList.remove("open"); }); }
  function updateHotspots(dt){
    const inspecting = mode === "inspect" && INS.t >= 1;
    coinGroup.updateMatrixWorld(true);
    const hovered = new Set();
    if (inspecting && !INS.drag){
      const pts = handHover.slice(); if (mouseHover) pts.push(mouseHover);
      const discs = hotspots.filter((h) => h.fade > 0.5).map((h) => h.hitDisc);
      for (const [x, y] of pts){
        ndc.set(x, y); raycaster.setFromCamera(ndc, camera);
        const hit = raycaster.intersectObjects(discs, false)[0];
        if (hit) hovered.add(hotspots.find((h) => h.hitDisc === hit.object));
      }
    }
    const now = performance.now();
    for (const h of hotspots){
      const n = new V3(0, h.s, 0).transformDirection(coinGroup.matrixWorld);
      const p = h.g.getWorldPosition(new V3());
      const facing = n.dot(camera.position.clone().sub(p).normalize());
      const want = inspecting && facing > 0.3 ? 1 : 0;
      h.fade += (want - h.fade) * Math.min(1, dt * 6);
      h.g.visible = h.fade > 0.02;
      h.ring.material.uniforms.opacity.value = 0.8 * h.fade;
      h.dot.material.uniforms.opacity.value = 0.95 * h.fade;
      if (hovered.has(h)){
        h.dwell += dt * 1000;
        if (h.dwell >= P.dwell && !h.open){
          hotspots.forEach((o) => { if (o !== h){ o.open = false; o.el.classList.remove("open"); } });
          h.open = true; h.el.classList.add("open");
        }
        h.closeAt = now + 2600;
      } else {
        h.dwell = Math.max(0, h.dwell - dt * 2000);
        if (h.open && now > h.closeAt){ h.open = false; h.el.classList.remove("open"); }
      }
      if (!want && h.open){ h.open = false; h.el.classList.remove("open"); }
      h.prog.material.uniforms.progress.value = h.open ? 1 : clamp(h.dwell / P.dwell, 0, 1);
      h.prog.material.uniforms.opacity.value = (h.open ? 0.9 : 0.8) * h.fade;
      h.ring.scale.setScalar(0.042 * (1 + (h.open ? 0 : Math.sin(now / 420 + h.x * 9) * 0.08)));
      if (h.open) placeCard(h, p);
    }
  }
  // Cards sit outside the coin, in the free zone (never over the statue), joined to their ring by a line.
  function placeCard(h, p){
    const r = stageRect();
    const px = (v) => { const q = v.clone().project(camera); return [(q.x + 1) / 2 * r.width, (1 - q.y) / 2 * r.height]; };
    const c = coinGroup.getWorldPosition(new V3());
    const [cx, cy] = px(c);
    const [ex] = px(c.clone().addScaledVector(screenRight(), R * 1.02));
    const rad = Math.abs(ex - cx);
    const [hx, hy] = px(p);
    let z0 = 0, z1 = r.width;
    const band = blockX.on ? statueBand() : null;
    if (band){
      const b0 = (band[0] + 1) / 2 * r.width, b1 = (band[1] + 1) / 2 * r.width;
      if (cx < (b0 + b1) / 2) z1 = b0; else z0 = b1;
    }
    const card = h.el.querySelector(".card"), lead = h.el.querySelector(".lead");
    const cw = card.offsetWidth || 240, ch = card.offsetHeight || 110, gap = 18;
    const roomR = z1 - (cx + rad), roomL = (cx - rad) - z0;
    let left, top;
    if (hx >= cx && roomR >= cw + gap + 8){ left = cx + rad + gap; top = hy - 14; }
    else if (hx < cx && roomL >= cw + gap + 8){ left = cx - rad - gap - cw; top = hy - 14; }
    else if (roomR >= cw + gap + 8){ left = cx + rad + gap; top = hy - 14; }
    else if (roomL >= cw + gap + 8){ left = cx - rad - gap - cw; top = hy - 14; }
    else {
      left = clamp(cx - cw / 2, z0 + 8, Math.max(z0 + 8, z1 - cw - 8));
      top = (r.height - (cy + rad) >= ch + gap) || hy >= cy ? cy + rad + gap : cy - rad - gap - ch;
    }
    top = clamp(top, 8, r.height - ch - 8);
    card.style.left = (left - hx) + "px"; card.style.top = (top - hy) + "px"; card.style.right = "auto";
    // leader: from the ring to the nearest point on the card
    const tx = clamp(hx, left, left + cw) - hx, ty = clamp(hy, top, top + ch) - hy;
    const len = Math.max(0, Math.hypot(tx, ty) - 8);
    lead.style.width = len + "px";
    lead.style.transform = `rotate(${Math.atan2(ty, tx)}rad) translateX(8px)`;
  }

  // ───────────── per-frame behaviour ─────────────
  const _yaw = new CANNON.Quaternion();
  function guideLanding(dt){
    if (P.align <= 0) return;
    const q = bodyQ();
    const upY = new V3(0, 1, 0).applyQuaternion(q).y;
    if (Math.abs(upY) < 0.72 || coinBody.position.y > 0.5) return;
    const s = visibleFace(q);
    const uw = faceUp(s).applyQuaternion(q);
    const err = Math.atan2(uw.x, -uw.z);
    const speed = coinBody.velocity.length();
    const slow = speed < 0.6 && Math.abs(upY) > 0.97;
    if (!slow){
      if (speed < 0.3) return;
      const target = clamp(err * 4.2 * P.align, -6 * P.align, 6 * P.align);
      coinBody.angularVelocity.y += (target - coinBody.angularVelocity.y) * Math.min(1, dt * 7 * P.align);
      return;
    }
    if (Math.abs(err) < 0.012) return;
    const step = Math.sign(err) * Math.min(Math.abs(err) * Math.min(1, dt * 4 * P.align), 5 * P.align * dt);
    _yaw.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), step);
    _yaw.mult(coinBody.quaternion, coinBody.quaternion);
    coinBody.quaternion.normalize();
    coinBody.angularVelocity.y = 0;
    coinBody.wakeUp();
  }
  // no rolling resistance in cannon-es: stop rim-rolling and wall-leaning
  function settleAssist(dt){
    const p = coinBody.position;
    const n = new V3(0, 1, 0).applyQuaternion(bodyQ());
    const speed = coinBody.velocity.length();
    // a coin that still ends up behind the statue slides out to the nearer side
    if (blockX.on && !blockX.solid && p.y < R + 0.3){
      const m = R * 1.1, x0 = blockX.x0 - m, x1 = blockX.x1 + m;
      if (p.x > x0 && p.x < x1){
        const dir = p.x - x0 < x1 - p.x ? -1 : 1;
        p.x += dir * 2 * dt;                                  // glide, whatever the friction
        if (coinBody.velocity.x * dir < 0) coinBody.velocity.x *= 0.8;
        coinBody.wakeUp();
      }
    }
    if (p.y > R + 0.08){ coinBody.linearDamping = 0.03; coinBody.angularDamping = 0.05; return; }
    if (Math.abs(n.y) > 0.97){ coinBody.linearDamping = 0.03; coinBody.angularDamping = speed < 1.2 ? 0.45 : 0.05; return; }
    const w = new V3(), m = R + 0.25;
    if (bounds.x - p.x < m) w.x -= 1;
    if (p.x + bounds.x < m) w.x += 1;
    if (bounds.z - p.z < m) w.z -= 1;
    if (p.z + bounds.z < m) w.z += 1;
    if (blockX.solid && p.y < P.blockHeight + R){
      if (p.x < blockX.x0 && blockX.x0 - p.x < m) w.x -= 1;
      if (p.x > blockX.x1 && p.x - blockX.x1 < m) w.x += 1;
    }
    if (w.lengthSq() > 0){
      w.normalize();
      const tip = new V3(0, 1, 0).cross(w);
      coinBody.velocity.x += w.x * 6 * dt; coinBody.velocity.z += w.z * 6 * dt;
      coinBody.angularVelocity.x += tip.x * 12 * dt; coinBody.angularVelocity.z += tip.z * 12 * dt;
      coinBody.linearDamping = 0.2; coinBody.angularDamping = 0.2;
      coinBody.wakeUp();
      return;
    }
    if (Math.abs(n.y) > 0.75){ coinBody.linearDamping = 0.03; coinBody.angularDamping = 0.2; return; }
    coinBody.linearDamping = 0.35; coinBody.angularDamping = 0.3;
    if (speed < 1.6){
      const axis = new V3().crossVectors(n, new V3(0, n.y >= 0 ? 1 : -1, 0));
      if (axis.lengthSq() > 1e-8){
        axis.normalize();
        const k = (1.6 - speed) * 9 * dt;
        coinBody.angularVelocity.x += axis.x * k; coinBody.angularVelocity.z += axis.z * k;
        coinBody.wakeUp();
      }
    }
  }
  function driveHeld(){
    const p = coinBody.position, K = 16;
    coinBody.velocity.set((HOLD.target.x - p.x) * K, (HOLD.target.y - p.y) * K, (HOLD.target.z - p.z) * K);
    const toCam = new V3(clamp(coinBody.velocity.x * 0.03, -0.45, 0.45) * P.view, P.view, clamp(coinBody.velocity.z * 0.03, -0.45, 0.45) * P.view);
    steerTo(uprightQuat(HOLD.face, toCam), 11, 26);
  }
  // Close-up. When nobody touches it the coin sways gently left and right (about the vertical screen
  // axis), and every `turnEvery` seconds turns round that same axis to show the other face. Hovering a
  // ring stills it. At the edge-on moment (invisible) the coin swaps to the other face's upright pose,
  // so both faces arrive exactly upright (the two dies are a few degrees apart).
  const _qa = new THREE.Quaternion(), _qt = new THREE.Quaternion();
  function driveInspect(dt, now){
    const toCam = new V3(0, P.view, 0);
    if (INS.t < 1){
      INS.t = Math.min(1, INS.t + dt / 1.15);
      const e = INS.t < 0.5 ? 4 * INS.t ** 3 : 1 - Math.pow(-2 * INS.t + 2, 3) / 2;
      const p = INS.fromP.clone().lerp(INS.toP, e);
      coinBody.position.set(p.x, p.y, p.z);
      setBodyQ(INS.fromQ.clone().slerp(uprightQuat(INS.face, toCam), e));
      return;
    }
    if (INS.drag) return;
    const reading = hotspots.some((h) => h.dwell > 60 || h.open);
    const idleFor = now - INS.idleSince;
    const rock = P.idleSpin && !reading && idleFor > 1500;
    INS.amp += ((rock ? 1 : 0) - INS.amp) * Math.min(1, dt * 1.1);
    INS.phase += dt * INS.amp;
    if (rock && INS.turnT < 0) INS.sinceTurn += dt;
    if (INS.turnT < 0 && INS.sinceTurn > P.turnEvery){ INS.turnT = 0; INS.sinceTurn = 0; INS.turnFrom = INS.face; }

    const axis = screenUp();
    const tilt = 0.3 * INS.amp * Math.sin(INS.phase * 0.9);
    let target;
    if (INS.turnT >= 0){
      INS.turnT = Math.min(1, INS.turnT + dt / 3.2);
      const t = INS.turnT, e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const theta = e * Math.PI;
      // first half: leave face f; second half: arrive at face -f, upright
      const f = INS.turnFrom;
      if (theta < Math.PI / 2) _qt.setFromAxisAngle(axis, theta + tilt).multiply(uprightQuat(f, toCam));
      else _qt.setFromAxisAngle(axis, theta - Math.PI + tilt).multiply(uprightQuat(-f, toCam));
      INS.face = theta < Math.PI / 2 ? f : -f;
      if (INS.turnT >= 1) INS.turnT = -1;
      setBodyQ(_qt);                                    // exact: no smoothing across the swap
      return;
    }
    target = _qa.setFromAxisAngle(axis, tilt).multiply(uprightQuat(INS.face, toCam));
    setBodyQ(bodyQ().slerp(target, 1 - Math.exp(-dt * 3)));
  }

  // ───────────── mouse (listens on window: the stage may sit under other layers) ─────────────
  let mouseDown = false;
  function toNdc(e){
    const r = stageRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    return { x: x * 2 - 1, y: -(y * 2 - 1), inside: x >= 0 && x <= 1 && y >= 0 && y <= 1 };
  }
  const isUi = (t) => t && t.closest && t.closest("input, button, select, label, a, .coin-panel");
  const onDown = (e) => {
    if (!running || isUi(e.target)) return;
    const n = toNdc(e);
    if (n.inside && beginGrab(n.x, n.y, "mouse")) mouseDown = true;
  };
  const onMove = (e) => {
    if (!running) return;
    const n = toNdc(e);
    mouseHover = n.inside ? [n.x, n.y] : null;
    if (mode === "inspect" && !INS.drag) stage.classList.toggle("overcoin", n.inside && nearCoin(n.x, n.y, false));
    if (mouseDown && grabBy === "mouse") moveGrab(n.x, n.y);
  };
  const onUp = () => { if (mouseDown){ mouseDown = false; if (grabBy === "mouse") endGrab(false); } };
  const onWheel = (e) => {
    if (!running || grabBy !== "mouse" || !HOLD.on) return;
    e.preventDefault();
    HOLD.wheel += e.deltaY;
    if (Math.abs(HOLD.wheel) > 140){ HOLD.wheel = 0; flipInHand(); }
  };
  const onKey = (e) => {
    if (!running || (e.target && e.target.tagName === "INPUT")) return;
    if (e.code === "Space"){ e.preventDefault(); toss(); }
    if (e.code === "KeyF") flipInHand();
    if (e.code === "KeyI") enterInspect();
    if (e.code === "Escape") dropFromInspect();
  };
  addEventListener("pointerdown", onDown);
  addEventListener("pointermove", onMove);
  addEventListener("pointerup", onUp);
  addEventListener("pointercancel", onUp);
  addEventListener("wheel", onWheel, { passive: false });
  addEventListener("keydown", onKey);

  // ───────────── loop ─────────────
  let running = false, raf = 0, last = performance.now();
  function frame(){
    const now = performance.now();
    const dt = clamp((now - last) / 1000, 0, 1 / 20);
    last = now;
    if (mode === "play"){
      if (HOLD.on) driveHeld();
      else {
        settleAssist(dt);
        guideLanding(dt);
        const resting = coinBody.sleepState === CANNON.Body.SLEEPING ||
          (coinBody.velocity.length() < 0.05 && coinBody.angularVelocity.length() < 0.05);
        if (resting && !pending && now - lastTouch > P.idle * 1000) enterInspect();
      }
    } else {
      coinBody.velocity.setZero(); coinBody.angularVelocity.setZero();
      driveInspect(dt, now);
    }
    world.step(1 / 240, dt * P.timeScale, 12);
    coinGroup.position.copy(coinBody.position);
    coinGroup.quaternion.copy(coinBody.quaternion);
    const k = 1 - Math.exp(-dt * (mode === "inspect" ? 2.6 : 3.2));
    camera.position.lerp(camGoal.pos, k);
    camLook.lerp(camGoal.look, k);
    camera.lookAt(camLook);
    updateHotspots(dt);
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  function resize(){
    const r = stageRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    labelRenderer.setSize(r.width, r.height);
    stage.style.setProperty("--cu", (r.width / 1920) + "px");   // coin.css sizes: 1 = one pixel of a 1920-wide stage
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
    layout(true);
    if (mode === "inspect") inspectFrame();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(stage);
  resize();
  place();
  uiReady = true;
  applyTexts();

  // ───────────── controls panel (optional) ─────────────
  function set(name, value){
    P[name] = value;
    switch (name){
      case "view": if (mode === "inspect") exitInspect(); layout(true); lastTouch = performance.now(); pending = true; break;
      case "span": case "blockHeight": case "statueBlock": layout(false); break;
      case "gravity": world.gravity.set(0, -value, 0); coinBody.wakeUp(); break;
      case "metal": coinMats.forEach((m) => m.metalness = value); placeholder.material.metalness = value; break;
      case "rough": coinMats.forEach((m) => m.roughness = value); placeholder.material.roughness = value; break;
      case "offA": upOffset[1] = THREE.MathUtils.degToRad(value); coinBody.wakeUp(); break;
      case "offO": upOffset[-1] = THREE.MathUtils.degToRad(value); coinBody.wakeUp(); break;
      case "showCollider": colliderViz.visible = value; break;
      case "showBlock": layout(false); break;
    }
  }
  if (opts.panel) buildPanel(opts.panel, P, set, { toss, enterInspect: () => { coinBody.velocity.setZero(); enterInspect(); }, dropFromInspect, reset });

  function reset(){
    if (mode === "inspect") exitInspect();
    if (grabBy !== null) endGrab(true);
    clearResult();
    counts.athena = counts.owl = 0;
    showTally();
    place();
    playCamera(); camera.position.copy(camGoal.pos); camLook.copy(camGoal.look);   // no zoom-out on the next start
  }

  const api = {
    start(){ if (running) return; running = true; last = performance.now(); lastTouch = last; resize(); raf = requestAnimationFrame(frame); },
    stop(){ running = false; cancelAnimationFrame(raf); if (grabBy !== null) endGrab(true); mouseHover = null; handHover = []; tracked.clear(); },
    get running(){ return running; },
    get mode(){ return mode; },
    get holding(){ return grabBy !== null; },
    get lastHandsAt(){ return lastHandsAt; },
    setTexts(t){ TX = t || {}; applyTexts(); },
    setHands, set, params: P, relayout: () => { layout(false); if (mode === "inspect") inspectFrame(); },
    toss, reset, enterInspect, exitInspect, dropFromInspect,
    destroy(){
      api.stop(); ro.disconnect();
      removeEventListener("pointerdown", onDown); removeEventListener("pointermove", onMove);
      removeEventListener("pointerup", onUp); removeEventListener("pointercancel", onUp);
      removeEventListener("wheel", onWheel); removeEventListener("keydown", onKey);
      renderer.dispose();
    },
    // for tests
    _debug: { coinBody, world, camera, THREE, HOLD, INS, bounds, blockX, hotspots, beginGrab, moveGrab, endGrab, visibleFace, faceUp, bodyQ, coinScreen }
  };
  if (opts.autostart !== false) api.start();
  return api;
}

// ───────────── controls panel ─────────────
function buildPanel(root, P, set, actions){
  root.classList.add("coin-panel");
  const sliders = [
    ["GÖRÜNÜM", [
      ["seg", "view", [["Alttan", -1], ["Üstten", 1]]],
      ["span", "masa genişliği (sikke çapı)", 5, 22, 1, (v) => v],
      ["check", "statueBlock", "heykel sikkeyi durdursun (masayı ikiye böler)"],
      ["blockHeight", "o durumda üstünden aşma yüksekliği", 0.4, 4, 0.1, (v) => v.toFixed(1)]
    ]],
    ["DAVRANIŞ", [
      ["gravity", "yerçekimi", 4, 60, 1, (v) => v],
      ["timeScale", "zaman ölçeği", 0.1, 1, 0.05, (v) => v.toFixed(2) + "×"],
      ["align", "düz oturma (hizalama)", 0, 1, 0.05, (v) => v.toFixed(2)],
      ["spin", "savurma dönüşü", 0.3, 2, 0.1, (v) => v.toFixed(1) + "×"]
    ]],
    ["YAKIN BAKIŞ", [
      ["idle", "dokunulmazsa kaç saniye sonra", 2, 30, 1, (v) => v + " sn"],
      ["dwell", "halka üzerinde bekleme", 300, 2500, 100, (v) => v + " ms"],
      ["flick", "atış sayılacak savurma hızı", 0.8, 5, 0.1, (v) => v.toFixed(1)],
      ["check", "idleSpin", "boştayken süzülsün"],
      ["turnEvery", "diğer yüze dönme aralığı", 6, 60, 1, (v) => v + " sn"]
    ]],
    ["MALZEME", [
      ["metal", "metalik", 0, 1, 0.02, (v) => v.toFixed(2)],
      ["rough", "pürüzlülük", 0.1, 1, 0.02, (v) => v.toFixed(2)]
    ]],
    ["HATA AYIKLAMA", [
      ["check", "showCollider", "çarpışma silindirini göster"],
      ["check", "showBlock", "heykel bloğunu göster"],
      ["offA", "Athena dik açı düzeltmesi", -60, 60, 1, (v) => v + "°"],
      ["offO", "baykuş dik açı düzeltmesi", -60, 60, 1, (v) => v + "°"]
    ]]
  ];
  const btns = document.createElement("fieldset");
  btns.innerHTML = "<legend>ATIŞ</legend>";
  [["Yazı tura at (boşluk)", actions.toss, true], ["Yakın bakış (I)", actions.enterInspect], ["Oyuna dön (Esc)", actions.dropFromInspect], ["Sıfırla", actions.reset]]
    .forEach(([label, fn, primary]) => {
      const b = document.createElement("button"); b.className = "coin-btn" + (primary ? " primary" : ""); b.textContent = label; b.onclick = fn; btns.appendChild(b);
    });
  root.appendChild(btns);
  let uid = 0;
  for (const [legend, items] of sliders){
    const fs = document.createElement("fieldset");
    fs.innerHTML = `<legend>${legend}</legend>`;
    for (const it of items){
      if (it[0] === "seg"){
        const [, name, options] = it;
        const seg = document.createElement("div"); seg.className = "coin-seg";
        options.forEach(([label, val]) => {
          const b = document.createElement("button"); b.textContent = label;
          b.setAttribute("aria-pressed", P[name] === val);
          b.onclick = () => { seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b)); set(name, val); };
          seg.appendChild(b);
        });
        fs.appendChild(seg);
      } else if (it[0] === "check"){
        const [, name, label] = it;
        const l = document.createElement("label"); l.className = "coin-check";
        const id = "coin-ctl-" + (++uid);
        l.innerHTML = `<input type="checkbox" id="${id}"> <span></span>`;
        l.querySelector("span").textContent = label;
        const inp = l.querySelector("input"); inp.checked = !!P[name];
        inp.onchange = () => set(name, inp.checked);
        fs.appendChild(l);
      } else {
        const [name, label, min, max, step, fmt] = it;
        const d = document.createElement("div"); d.className = "coin-slider";
        const id = "coin-ctl-" + (++uid);
        d.innerHTML = `<label class="lab" for="${id}"></label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}"><output></output>`;
        d.querySelector(".lab").textContent = label;
        const inp = d.querySelector("input"), out = d.querySelector("output");
        inp.value = P[name]; out.textContent = fmt(+P[name]);
        inp.oninput = () => { out.textContent = fmt(+inp.value); set(name, +inp.value); };
        fs.appendChild(d);
      }
    }
    root.appendChild(fs);
  }
}
