// The menu (ATHENA letters) and the sections behind them. So far: owl (tetradrachm), egg (a gallery
// of artworks, content/egg.json, images in assets/egg/), war (arrows and the aegis) and craft (the cloth,
// part by part, lit on the statue).
// Hands arrive from scripts.js as an "ath:hands" event, once per camera frame, in viewport pixels.
//
// Menu:     a hand over a letter rolls it to its section's icon; staying there (T.dwell ms) opens the section.
//           When the hand leaves, the icon rolls back to its letter.
// Section:  a hand resting on the back button (bottom left) returns to the menu, and so does
//           nobody interacting for T.idleReturn ms. On the way back all letters roll to read ATHENA again.
// Language: two buttons at the bottom left of the menu (a hand rests on one to choose it). All the
//           words come from content/texts.js. A new visitor starts in the first language again: after a
//           section closes because nobody was there, or after T.langReset ms with no hands in the menu.
// The mouse works like a hand, for development; a click on an icon or a button acts at once.
//
// Keys while developing:  O open owl section · G open egg section · W war · C craft · N mind · M back to menu · D controls panel · K room setup (js/venue.js)
//                          (inside the section) Space toss · I close-up · Esc leave close-up · F flip in hand

import { createCoin } from "./coin.js";
import { createEgg } from "./egg.js";
import { createWar } from "./war.js";
import { createCraft } from "./craft.js";
import { createMind } from "./mind.js";
import { sfx } from "./sound.js";
import TEXTS from "../content/texts.js";

const stage = document.getElementById("coinStage");
const eggStage = document.getElementById("eggStage");
const panel = document.getElementById("coinPanel");
const ring = document.getElementById("selectRing");
const container = document.querySelector(".container");

const T = {
  dwell: 2000,        // ms a hand stays on an icon (or on the back button) to choose it
  rollBack: 1200,     // ms after the hand leaves before an icon rolls back to its letter
  idleReturn: 20000,  // ms with no hands, no mouse and no coin held before a section closes itself
  countdown: 5000,    // the back button's ring shows the last part of that wait
  langDwell: 1000,    // ms a hand rests on a language to choose it
  langReset: 30000    // ms with no hands in the menu before the language goes back to the first one
};
const ROLL_MS = 850;          // a little longer than the .letter transition in main.css

// ───────────── the six slots ─────────────
// slot order is the DOM order: A T / H E / N A (two columns, the statue between them), so
// left column top to bottom: birth, war, mind · right column: owl, craft, gymnasion
const SLOTS = [
  { letter: "A", icon: "🥚", file: "zeus.svg", section: "egg" },        // birth
  { letter: "E", icon: "🧵", file: "hand.svg", section: "craft" },       // craft (placeholder icon)
  { letter: "T", icon: "🦉", file: "owl.svg", section: "owl" },         // the coin
  { letter: "N", icon: "🧠", file: "olive.svg", section: "mind" },
  { letter: "H", icon: "⚔", file: "war.svg", section: "war" },          // war (placeholder icon)
  { letter: "A", icon: "🏛", file: "bee.svg", section: "gymn" }
];
// an icon only takes part once its file has loaded (the others are not drawn yet)
for (const s of SLOTS){
  s.hasIcon = false;
  const img = new Image();
  img.onload = () => { s.hasIcon = true; };
  img.src = "assets/" + s.file;
}

function makeLetter(slot, key){
  const el = document.createElement("div");
  el.className = "letter";
  el.dataset.letter = key;
  if (key === slot.icon) el.style.backgroundImage = `url('assets/${slot.file}')`;
  else el.classList.add("letter" + key);
  return el;
}

// wrap each letter in a slot that clips the roll
[...container.querySelectorAll(":scope > .letter")].forEach((el, i) => {
  const s = SLOTS[i];
  s.el = document.createElement("div");
  s.el.className = "letter-slot";
  el.parentNode.insertBefore(s.el, el);
  s.el.appendChild(el);
  el.dataset.letter = s.letter;
  Object.assign(s, { shown: s.letter, want: s.letter, busy: false, again: false, leftAt: 0, over: false });
});

// Roll a slot to s.want. Down when the icon comes in, up when the letter comes back.
// `again` rolls once even if the wanted face is already showing (the ATHENA wave on the way back).
function roll(s){
  if (s.busy || (s.shown === s.want && !s.again)) return;
  s.busy = true; s.again = false;
  const old = s.el.querySelector(".letter:not(.letter-exiting)");
  const inc = makeLetter(s, s.want);
  s.el.classList.toggle("roll-up", s.want === s.letter);
  inc.classList.add("letter-incoming");
  s.el.appendChild(inc);
  void inc.offsetWidth;                         // commit the start position before moving
  if (old) old.classList.add("letter-exiting");
  inc.classList.remove("letter-incoming");
  s.shown = s.want;
  setTimeout(() => { if (old) old.remove(); s.busy = false; roll(s); }, ROLL_MS);
}
function want(s, key){ s.want = key; roll(s); }

// back to ATHENA: every slot rolls once, one after another, so the word is read again
function athenaWave(delay = 350){
  SLOTS.forEach((s, i) => setTimeout(() => { s.want = s.letter; s.again = true; roll(s); }, delay + i * 140));
}

// ───────────── the owl section ─────────────
// Where the statue stands, from the mask set up for the room (content/venue.js, setup screen: K).
// The coin uses it to keep throws from landing behind her and to frame its close-up beside her.
// The stage covers the whole 1920×1080 frame, so frame fractions are stage fractions.
function statueBand(){
  return window.VENUE ? window.VENUE.statueBandNdc() : null;
}

// ───────────── languages ─────────────
const LANGS = TEXTS.languages;
const FIRST = LANGS[0].code;
// a language's texts, with the first language filling any gap
function merge(base, over){
  if (over === undefined) return base;
  if (typeof base !== "object" || base === null || typeof over !== "object" || over === null) return over;
  if (Array.isArray(base) || Array.isArray(over)) return over;       // lists (war.lines) replace, they do not merge
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = merge(base[k], over[k]);
  return out;
}
const textsFor = (code) => merge(TEXTS[FIRST], TEXTS[code]);
let lang = FIRST;

const coin = await createCoin({
  stage, panel, statueBand,
  texts: textsFor(FIRST).owl,
  stoneTexture: "assets/stone.jpg",
  model: "assets/coin/coin.glb",
  background: 0x000000,     // projection: black is "no light"
  glassOpacity: 0,          // no dust on the glass: on a projection it is stray light
  lite: new URLSearchParams(location.search).has("lite"),   // dev: skip the model, use a plain disc
  autostart: false
});

const egg = await createEgg({
  stage: eggStage,
  texts: textsFor(FIRST).egg,
  dataUrl: "content/egg.json",
  imagesDir: "assets/gallery/",
  statueBand
});

const war = createWar({
  stage: document.getElementById("warStage"),
  texts: textsFor(FIRST).war,
  statueBand,
  stoneTexture: "assets/stone.jpg"
});

const craft = createCraft({
  stage: document.getElementById("craftStage"),
  texts: textsFor(FIRST).craft,
  statueBand,
  parts: () => (window.VENUE ? window.VENUE.get().parts : []),
  statue: () => (window.VENUE ? window.VENUE.get().mask.points : null),
  photo: () => (window.VENUE ? window.VENUE.get().statueImage : true),
  feather: () => (window.VENUE ? window.VENUE.get().mask.feather || 0 : 0),
  imagesDir: "assets/craft/"
});

const mind = createMind({
  stage: document.getElementById("mindStage"),
  texts: textsFor(FIRST).mind,
  statueBand,
  imagesDir: "assets/mind/"
});

// every section, by its SLOTS name; each exposes start/stop/reset/setTexts, and most also setHands or frame
const SECTIONS = { owl: coin, egg, war, craft, mind };

if (window.VENUE) window.VENUE.onChange(() => { coin.relayout(); war.relayout(); craft.relayout(); mind.relayout(); egg.relayout(); });

// js/scripts.js asks, for every hand icon it draws, whether the open section wants it hidden (false)
// or blended into another image ({ img, mix }); null keeps the hand
window.athHandSkin = (id) => (section === "menu" ? null : SECTIONS[section].handSkin?.(id) ?? null);

// back button: bottom left of the frame, where a hand reaches it; the hand icons stay on top of it
const back = document.createElement("div");
back.id = "backBtn";
back.innerHTML = `<div class="back-ring"></div>
  <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M30 12 L18 24 L30 36" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
  <span class="stone-text"></span>`;
document.body.insertBefore(back, document.getElementById("drawing"));

// ───────────── going in and out of a topic ─────────────
// The chosen letter opens like an iris: the other letters drop away, the topic is revealed in a circle that
// grows from the letter across the wall, a thin red ring running ahead of it, and the topic's name shows
// for a moment where the letter was. Going back, the topic closes into a circle shrinking into its letter.
const veil = document.createElement("div");
veil.id = "veil";
document.body.insertBefore(veil, document.getElementById("drawing"));
const veilRing = document.createElement("div");      // outside the veil, or its own mask would hide it
veilRing.id = "veilRing";
document.body.insertBefore(veilRing, document.getElementById("drawing"));
const topicCard = document.createElement("div");
topicCard.id = "topicCard";
topicCard.innerHTML = `<div class="t-title stone-text"></div><div class="t-greek"></div>`;
document.body.appendChild(topicCard);
const TR = { open: 1300, close: 850, title: 1700 };   // ms
let busy = false;
const easeInOut = (k) => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
function slotCentre(name){
  const sl = SLOTS.find((x) => x.section === name);
  const r = sl && sl.el.getBoundingClientRect();
  return r && r.width ? [r.left + r.width / 2, r.top + r.height / 2] : [innerWidth / 2, innerHeight / 2];
}
// the circle's radius from r0 to r1 around (x, y); outside it the wall is black
function iris(x, y, r0, r1, ms, done){
  const far = Math.max(Math.hypot(x, y), Math.hypot(innerWidth - x, y), Math.hypot(x, innerHeight - y), Math.hypot(innerWidth - x, innerHeight - y)) + 80;
  const from = r0 < 0 ? far : r0, to = r1 < 0 ? far : r1, t0 = performance.now();
  for (const e of [veil, veilRing]){ e.style.setProperty("--vx", x + "px"); e.style.setProperty("--vy", y + "px"); e.classList.add("on"); }
  let finished = false;
  const finish = () => { if (!finished){ finished = true; done && done(); } };
  setTimeout(finish, ms + 150);    // even if animation frames stall (a busy or hidden page), it ends
  (function step(now){
    if (finished) return;
    const k = Math.min((now - t0) / ms, 1), r = from + (to - from) * easeInOut(k);
    veil.style.setProperty("--vr", r.toFixed(1) + "px");
    veilRing.style.setProperty("--vr", r.toFixed(1) + "px");
    veilRing.style.setProperty("--ring", (to > from ? 1 - k * k : Math.min(1, k / 0.15) * (1 - k * k)).toFixed(3));
    if (k < 1) requestAnimationFrame(step); else finish();
  })(t0);
}
function showTopic(name, x, y){
  const t = (textsFor(lang).menu.topics || {})[name] || {};
  topicCard.querySelector(".t-title").textContent = t.title || "";
  topicCard.querySelector(".t-greek").textContent = t.epithet || "";
  topicCard.style.left = x + "px"; topicCard.style.top = y + "px";
  topicCard.classList.toggle("from-right", x > innerWidth / 2);
  topicCard.classList.remove("on"); void topicCard.offsetWidth; topicCard.classList.add("on");
  clearTimeout(topicCard._t);
  topicCard._t = setTimeout(() => topicCard.classList.remove("on"), TR.title);
}

// language buttons: bottom left of the menu
const langBox = document.createElement("div");
langBox.id = "langSwitch";
for (const l of LANGS){
  const b = document.createElement("div");
  b.className = "lang";
  b.dataset.lang = l.code;
  b.innerHTML = `<div class="lang-ring"></div><b class="stone-text"></b><span></span>`;
  b.querySelector("b").textContent = l.short;
  b.querySelector("span").textContent = l.name;
  langBox.appendChild(b);
  l.el = b; l.dwell = 0;
}
document.body.insertBefore(langBox, document.getElementById("drawing"));

function setLang(code){
  if (!LANGS.some((l) => l.code === code)) code = FIRST;
  lang = code;
  const t = textsFor(code);
  // with the Kinect's depth there are no fingers: the coin is held by pushing the hand towards the wall
  coin.setTexts(window.athSource === "depth" && t.owl.hint.playPush
    ? { ...t.owl, hint: { ...t.owl.hint, play: t.owl.hint.playPush } } : t.owl);
  egg.setTexts(t.egg);
  war.setTexts(t.war);
  craft.setTexts(t.craft);
  mind.setTexts(t.mind);
  back.querySelector("span").textContent = t.menu.back;
  document.documentElement.lang = code;
  for (const l of LANGS){ l.el.classList.toggle("on", l.code === code); l.dwell = 0; l.el.style.setProperty("--p", 0); }
}
setLang(FIRST);
window.addEventListener("ath:source", () => setLang(lang));

let section = "menu", activeAt = 0;
function openSection(name){
  const s = SECTIONS[name];
  if (section !== "menu" || !s || busy) return;
  busy = true;
  section = name; activeAt = performance.now();
  ring.style.opacity = 0;
  const [x, y] = slotCentre(name);
  SLOTS.forEach((sl) => sl.el.classList.toggle("chosen", sl.section === name));
  document.body.classList.add("opening");
  s.reset();                     // a fresh start for every visit (the coin dropped on the table, the gallery at its first image)
  sfx("open");
  veil.style.setProperty("--vr", "0px");
  iris(x, y, 0, 0, 1);           // black everywhere for a moment, under the letters
  setTimeout(() => {
    document.body.classList.add("in-section", "section-" + name);
    s.start();
    showTopic(name, x, y);
    iris(x, y, 0, -1, TR.open, () => {
      veil.classList.remove("on"); veilRing.classList.remove("on");
      document.body.classList.remove("opening");
      busy = false;
    });
  }, 260);
}
// why: "back" (the button, or M) keeps the language; "idle" means the visitor has gone
function closeSection(why = "back"){
  if (section === "menu" || busy) return;
  busy = true;
  const name = section, s = SECTIONS[name];
  const [x, y] = slotCentre(name);
  sfx("close");
  back.style.setProperty("--p", 0);
  topicCard.classList.remove("on");
  iris(x, y, -1, 0, TR.close, () => {
    document.body.classList.remove("in-section", "section-" + name);
    SLOTS.forEach((sl) => sl.el.classList.remove("chosen"));
    section = "menu";
    activeAt = performance.now();
    if (why === "idle") setLang(FIRST);
    s.stop();
    for (const sl of SLOTS){ sl.over = false; sl.dwell = 0; }
    veil.classList.remove("on"); veilRing.classList.remove("on");
    busy = false;
    athenaWave(150);
  });
}

// ───────────── input ─────────────
let hands = [], handsAt = 0;
window.addEventListener("ath:hands", (e) => {
  hands = e.detail.hands.map((h) => ({ id: h.id, px: h.px, py: h.py, open: h.open }));
  handsAt = performance.now();
  if (section === "owl"){
    const s = stage.getBoundingClientRect();
    coin.setHands(hands.map((p) => ({
      id: p.id,
      x: (p.px - s.left) / s.width * 2 - 1,
      y: -((p.py - s.top) / s.height * 2 - 1),
      open: p.open
    })));
  }
});

// the mouse counts as a hand while it moves (and for 4 s after)
const mouse = { px: 0, py: 0, at: -1e9 };
function noteMouse(e){ mouse.px = e.clientX; mouse.py = e.clientY; mouse.at = performance.now(); activeAt = mouse.at; }
window.addEventListener("pointermove", noteMouse);
window.addEventListener("pointerdown", (e) => {
  noteMouse(e);
  if (section !== "menu"){
    if (inside(back.getBoundingClientRect(), e.clientX, e.clientY, 0)) closeSection();
    return;
  }
  const l = LANGS.find((l) => inside(l.el.getBoundingClientRect(), e.clientX, e.clientY, 0));
  if (l){ setLang(l.code); sfx("lang", { x: frameX(e.clientX) }); return; }
  const s = SLOTS.find((s) => inside(s.el.getBoundingClientRect(), e.clientX, e.clientY, 0));
  if (s && s.section) openSection(s.section);
});
window.addEventListener("wheel", () => { activeAt = performance.now(); }, { passive: true });

// a viewport x in frame pixels (0..1920), to place a sound left or right
function frameX(x){ const u = Math.min(innerWidth / 1920, innerHeight / 1080); return (x - (innerWidth - 1920 * u) / 2) / u; }
function inside(r, x, y, pad){ return r.width > 0 && x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad; }
function pointers(now){
  const list = now - handsAt < 300 ? hands.slice() : [];
  if (now - mouse.at < 4000) list.push({ px: mouse.px, py: mouse.py, mouse: true });
  return list;
}

// ───────────── per frame ─────────────
let lastT = performance.now(), backDwell = 0;
function frame(now){
  const dt = Math.max(0, Math.min(now - lastT, 100));
  lastT = now;
  const pts = pointers(now);
  if (busy){ if (section !== "menu") SECTIONS[section].frame?.([], dt); }   // going in or out: no choosing meanwhile
  else if (section === "menu") menuFrame(now, dt, pts); else sectionFrame(now, dt, pts);
  requestAnimationFrame(frame);
}

function menuFrame(now, dt, pts){
  if (pts.some((p) => !p.mouse)) activeAt = now;
  if (lang !== FIRST && now - activeAt > T.langReset) setLang(FIRST);

  // languages: a hand resting on the other language switches to it
  for (const l of LANGS){
    const r = l.el.getBoundingClientRect();
    const over = l.code !== lang && pts.some((p) => inside(r, p.px, p.py, r.width * 0.1));
    l.dwell = over ? l.dwell + dt : Math.max(0, l.dwell - dt * 2);
    l.el.classList.toggle("hover", over);
    l.el.style.setProperty("--p", Math.min(l.dwell / T.langDwell, 1));
    if (l.dwell >= T.langDwell){ setLang(l.code); sfx("lang", { x: frameX(r.left + r.width / 2) }); }
  }

  const pad = container.getBoundingClientRect().width * 0.02;
  let best = null;
  for (const s of SLOTS){
    const r = s.el.getBoundingClientRect();
    const over = pts.some((p) => inside(r, p.px, p.py, pad));
    if (over){
      s.leftAt = 0;
      if (s.hasIcon && !s.over && s.want !== s.icon) sfx("hover", { x: frameX(r.left + r.width / 2) });
      if (s.hasIcon) want(s, s.icon);
    } else if (s.over) s.leftAt = now;
    if (!over && s.leftAt && now - s.leftAt > T.rollBack){ s.leftAt = 0; want(s, s.letter); }
    s.over = over;
    // choosing: only an icon that leads somewhere, counted from the moment it shows
    const ready = over && s.section && s.shown === s.icon && !s.busy;
    s.dwell = ready ? (s.dwell || 0) + dt : Math.max(0, (s.dwell || 0) - dt * 2);
    if (s.dwell > 0 && (!best || s.dwell > best.dwell)) best = s;
  }
  if (best){
    const r = best.el.getBoundingClientRect();
    ring.style.left = (r.left + r.width / 2) + "px";
    ring.style.top = (r.top + r.height / 2) + "px";
    ring.style.setProperty("--p", Math.min(best.dwell / T.dwell, 1));
    ring.style.opacity = 1;
    if (best.dwell >= T.dwell){ best.dwell = 0; openSection(best.section); }
  } else ring.style.opacity = 0;
}

function sectionFrame(now, dt, pts){
  const active = SECTIONS[section];
  active.frame?.(pts, dt);      // sections without hand physics of their own (the egg gallery) get dwell here
  if (active.done){ closeSection("back"); return; }   // a section that tells a story once (mind) ends by itself
  const handsIn = pts.some((p) => !p.mouse);
  if (handsIn || active.holding || active.playing) activeAt = now;   // mind: stays open while its story is told

  // a hand resting on the back button (not one carrying the coin)
  const r = back.getBoundingClientRect(), pad = r.width * 0.15;
  const over = !active.holding && pts.some((p) => inside(r, p.px, p.py, pad));
  backDwell = over ? backDwell + dt : Math.max(0, backDwell - dt * 2);
  back.classList.toggle("hover", over);

  // the ring fills while a hand rests there; with nobody around it counts down the last seconds instead
  const idle = now - activeAt;
  const countdown = Math.max(0, (idle - (T.idleReturn - T.countdown)) / T.countdown);
  back.classList.toggle("counting", countdown > 0 && backDwell === 0);
  back.style.setProperty("--p", Math.min(Math.max(backDwell / T.dwell, countdown), 1));

  if (backDwell >= T.dwell){ backDwell = 0; closeSection("back"); }
  else if (idle >= T.idleReturn){ backDwell = 0; closeSection("idle"); }
}
requestAnimationFrame(frame);

window.addEventListener("keydown", (e) => {
  if (e.target && e.target.tagName === "INPUT") return;
  if (e.code === "KeyO") openSection("owl");
  if (e.code === "KeyG") openSection("egg");
  if (e.code === "KeyW") openSection("war");
  if (e.code === "KeyC") openSection("craft");
  if (e.code === "KeyN") openSection("mind");
  if (e.code === "KeyM") closeSection();
  if (e.code === "KeyD") document.body.classList.toggle("show-panel");
  activeAt = performance.now();
});

// handy from the console while developing (openOwl / closeOwl kept for older notes)
window.ath = {
  coin, egg, war, craft, mind, sections: SECTIONS, openSection, closeSection, athenaWave, setLang, slots: SLOTS, timing: T,
  get lang(){ return lang; },
  openOwl: () => openSection("owl"), closeOwl: closeSection,
  get section(){ return section; }
};
