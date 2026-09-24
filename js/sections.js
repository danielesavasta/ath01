// Section switching: the letter menu <-> the owl section (tetradrachm).
// Hands arrive from scripts.js as an "ath:hands" event, once per camera frame.
//
// Keys while developing:  O open owl section · M back to menu · D controls panel
//                          (inside the section) Space toss · I close-up · Esc leave close-up · F flip in hand

import { createCoin } from "./coin/coin.js";

const stage = document.getElementById("coinStage");
const panel = document.getElementById("coinPanel");
const statue = document.getElementById("athenaStatue");
const ring = document.getElementById("selectRing");
const drawing = document.getElementById("drawing");

// opaque part of assets/athenaStatue.png as fractions of its width (from its alpha channel)
const STATUE_ALPHA = [707 / 1920, 1226 / 1920];
function statueBand(){
  const r = statue.getBoundingClientRect(), s = stage.getBoundingClientRect();
  if (!r.width || !s.width) return null;
  const x0 = r.left + r.width * STATUE_ALPHA[0], x1 = r.left + r.width * STATUE_ALPHA[1];
  return [(x0 - s.left) / s.width * 2 - 1, (x1 - s.left) / s.width * 2 - 1];
}

const coin = await createCoin({
  stage, panel, statueBand,
  model: "assets/coin/coin.glb",
  background: 0x000000,     // projection: black is "no light"
  glassOpacity: 0,          // no dust on the glass: on a projection it is stray light
  lite: new URLSearchParams(location.search).has("lite"),   // dev: skip the model, use a plain disc
  autostart: false
});

let section = "menu", openedAt = 0;
function openOwl(){
  if (section === "owl") return;
  section = "owl"; openedAt = performance.now();
  document.body.classList.add("section-owl");
  coin.start();
}
function closeOwl(){
  if (section === "menu") return;
  section = "menu";
  document.body.classList.remove("section-owl");
  coin.stop();
}

const OWL_DWELL = 1500;       // ms an open hand rests on the owl to open its section
const RETURN_AFTER = 25000;   // ms with no hands before going back to the menu
let dwell = 0, lastT = performance.now();

window.addEventListener("ath:hands", (e) => {
  const { width, height, hands } = e.detail;
  const now = performance.now(), dt = Math.min(now - lastT, 100);
  lastT = now;
  // map the camera frame onto the viewport the same way the hand icons are drawn (object-fit of #drawing)
  const fit = getComputedStyle(drawing).objectFit;
  const sx = innerWidth / width, sy = innerHeight / height;
  const sc = fit === "cover" ? Math.max(sx, sy) : Math.min(sx, sy);
  const kx = fit === "fill" ? sx : sc, ky = fit === "fill" ? sy : sc;
  const ox = (innerWidth - width * kx) / 2, oy = (innerHeight - height * ky) / 2;
  const pts = hands.map((h) => ({ px: ox + h.x * width * kx, py: oy + h.y * height * ky, open: h.open }));

  if (section === "owl"){
    const s = stage.getBoundingClientRect();
    coin.setHands(pts.map((p) => ({
      x: (p.px - s.left) / s.width * 2 - 1,
      y: -((p.py - s.top) / s.height * 2 - 1),
      open: p.open
    })));
    if (!coin.holding && now - Math.max(coin.lastHandsAt, openedAt) > RETURN_AFTER) closeOwl();
    return;
  }

  // menu: an open hand held over the owl opens its section
  const owl = document.querySelector('.letter[data-letter="🦉"]');
  const r = owl && owl.getBoundingClientRect();
  const over = !!r && r.width > 0 && pts.some((p) => p.open && p.px >= r.left && p.px <= r.right && p.py >= r.top && p.py <= r.bottom);
  dwell = over ? dwell + dt : Math.max(0, dwell - dt * 2);
  if (r){
    ring.style.left = (r.left + r.width / 2) + "px";
    ring.style.top = (r.top + r.height / 2) + "px";
  }
  ring.style.setProperty("--p", Math.min(dwell / OWL_DWELL, 1));
  ring.style.opacity = dwell > 0 ? 1 : 0;
  if (dwell >= OWL_DWELL){ dwell = 0; ring.style.opacity = 0; openOwl(); }
});

window.addEventListener("keydown", (e) => {
  if (e.target && e.target.tagName === "INPUT") return;
  if (e.code === "KeyO") openOwl();
  if (e.code === "KeyM") closeOwl();
  if (e.code === "KeyD") document.body.classList.toggle("show-panel");
});

// handy from the console while developing
window.ath = { coin, openOwl, closeOwl, get section(){ return section; } };
