// Egg section: a gallery of artworks depicting Athena's birth, described in content/egg.json.
// The images themselves are not part of this repository — drop them into assets/egg/, named
// after an artwork's "id" (e.g. assets/egg/01.jpg). An id without a matching file just shows
// its text; extensions tried, in order: jpg, jpeg, png, webp.
//
//   import { createEgg } from "./egg/egg.js";
//   const egg = await createEgg({ stage, texts, dataUrl: "content/egg.json", imagesDir: "assets/egg/" });
//   egg.start();
//   egg.frame(pts, dt);   // pts: [{ px, py, mouse? }], call once per animation frame while the section is open

const EXTS = ["jpg", "jpeg", "png", "webp"];
const T = { dwell: 1400 };   // ms a hand rests on an arrow or a dot to choose it

function findImage(dir, id){
  return new Promise((resolve) => {
    const img = new Image();
    let i = 0;
    img.onload = () => resolve(img.src);
    img.onerror = tryNext;
    tryNext();
    function tryNext(){
      if (i >= EXTS.length) return resolve(null);
      img.src = `${dir}${id}.${EXTS[i++]}`;
    }
  });
}

function inside(r, x, y, pad = 0){
  return r.width > 0 && x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
}

// egg.json is not uniform (artist / artist_or_workshop, current_location / current_locations, ...)
function meta(a){
  const bits = [];
  const artist = a.artist || a.artist_or_workshop;
  if (artist) bits.push(artist);
  if (a.date) bits.push(a.date);
  const loc = a.current_location || (Array.isArray(a.current_locations) ? a.current_locations.join(", ") : a.current_locations);
  if (loc) bits.push(loc);
  return bits.join(" — ");
}

export async function createEgg(opts){
  const stage = opts.stage;
  const dataUrl = opts.dataUrl || "content/egg.json";
  const imagesDir = opts.imagesDir || "assets/egg/";

  const data = await fetch(dataUrl).then((r) => r.json());
  const artworks = data.artworks || [];
  await Promise.all(artworks.map(async (a) => { a.image = await findImage(imagesDir, a.id); }));

  stage.classList.add("egg-stage");
  stage.innerHTML = `
    <div class="egg-frame">
      <div class="egg-arrow egg-prev"><svg viewBox="0 0 48 48"><path d="M30 12 L18 24 L30 36" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg><div class="egg-arrow-ring"></div></div>
      <div class="egg-picture"><img class="egg-img" alt="" /><div class="egg-noimg"></div></div>
      <div class="egg-arrow egg-next"><svg viewBox="0 0 48 48"><path d="M18 12 L30 24 L18 36" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg><div class="egg-arrow-ring"></div></div>
    </div>
    <div class="egg-hint"></div>
    <div class="egg-info">
      <div class="egg-count stone-text"></div>
      <div class="egg-title stone-text"></div>
      <div class="egg-meta"></div>
      <div class="egg-desc"></div>
    </div>
    <div class="egg-dots"></div>`;

  const q$ = (s) => stage.querySelector(s);
  const imgEl = q$(".egg-img"), noImgEl = q$(".egg-noimg"), hintEl = q$(".egg-hint");
  const countEl = q$(".egg-count"), titleEl = q$(".egg-title"), metaEl = q$(".egg-meta"), descEl = q$(".egg-desc");
  const prevEl = q$(".egg-prev"), nextEl = q$(".egg-next"), dotsEl = q$(".egg-dots");

  let TX = opts.texts || {};
  const tx = (path, fallback = "") => path.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), TX) ?? fallback;

  const dots = artworks.map(() => {
    const d = document.createElement("div");
    d.className = "egg-dot";
    dotsEl.appendChild(d);
    return d;
  });
  const dotDwell = new Array(dots.length).fill(0);
  let prevDwell = 0, nextDwell = 0;
  let index = 0, running = false;

  function show(i){
    index = artworks.length ? ((i % artworks.length) + artworks.length) % artworks.length : 0;
    const a = artworks[index];
    if (a && a.image){
      imgEl.src = a.image; imgEl.style.display = ""; noImgEl.style.display = "none";
    } else {
      imgEl.removeAttribute("src"); imgEl.style.display = "none";
      noImgEl.style.display = ""; noImgEl.textContent = tx("noImage", "No image yet");
    }
    countEl.textContent = artworks.length ? `${index + 1} / ${artworks.length}` : "";
    titleEl.textContent = a ? (a.title || "") : "";
    metaEl.textContent = a ? meta(a) : "";
    descEl.textContent = a ? (a.scene_description || a.importance || "") : "";
    dots.forEach((d, di) => d.classList.toggle("on", di === index));
  }
  function next(){ show(index + 1); }
  function prev(){ show(index - 1); }

  prevEl.addEventListener("click", prev);
  nextEl.addEventListener("click", next);
  dots.forEach((d, i) => d.addEventListener("click", () => show(i)));

  // fills an element's --p over T.dwell ms of hovering, firing `act` once full (a mouse click acts at once, above)
  function dwellStep(el, over, acc, dt, act){
    acc = over ? acc + dt : Math.max(0, acc - dt * 2);
    el.classList.toggle("hover", over);
    el.style.setProperty("--p", Math.min(acc / T.dwell, 1));
    if (acc >= T.dwell){ act(); return 0; }
    return acc;
  }

  function frame(pts, dt){
    if (!running) return;
    const overPrev = pts.some((p) => inside(prevEl.getBoundingClientRect(), p.px, p.py));
    const overNext = pts.some((p) => inside(nextEl.getBoundingClientRect(), p.px, p.py));
    prevDwell = dwellStep(prevEl, overPrev, prevDwell, dt, prev);
    nextDwell = dwellStep(nextEl, overNext, nextDwell, dt, next);
    dots.forEach((d, i) => {
      const over = pts.some((p) => inside(d.getBoundingClientRect(), p.px, p.py, 10));
      dotDwell[i] = dwellStep(d, over, dotDwell[i], dt, () => show(i));
    });
  }

  function applyTexts(){
    hintEl.textContent = tx("hint", "");
    if (artworks[index] && !artworks[index].image) noImgEl.textContent = tx("noImage", "No image yet");
  }
  applyTexts();
  show(0);

  return {
    start(){ running = true; },
    stop(){ running = false; prevDwell = nextDwell = 0; dotDwell.fill(0); },
    reset(){ show(0); },
    get running(){ return running; },
    setTexts(t){ TX = t || {}; applyTexts(); },
    frame,
    relayout(){}
  };
}
