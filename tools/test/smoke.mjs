// Headless check of the page without a camera: MediaPipe is replaced by a stub, fake hands are fed in.
//
//   npm install --no-save playwright && npx playwright install chromium     (once)
//   python3 -m http.server 8766 &                                            (from the repo root)
//   node tools/test/smoke.mjs [http://localhost:8766/index.htm?lite]
//
// Prints what happened and saves screenshots next to this file (smoke-*.png, not committed).
// Inside page.evaluate you can use:
//   feedAt(px, py, open)      one camera frame with one hand at screen pixel (px, py)
//   hold(px, py, ms, open)    keep a hand there for ms (about 30 frames a second)
//   none(ms)                  frames with no hands
//   centre(el)                screen centre of an element
//   window.ath                the sections API (openSection, closeSection, setLang, sections, slots, ...)
import { chromium } from "playwright";
import { fileURLToPath } from "url";
import path from "path";

const url = process.argv[2] || "http://localhost:8766/index.htm?lite";
const here = path.dirname(fileURLToPath(import.meta.url));
const shot = (name) => path.join(here, `smoke-${name}.png`);

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,   // optional: a Chrome/Chromium already installed
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on("pageerror", (e) => console.log("PAGE ERROR", e.message));
// MediaPipe stub: keeps the results callback so fake hands can be fed; the camera never starts
const stub = "window.Hands=class{setOptions(){}onResults(cb){window.__mp=cb}send(){return Promise.resolve()}};" +
             "window.Camera=class{constructor(){}start(){return Promise.resolve()}};";
await page.route("**/hands.js", (r) => r.fulfill({ contentType: "text/javascript", body: stub }));
await page.route("**/camera_utils.js", (r) => r.fulfill({ contentType: "text/javascript", body: "" }));
await page.goto(url);
await page.waitForFunction(() => window.ath && window.__mp, null, { timeout: 60000 });

await page.evaluate(() => {
  const v = document.getElementById("myvideo");
  Object.defineProperty(v, "videoWidth", { get: () => 640 });
  Object.defineProperty(v, "videoHeight", { get: () => 480 });
  // a right hand, palm to the camera, fingers up, at raw camera position (cx, cy) 0..1
  const hand = (cx, cy, open) => {
    const lm = Array.from({ length: 21 }, () => ({ x: cx, y: cy + 0.04, z: 0 }));
    lm[0] = { x: cx, y: cy + 0.09, z: 0 };
    const col = [0.03, 0.012, -0.006, -0.024];                     // index..little finger (raw image)
    lm[1] = lm[2] = lm[3] = lm[4] = { x: cx + 0.04, y: cy + 0.03, z: 0 };
    col.forEach((dx, f) => { const b = 5 + f * 4;
      lm[b] = { x: cx + dx, y: cy + 0.04, z: 0 }; lm[b + 1] = lm[b + 2] = { x: cx + dx, y: cy, z: 0 };
      lm[b + 3] = { x: cx + dx, y: open ? cy - 0.05 : cy + 0.03, z: 0 }; });
    return lm;
  };
  // screen pixel -> raw camera coordinates, same cover mapping as js/scripts.js (camera crop at zoom 1)
  const toCam = (px, py) => {
    const u = Math.min(innerWidth / 1920, innerHeight / 1080), fw = 1920 * u, fh = 1080 * u;
    const c = window.VENUE.cameraCrop(640, 480), s = Math.max(fw / c.w, fh / c.h);
    const ox = (innerWidth - fw) / 2 + (fw - c.w * s) / 2, oy = (innerHeight - fh) / 2 + (fh - c.h * s) / 2;
    return [c.x + c.w - (px - ox) / s, c.y + (py - oy) / s].map((v, i) => v / (i ? 480 : 640));
  };
  window.feedAt = (px, py, open = true) => { const [x, y] = toCam(px, py);
    window.__mp({ multiHandLandmarks: [hand(x, y, open)], multiHandedness: [{ label: "Left", score: 0.95 }] }); };
  window.hold = (px, py, ms, open = true) => new Promise((res) => { const t0 = performance.now();
    const id = setInterval(() => { window.feedAt(px, py, open); if (performance.now() - t0 > ms){ clearInterval(id); res(); } }, 33); });
  window.none = (ms) => new Promise((res) => { const t0 = performance.now();
    const id = setInterval(() => { window.__mp({ multiHandLandmarks: [], multiHandedness: [] }); if (performance.now() - t0 > ms){ clearInterval(id); res(); } }, 33); });
  window.centre = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
});

// 1. a hand resting on the owl letter opens the owl section
const opened = await page.evaluate(async () => {
  const slot = ath.slots.find((s) => s.section === "owl");
  const [x, y] = centre(slot.el); const t0 = performance.now();
  while (ath.section === "menu" && performance.now() - t0 < 8000) await hold(x, y, 100);
  return `${ath.section} after ${Math.round(performance.now() - t0)} ms`;
});
console.log("hand on the owl letter ->", opened);
await page.waitForTimeout(1500);
await page.screenshot({ path: shot("owl") });

// 2. a hand resting on the back button returns to the menu
const back = await page.evaluate(async () => {
  const [x, y] = centre(document.getElementById("backBtn")); const t0 = performance.now();
  while (ath.section !== "menu" && performance.now() - t0 < 8000) await hold(x, y, 100);
  return `${ath.section} after ${Math.round(performance.now() - t0)} ms`;
});
console.log("hand on the back button ->", back);

// 3. every registered section opens and closes without errors
for (const name of Object.keys(await page.evaluate(() => Object.fromEntries(Object.keys(ath.sections).map((k) => [k, 1]))))){
  await page.evaluate((n) => ath.openSection(n), name);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: shot(name) });
  await page.evaluate(() => ath.closeSection());
  await page.waitForTimeout(600);
  console.log("opened and closed:", name);
}
await page.screenshot({ path: shot("menu") });
await browser.close();
