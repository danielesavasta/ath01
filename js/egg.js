// Egg section: a gallery of artworks depicting Athena's birth, described in content/egg.json.
// Images live in assets/gallery/, named after an artwork's "id" (e.g. assets/gallery/01.jpg).
// An id without a matching file just shows its title; extensions tried, in order: jpg, jpeg, png, webp.
//
// Shown as a mosaic: wrapped rows of equal height, each tile as wide as its picture. A hand (or the
// mouse) over a tile opens it over the half of the screen on its own side, with its label; the other
// half stays a mosaic. No dwell: this is just looking, not choosing.
//
//   import { createEgg } from "./egg/egg.js";
//   const egg = await createEgg({ stage, texts, dataUrl: "content/egg.json", imagesDir: "assets/gallery/" });
//   egg.start();
//   egg.frame(pts, dt);   // pts: [{ px, py, mouse? }], call once per animation frame while the section is open

import { sfx } from "./sound.js";

const EXTS = ["webp"];

function findImage(dir, id){
  return new Promise((resolve) => {
    const img = new Image();
    let i = 0;
    img.onload = () => resolve({ src: img.src, ratio: img.naturalWidth / img.naturalHeight });
    img.onerror = tryNext;
    tryNext();
    function tryNext(){
      if (i >= EXTS.length) return resolve(null);
      img.src = `${dir}${id}.${EXTS[i++]}`;
    }
  });
}

function inside(r, x, y){
  return r.width > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
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
  const imagesDir = opts.imagesDir || "assets/gallery/";

  const data = await fetch(dataUrl).then((r) => r.json());
  const artworks = data.artworks || [];
  await Promise.all(artworks.map(async (a) => { a.image = await findImage(imagesDir, a.id); }));

  stage.classList.add("egg-stage");
  stage.innerHTML = `<div class="egg-mosaic"></div>
    <div class="egg-panel">
      <div class="egg-panel-img"></div>
      <div class="egg-tile-label"><div class="egg-tile-title stone-text"></div><div class="egg-tile-meta"></div><div class="egg-tile-desc"></div></div>
    </div>
    <div class="egg-hint"></div>`;

  const mosaicEl = stage.querySelector(".egg-mosaic");
  const panelEl = stage.querySelector(".egg-panel");
  const panelImg = stage.querySelector(".egg-panel-img");
  const panelTitle = stage.querySelector(".egg-tile-title");
  const panelMeta = stage.querySelector(".egg-tile-meta");
  const panelDesc = stage.querySelector(".egg-tile-desc");
  const hintEl = stage.querySelector(".egg-hint");
  const noImgTextEls = [];

  function buildTile(a){
    const tile = document.createElement("div");
    tile.className = "egg-tile";
    const ratio = a.image ? a.image.ratio : 1;
    tile.style.setProperty("--ratio", ratio);
    if (a.image){
      tile.style.backgroundImage = `url("${a.image.src}")`;
    } else {
      const phTitle = document.createElement("div");
      phTitle.className = "egg-noimg-title stone-text";
      phTitle.textContent = a.title || "";
      const note = document.createElement("div");
      note.className = "egg-noimg-text";
      noImgTextEls.push(note);
      tile.append(phTitle, note);
      tile.classList.add("egg-noimg");
    }
    return tile;
  }

  const tiles = artworks.map((a) => {
    const tile = buildTile(a);
    mosaicEl.appendChild(tile);
    return tile;
  });
  let hovered = -1;
  let side = "left";

  let TX = opts.texts || {};
  const tx = (path, fallback = "") => path.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), TX) ?? fallback;

  function applyTexts(){
    hintEl.textContent = tx("hint", "");
    const noImage = tx("noImage", "No image yet");
    noImgTextEls.forEach((el) => { el.textContent = noImage; });
  }
  applyTexts();

  let running = false;

  function clear(){
    hovered = -1;
    tiles.forEach((t) => t.classList.remove("hover"));
    panelEl.classList.remove("open");
  }

  function focus(h, r, stageRect){
    hovered = h;
    sfx("tile", { x: ((r.left + r.right) / 2 - stageRect.left) / stageRect.width * 1920 });
    const a = artworks[h];
    side = (r.left + r.right) / 2 < stageRect.left + stageRect.width / 2 ? "left" : "right";
    panelEl.classList.toggle("left", side === "left");
    panelEl.classList.toggle("right", side === "right");
    panelImg.style.backgroundImage = a.image ? `url("${a.image.src}")` : "none";
    panelTitle.textContent = a.title || "";
    panelMeta.textContent = meta(a);
    panelDesc.textContent = a.scene_description || a.importance || "";
    panelEl.classList.add("open");
    tiles.forEach((t, i) => t.classList.toggle("hover", i === h));
  }

  function frame(pts){
    if (!running) return;
    const s = stage.getBoundingClientRect();
    // a hand inside the open panel keeps it open; tiles under the panel can't be picked
    if (hovered !== -1){
      const pr = panelEl.getBoundingClientRect();
      if (pts.some((p) => inside(pr, p.px, p.py))) return;
    }
    let h = -1, hr = null;
    for (let i = 0; i < tiles.length && h < 0; i++){
      const r = tiles[i].getBoundingClientRect();
      if (pts.some((p) => inside(r, p.px, p.py))){ h = i; hr = r; }
    }
    if (h === -1){ if (hovered !== -1) clear(); }
    else if (h !== hovered) focus(h, hr, s);
  }

  return {
    start(){ running = true; },
    stop(){ running = false; clear(); },
    reset(){ clear(); },
    get running(){ return running; },
    setTexts(t){ TX = t || {}; applyTexts(); },
    frame,
    relayout(){}
  };
}
