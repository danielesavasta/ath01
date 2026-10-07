# Athena's Six Aspects · ath01

Interactive projection for the Athena statue in the İzmir Archaeology Museum (Ephesos, Vedius Gymnasion,
inv. 000.011, marble, 1.84 m). By Ege Canpolat and Daniele Savasta. The projector lights the wall behind
the statue; visitors stand in front and play with their hands. **Installation: first week of October 2026.**
Background research and the section texts: `docs/athena-six-aspects.md` (read it before writing a section).

## Working rules

- Commits go out under the person running the session (Ege: `Ege Canpolat <c.ege.canpolat@gmail.com>`,
  GitHub `ege-canpolat`). No `Co-Authored-By: Claude` or session lines (`.claude/settings.json` turns them off).
- Daniele also pushes to `main`. `git pull` before starting, push small commits often, never force-push `main`.
- Everything a visitor reads lives in `content/texts.js` (Turkish first, English second). Never hard-code
  visitor text in a section. Phrasing: short, natural, not robotic; museum-accurate.
- Room-specific values (statue mask, camera crop, detection) live in `content/venue.js`, never in code.
- One clear gesture per section, playable by several people at once, understandable without reading.
- Work offline: vendor libraries in `lib/`, fonts in `assets/fonts/`. No CDN at the venue.
- Personal preferences (reply style etc.) go in `CLAUDE.local.md`, which is not committed.

## Running it

- One click on a Mac: `start.command` (bridge with auto-restart + web server on 5510 + Chrome; `--kiosk`).
  On the Windows PC: `start-windows.bat` uses Kinect 360; `start-windows.bat one` uses Kinect One.
  Both build and run the Windows bridge, which also serves the page on 8770.
  Or serve the repo root (VS Code Live Server, port 5504, or `python3 -m http.server`) and open `index.htm`.
- Hands, in this order (the page keeps looking for a bridge, start order doesn't matter):
  **skeleton** = Windows bridge `tools/kinect-win/` (Kinect 360 SDK 1.8 or Kinect One SDK 2.0; raised hands
  and open/closed hand state, works in the dark; the venue plan, `start-windows.bat`; not yet run on a real PC) ·
  **kinect** = Mac bridge `tools/kinect/bridge.py`, colour picture + MediaPipe (needs light) · **webcam**.
  `?source=skeleton|kinect|webcam|depth` forces one. `depth` (Mac bridge, hands found in depth, push towards
  the wall to grab) is only an option: Ege found reach-and-push awkward. See both READMEs.
- `?lite` skips the 5 MB coin model. The mouse works like a hand (press = closed hand).
- Keys: `O` owl · `G` egg · `W` war · `C` craft · `N` mind · `Y` gymnasion · `M` menu · `K` room setup · `D` coin physics panel · `S` sound on/off ·
  in the owl section `Space` toss, `I` close-up, `Esc` leave close-up, `F` flip in hand.
- Headless check without a camera: `tools/test/smoke.mjs` (Playwright; stubs MediaPipe, feeds fake hands).

## How it fits together

Load order in `index.htm`: `lib/hands.js`, `lib/camera_utils.js` → `content/venue.js` → `js/venue.js` →
`js/scripts.js` (plain scripts) → `js/sections.js` (ES module, imports three.js via the importmap).

- **Frame.** Everything is laid out on a 1920×1080 frame centred in the window; `--u` (css/main.css) is one
  frame pixel. Position new elements with `calc(N * var(--u))` and `--frame-left`/`--frame-top` (css/main.css).
- **`tools/kinect/bridge.py`**: `/hands` (JSON hands from depth: empty-room background, then the part of each
  person ≥ `detect.depth.reach` mm nearer than their body), `/depth` (picture for the setup screen), `/rgb`.
- **`js/scripts.js`** (Daniele's base, extended): hand source (depth JSON or MediaPipe), sends only the venue's camera crop to MediaPipe,
  cover-maps results onto the frame, keeps stable hand ids and colours, left/right per tracked hand (MediaPipe's
  label is swapped because our image is not mirrored, plus knuckle order), ignores hands not pointing up
  (`detect.upOnly`), draws the hand icons, and dispatches `ath:hands`:
  `{ width, height, hands: [{ id, colour, px, py, open, label }] }` with px/py in viewport pixels.
- **`js/venue.js`**: `VENUE.get()`, `VENUE.onChange(fn)`, `VENUE.statueBandNdc()`, `VENUE.cameraCrop()`;
  the black mask / statue light over the real statue, and the setup screen (`K`). localStorage overrides the file.
- **`js/sections.js`**: the ATHENA letter menu and the section switch.
  - `SLOTS` (DOM order A T / H E / N A): hand over a letter rolls it to its icon (only if `assets/<file>` loads);
    resting `T.dwell` opens `SECTIONS[slot.section]`. Returning rolls all letters back to ATHENA.
  - Going in / out: an iris from the chosen letter (`#veil` black outside a growing circle, `#veilRing` the red
    ring, `#topicCard` the topic's name from `texts.menu.topics`); closing shrinks back into the letter. `busy`
    blocks input meanwhile.
  - Inside a section: ANA SAYFA / HOME button bottom left (hand dwell), idle return after `T.idleReturn`
    with a countdown ring, TR/EN buttons in the menu (reset to Turkish when a visitor leaves).
  - `SECTIONS = { owl: coin, egg, war, craft }`. **Section contract**: `start()`, `stop()`, `reset()`, `setTexts(t)`,
    and either `setHands(list)` (fed from `ath:hands`, NDC coords) or `frame(pts, dt)` (called every animation
    frame with `[{ px, py, open?, mouse? }]`). Optional: `holding` (blocks the back button and idle return),
    `relayout()` (called when the venue mask changes), `handSkin(id)` (asked by `scripts.js` for every hand icon:
    `false` hides it, `{ img, mix }` blends it into another image, `null` keeps the hand).
- **Owl / coin** (`js/coin/`, README there): three.js + cannon-es tetradrachm. Throw with a closed hand,
  lands upright, close-up with info rings after idle, Roman-numeral tally in Cinzel with a marble texture
  (`assets/stone.jpg`, cut from the statue photo). It avoids landing behind the statue mask.
- **War** (`js/war/`): 2D canvas. Arrows fly in from the frame edges and fall short before the statue band.
  A hand held still (within `T.stillTol` px) raises the gorgoneion; arrows near it turn to stone and crumble.
  A War sentence appears after `T.firstLine` arrows, then every `T.perLine`; after the last the volley rests
  for `T.rest` and starts again. All tuning in `T` at the top of `war.js`. No fail state. A still hand's icon
  turns into `assets/gorgon.svg` (via `handSkin`).
- **Craft** (`js/craft/`): cloth parts are outlines in `content/venue.js` `parts` (drawn on the statue photo;
  redraw them at the venue in `K` → "Kumaş parçaları"). A hand in front of a part lights the whole part and its
  icon is hidden; resting there it brightens and goes from warm to pure white (no ring); when full, the part is
  chosen and its panel (texts `craft.parts.<id>`, photo `assets/craft/<id>.jpg`) opens on the nearer side.
  No leader line (statue and wall are at different depths). Light drawn on `#craftLight` above the mask.
- **Egg / Birth** (`js/egg.js`, Daniele's gallery, reworked): the works of `content/egg.json` float in one dark space
  across the whole wall, behind the statue too, in perspective (near = large, bright, spread out; far = small, dim,
  gathered towards the middle), each wandering very slowly in x, y and depth (`T.wander`, `T.wanderZ`). A hand
  resting `T.settle` on a work brings it to the front of its side with its texts in the visitor's language (Turkish in
  each work's `tr` field); the others of that side sink back; it returns `T.linger` after the hand leaves. Each side
  works on its own. Tiles use `assets/gallery/small/`, forward works `assets/gallery/large/` (made by
  `tools/gallery/resize.py` from the originals in `assets/gallery/`; run it after adding a picture).

- **Sound** (`js/sound.js`): every sound is synthesized with Web Audio (no files), through a small room reverb;
  sections call `sfx(name, { x, v })` (x in frame px pans it, v is strength). Recipes and volume in that file; `?mute`.
- **Mind** (`js/mind.js`): no gesture; five sentences while Daniele's olive plate grows (frames cut by
  `tools/olive/slice.py`), then back to the menu by itself (`done`). The olive is drawn by `T.particles` points in the
  drawing's own colours, which flow along curved paths into each next drawing (`T.morph`, `T.swirl`, `T.stagger`).
  Its pace and particle count are set in `K` → Mind (time per sentence, flow time, particles; saved as `mind` in
  `content/venue.js`), read each time Mind opens.
- **Gymnasion** (`js/gymn.js`, id `gymn`): the Vedius Gymnasion as a dark 3D ruin (three.js) left of the statue, walls
  traced from the ground plan in `refs/` by `tools/gymn/trace.py` into `assets/gymn/plan.json`. Opening: the plan draws
  itself in red, the walls rise, the camera tilts. Raised hands are torches (spotlights with shadows; lit places keep a
  glow). Four places (`PLACES`, plan px) hold a sentence each (`texts.gymn.places`), shown right of the statue when lit
  `T.find`; with no hands a torch wanders to the next one. After all four, a niche is drawn around the real statue
  (from the mask) with `texts.gymn.end`, then back to the menu (`done`). Tuning in `T`; `debug` getter for checks.

Layers (z-index): section stages 0 · back and language buttons 0 (after the stages) · hand icons `#drawing` 1 ·
letters 3 · selection ring 5 · statue photo 40000 · venue mask 45000 (covers everything) · craft light 45100 ·
setup screen 60000.

## Visual language (keep new sections consistent)

Black background (black = no light on the wall). No carved/marble/antique look: flat red for anything
carved (`.stone-text` in css/main.css). Type system (css/main.css, agreed with Ege): Roboto
Condensed only for carved/label words (names, numerals, counters like "II / IV", not yet vendored — see
the comment above its `@font-face` in `css/main.css`); Source Serif 4 (`--font-text`, vendored) for
everything read, in the classes `.t-sentence` 40 · `.t-body` 23 · `.t-hint` 20 · `.t-label` 17 (frame px),
`.t-title`, `.t-greek`, `.t-rule`. Left aligned on a fixed edge, one sentence at a time. Owl and egg only
take the font so far, not the layout. White rings for "rest your hand here", red (`var(--amber)`, still
named that in the CSS) for progress; every interface accent stays a shade of red, not amber or teal.
Hints top right, tally/score top left, back button bottom left. Nothing important inside the statue band:
the mask hides it at the venue (`VENUE.statueBandNdc()` gives its horizontal extent).

## The six topics

Order agreed with Ege: left column top to bottom Birth, War, Mind; right column Owl, Craft, Gymnasion.

| Slot | Section id | Topic | Status |
|---|---|---|---|
| A (left, top) | `egg` | Birth | gallery done (Daniele), icon `zeus.svg`; images in `assets/images/` |
| T (right, top) | `owl` | The Owl (coin, trade) | done |
| H (left, middle) | `war` | War | built, stillness under test; icon pending (uses `owl.svg`) |
| E (right, middle) | `craft` | Craft | built with 4 draft parts; parts, texts, photos to decide; needs `assets/craft.svg` |
| N (left, bottom) | `mind` | Mind | built: the olive and the mētis story (Athena and Poseidon, Odysseus), no gesture; texts DRAFT |
| A (right, bottom) | `gymn` | Gymnasion | built: 3D ruin explored with hand torches, sentences found in four places, niche ending; texts DRAFT; icon still `bee.svg` |

Gymnasion is last (bottom right) because its last sentence, about the rough back made to stand against a
wall, closes the piece. Icons: SVG in `assets/` (white line drawing, like `owl.svg`); a slot without its file
does not roll to an icon and cannot be opened by hand.

**War, chosen:** the aegis with stillness (a moving hand does nothing, a still one is the gorgon's stare),
no fail state. Black-figure look (terracotta on black). Open question: is the museum fine with arrows?
If not, the same mechanic works with sparks or embers.

## Known issues / next steps

1. War: tune stillness with Ege on the Kinect/webcam (`T.stillTol`, `T.stillAfter`), War icon.
   Craft: decide the parts with the museum (the draft ids chiton, aegis, himation, roll are guesses from the
   photo; texts in `texts.js` are marked DRAFT), real close-up photos, calibrate outlines on site.
2. Then Craft, Mind, Gymnasion, same pattern. Budget about a day each; keep them simple.
3. Offline: `lib/hands.js` still loads its wasm/model files from jsDelivr (`locateFile` in `js/scripts.js`).
   Vendor the files from `@mediapipe/hands` into `lib/mediapipe/` and point `locateFile` there.
4. `assets/owl.af~lock~` (an Affinity lock file) was committed by accident; remove it and add `*~lock~` to `.gitignore`.
5. At the venue: `K` → mask over the real statue, statue photo off, camera crop, learn the empty room (depth),
   Craft part outlines; save `content/venue.js`. Test depth with several visitors at once on site.
6. GitHub still lists Claude as a contributor because merge `6fd18fe` brought back old commits with
   co-author lines. Only fixable by rewriting `main`; not worth it unless Daniele agrees.
