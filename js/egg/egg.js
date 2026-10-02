// Egg section: a gallery of artworks depicting Athena's birth, described in content/egg.json.
// Images live in assets/gallery/, named after an artwork's "id" (e.g. assets/gallery/01.jpg).
// An id without a matching file just shows its title; extensions tried, in order: jpg, jpeg, png, webp.
//
// Shown as a masonry of "swimlanes": a few rows of tiles, each scrolling sideways on its own
// (CSS animation, alternating direction), looping forever. A hand (or the mouse) resting over a
// tile grows it in place, in front of everything — its row neighbours are pushed aside by normal
// flex reflow, and every other row leans away too, so the whole wall reads as one grid reacting
// together, not separate strips — and reveals its title/meta/description as a label. No dwell:
// this is just looking, not choosing.
//
//   import { createEgg } from "./egg/egg.js";
//   const egg = await createEgg({ stage, texts, dataUrl: "content/egg.json", imagesDir: "assets/gallery/" });
//   egg.start();
//   egg.frame(pts, dt);   // pts: [{ px, py, mouse? }], call once per animation frame while the section is open

const EXTS = ["jpg", "jpeg", "png", "webp"];
const LANES = 8;       // rows of tiles, each its own swimlane — dense, like a wall of thumbnails
const SHORT_EVERY = 4; // one in four tiles per lane is drawn shorter, for the masonry rhythm

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
  stage.innerHTML = `<div class="egg-lanes"></div><div class="egg-hint"></div>`;

  const lanesEl = stage.querySelector(".egg-lanes");
  const hintEl = stage.querySelector(".egg-hint");
  const noImgTextEls = [];

  // a tile's image is only fetched once its tile nears the visible stage, and dropped again once it
  // scrolls fully out of it — so a copy re-entering from the opposite side loads fresh, not from a cache
  // of every artwork held at once.
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries){
      const img = entry.target.querySelector("img[data-src]");
      if (!img) continue;
      if (entry.isIntersecting) img.src = img.dataset.src;
      else img.removeAttribute("src");
    }
  }, { root: stage, rootMargin: "0px 400px" });

  function buildTile(a, short){
    const tile = document.createElement("div");
    tile.className = "egg-tile" + (short ? " short" : "");
    if (a.image){
      const img = document.createElement("img");
      img.alt = ""; img.dataset.src = a.image;
      tile.appendChild(img);
      io.observe(tile);
    } else {
      const ph = document.createElement("div");
      ph.className = "egg-noimg";
      const phTitle = document.createElement("div");
      phTitle.className = "egg-noimg-title stone-text";
      phTitle.textContent = a.title || "";
      const note = document.createElement("div");
      note.className = "egg-noimg-text";
      noImgTextEls.push(note);
      ph.append(phTitle, note);
      tile.appendChild(ph);
    }
    const label = document.createElement("div");
    label.className = "egg-tile-label";
    const title = document.createElement("div");
    title.className = "egg-tile-title stone-text";
    title.textContent = a.title || "";
    const metaEl = document.createElement("div");
    metaEl.className = "egg-tile-meta";
    metaEl.textContent = meta(a);
    const desc = document.createElement("div");
    desc.className = "egg-tile-desc";
    desc.textContent = a.scene_description || a.importance || "";
    label.append(title, metaEl, desc);
    tile.appendChild(label);
    return tile;
  }

  const laneArtworks = Array.from({ length: LANES }, () => []);
  artworks.forEach((a, i) => laneArtworks[i % LANES].push(a));

  const tracks = [];
  laneArtworks.forEach((list) => {
    if (!list.length) return;
    const lane = document.createElement("div");
    lane.className = "egg-lane";
    const track = document.createElement("div");
    track.className = "egg-track";
    const tiles = [];
    // the track holds the row twice back to back, so looping its scroll by half its width is seamless
    for (let copy = 0; copy < 2; copy++){
      list.forEach((a, i) => {
        const tile = buildTile(a, i % SHORT_EVERY === 1);
        tiles.push(tile);
        track.appendChild(tile);
      });
    }
    lane.appendChild(track);
    lanesEl.appendChild(lane);
    tracks.push({ lane, track, tiles, hovered: null });
  });

  let TX = opts.texts || {};
  const tx = (path, fallback = "") => path.split(".").reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), TX) ?? fallback;

  function applyTexts(){
    hintEl.textContent = tx("hint", "");
    const noImage = tx("noImage", "No image yet");
    noImgTextEls.forEach((el) => { el.textContent = noImage; });
  }
  applyTexts();

  let running = false;

  function setPaused(paused){
    tracks.forEach((t) => t.track.classList.toggle("paused", paused));
  }

  const LANE_PUSH_UNITS = 150; // how far every other row leans away to make room for a focused tile

  function frame(pts, dt){
    if (!running) return;
    const U = stage.getBoundingClientRect().width / 1920; // px per frame-unit

    tracks.forEach((t) => {
      const laneRect = t.lane.getBoundingClientRect();
      const laneHasPoint = pts.some((p) => p.py >= laneRect.top && p.py <= laneRect.bottom);
      let hovered = null;
      if (laneHasPoint){
        for (const tile of t.tiles){
          if (pts.some((p) => inside(tile.getBoundingClientRect(), p.px, p.py))){ hovered = tile; break; }
        }
      }
      if (hovered !== t.hovered){
        t.hovered?.classList.remove("hover");
        hovered?.classList.add("hover");
        t.hovered = hovered;
      }
    });

    // a tile focused anywhere holds the whole wall still, and every other row leans away from its
    // own row to make room — a uniform shift, so rows never close in on one another.
    const hoveredLane = tracks.findIndex((t) => t.hovered);
    tracks.forEach((t, li) => {
      t.track.classList.toggle("paused", hoveredLane !== -1);
      if (hoveredLane === -1 || li === hoveredLane){ t.lane.style.removeProperty("transform"); return; }
      const dir = li < hoveredLane ? -1 : 1;
      t.lane.style.transform = `translateY(${dir * LANE_PUSH_UNITS * U}px)`;
    });
  }

  return {
    start(){ running = true; setPaused(false); },
    stop(){
      running = false;
      tracks.forEach((t) => {
        t.hovered?.classList.remove("hover");
        t.hovered = null;
        t.lane.style.removeProperty("transform");
      });
      setPaused(true);
    },
    reset(){
      tracks.forEach((t) => {
        t.track.style.animation = "none";
        void t.track.offsetWidth; // force reflow so the animation restarts from the beginning
        t.track.style.removeProperty("animation");
      });
    },
    get running(){ return running; },
    setTexts(t){ TX = t || {}; applyTexts(); },
    frame,
    relayout(){}
  };
}
