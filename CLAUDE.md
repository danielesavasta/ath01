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

- Serve the repo root (VS Code Live Server, port 5504, or `python3 -m http.server`) and open `index.htm`.
- Camera: the Kinect bridge if it runs, else the webcam. `?source=webcam|kinect` forces one.
  Kinect v1: `tools/kinect/setup.sh` once, then `tools/kinect/.venv/bin/python tools/kinect/bridge.py`
  (`--video rgb|hires|ir`, `--fake` for a test pattern). See `tools/kinect/README.md`.
- `?lite` skips the 5 MB coin model. The mouse works like a hand (press = closed hand).
- Keys: `O` owl · `G` egg · `M` menu · `K` room setup · `D` coin physics panel ·
  in the owl section `Space` toss, `I` close-up, `Esc` leave close-up, `F` flip in hand.
- Headless check without a camera: `tools/test/smoke.mjs` (Playwright; stubs MediaPipe, feeds fake hands).

## How it fits together

Load order in `index.htm`: `lib/hands.js`, `lib/camera_utils.js` → `content/venue.js` → `js/venue.js` →
`js/scripts.js` (plain scripts) → `js/sections.js` (ES module, imports three.js via the importmap).

- **Frame.** Everything is laid out on a 1920×1080 frame centred in the window; `--u` (css/main.css) is one
  frame pixel. Position new elements with `calc(N * var(--u))` and the frame offsets used in `css/sections.css`.
- **`js/scripts.js`** (Daniele's base, extended): camera source, sends only the venue's camera crop to MediaPipe,
  cover-maps results onto the frame, keeps stable hand ids and colours, left/right per tracked hand (MediaPipe's
  label is swapped because our image is not mirrored, plus knuckle order), ignores hands not pointing up
  (`detect.upOnly`), draws the hand icons, and dispatches `ath:hands`:
  `{ width, height, hands: [{ id, colour, px, py, open, label }] }` with px/py in viewport pixels.
- **`js/venue.js`**: `VENUE.get()`, `VENUE.onChange(fn)`, `VENUE.statueBandNdc()`, `VENUE.cameraCrop()`;
  the black mask / statue light over the real statue, and the setup screen (`K`). localStorage overrides the file.
- **`js/sections.js`**: the ATHENA letter menu and the section switch.
  - `SLOTS` (DOM order A T / H E / N A): hand over a letter rolls it to its icon (only if `assets/<file>` loads);
    resting `T.dwell` opens `SECTIONS[slot.section]`. Returning rolls all letters back to ATHENA.
  - Inside a section: ANA SAYFA / HOME button bottom left (hand dwell), idle return after `T.idleReturn`
    with a countdown ring, TR/EN buttons in the menu (reset to Turkish when a visitor leaves).
  - `SECTIONS = { owl: coin, egg }`. **Section contract**: `start()`, `stop()`, `reset()`, `setTexts(t)`,
    and either `setHands(list)` (fed from `ath:hands`, NDC coords) or `frame(pts, dt)` (called every animation
    frame with `[{ px, py, open?, mouse? }]`). Optional: `holding` (blocks the back button and idle return),
    `relayout()` (called when the venue mask changes).
- **Owl / coin** (`js/coin/`, README there): three.js + cannon-es tetradrachm. Throw with a closed hand,
  lands upright, close-up with info rings after idle, Roman-numeral tally in Cinzel with a marble texture
  (`assets/stone.jpg`, cut from the statue photo). It avoids landing behind the statue mask.
- **Egg / Birth** (`js/egg/`, Daniele): gallery of artworks of Athena's birth from `content/egg.json`,
  images in `assets/egg/<id>.jpg`, hand dwell on arrows/dots.

Layers (z-index): coin/egg stages 0 · back and language buttons 0 (after the stages) · hand icons `#drawing` 1 ·
letters 3 · selection ring 5 · statue photo 40000 · venue mask 45000 (covers everything) · setup screen 60000.

## Visual language (keep new sections consistent)

Black background (black = no light on the wall). Cinzel capitals with the marble texture for anything carved
(`.stone-text` in css/sections.css). White rings for "rest your hand here", amber `#F0B429` for progress.
Hints top right, tally/score top left, back button bottom left. Nothing important inside the statue band:
the mask hides it at the venue (`VENUE.statueBandNdc()` gives its horizontal extent).

## The six topics

| Slot | Section id | Topic | Status |
|---|---|---|---|
| A | `owl` | The Owl (coin, trade) | done |
| T | `egg` | Birth | gallery done (Daniele); images to add in `assets/egg/` |
| H | `eagle` | placeholder | topic and icon to assign |
| E | `fox` | placeholder | topic and icon to assign |
| N | `sloth` | placeholder | topic and icon to assign |
| A | `beaver` | placeholder | topic and icon to assign |

Remaining topics: **War, Craft, Mind, Gymnasion**. The docs suggest Gymnasion last (bottom-right A): its
last sentence, about the rough back made to stand against a wall, closes the piece. Emoji keys and file names in `SLOTS` are placeholders
from Daniele; each needs an SVG icon in `assets/` (white line drawing, like `owl.svg`) and a slot decision.

**War, proposed (not yet agreed with Ege):** the aegis. Arrows fly slowly from the frame edges towards
Athena; an open hand raises a shield with the gorgoneion; an arrow meeting it turns to stone, greys to marble
and crumbles. Every few arrows held off, one War sentence appears (texts in the docs); after the last
("She is not fighting. She is watching.") the volley stops. Black-figure pottery look (terracotta on black),
2D canvas, tally of arrows held off. Alternatives discussed: phalanx (hands lock into a shield wall), order
from fury (slow hands arrange spinning spears). Open question: is the museum fine with arrows?

## Known issues / next steps

1. Pick War direction → build it as `js/war/` following the section contract; add its texts to `texts.js`.
2. Then Craft, Mind, Gymnasion, same pattern. Budget about a day each; keep them simple.
3. Offline: `lib/hands.js` still loads its wasm/model files from jsDelivr (`locateFile` in `js/scripts.js`).
   Vendor the files from `@mediapipe/hands` into `lib/mediapipe/` and point `locateFile` there.
4. `assets/owl.af~lock~` (an Affinity lock file) was committed by accident; remove it and add `*~lock~` to `.gitignore`.
5. At the venue: `K` → mask over the real statue, statue photo off, camera crop; save `content/venue.js`.
   Hand detection at 2 m needs light on visitors or the Kinect `--video ir` mode; test on site.
6. GitHub still lists Claude as a contributor because merge `6fd18fe` brought back old commits with
   co-author lines. Only fixable by rewriting `main`; not worth it unless Daniele agrees.
