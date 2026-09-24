// MediaPipe Hands implementation
const videoElement = document.getElementById('myvideo');
const handImg = document.getElementById('handimage'); // unused but kept for compatibility
const canvasElement = document.getElementById('canvas');
const canvasCtx = canvasElement.getContext('2d');
const drawingElement = document.getElementById('drawing');
const drawingCtx = drawingElement.getContext('2d');
const updatenote = document.getElementById('updatenote');

// Load hand icon images
const openImg = new Image();
openImg.src = 'assets/openHand.svg'; // adjust path if needed
const closeImg = new Image();
closeImg.src = 'assets/closeHand.svg'; // adjust path if needed

let isVideoRunning = false;
let handAnimationTriggered = false;

const letterAssets = {
    '🦉': 'owl.svg',
    '🥚': 'egg.svg',
    '🦅': 'eagle.svg',
    '🦊': 'fox.svg',
    '🦥': 'sloth.svg',
    '🦫': 'beaver.svg',
};

// MediaPipe Hands configuration
const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
});
// detection threshold and the other room settings come from content/venue.js (setup screen: K)
const venue = () => (window.VENUE ? window.VENUE.get() : { detect: { confidence: 0.6, upOnly: 70 } });
let detectConfidence = venue().detect.confidence;
hands.setOptions({
    maxNumHands: 8, // allow more than two hands
    modelComplexity: 1,
    minDetectionConfidence: detectConfidence,
    minTrackingConfidence: 0.5,
});
hands.onResults(onResults);
if (window.VENUE) window.VENUE.onChange((S) => {
    if (S.detect.confidence !== detectConfidence) {
        detectConfidence = S.detect.confidence;
        hands.setOptions({ minDetectionConfidence: detectConfidence });
    }
});

// Only the chosen part of the camera image goes to the hand detector (setup screen: K, Kamera).
// Zooming in makes people standing far away look bigger to it, which is what it needs at 2 m and beyond.
// Its results are then relative to that part, and that part is what covers the screen.
const cropCanvas = document.createElement('canvas');
const cropCtx = cropCanvas.getContext('2d');
async function sendFrame(source, camW, camH) {
    window.athCamera = { el: source, w: camW, h: camH };      // for the setup screen
    const c = window.VENUE ? window.VENUE.cameraCrop(camW, camH) : { x: 0, y: 0, w: camW, h: camH };
    if (cropCanvas.width !== c.w || cropCanvas.height !== c.h) { cropCanvas.width = c.w; cropCanvas.height = c.h; }
    cropCtx.drawImage(source, c.x, c.y, c.w, c.h, 0, 0, c.w, c.h);
    frameSize.w = c.w; frameSize.h = c.h;
    await hands.send({ image: cropCanvas });
}

const camera = new Camera(videoElement, {
    onFrame: async () => {
        if (videoElement.videoWidth) await sendFrame(videoElement, videoElement.videoWidth, videoElement.videoHeight);
    },
    width: 1280,
    height: 720,
    flipHorizontal: true,
});

// Camera source: the Kinect bridge (tools/kinect/bridge.py) when it is running, otherwise the webcam.
// ?source=kinect or ?source=webcam on the URL forces one.
const KINECT_URL = 'ws://127.0.0.1:8770/rgb';
const frameSize = { w: 0, h: 0 }; // size of the images MediaPipe gets (the chosen part of the camera image)

function startCamera() {
    const forced = new URLSearchParams(location.search).get('source');
    if (forced === 'webcam') return startWebcam();
    startKinect().catch(() => {
        if (forced === 'kinect') { updatenote.innerText = 'Kinect bridge not running (tools/kinect/bridge.py).'; return; }
        startWebcam();
    });
}

function startWebcam() {
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
        updatenote.innerText = 'Webcam not supported.';
        return;
    }
    frameSize.w = frameSize.h = 0;
    camera.start()
        .then(() => { isVideoRunning = true; updatenote.innerText = 'Webcam started. Tracking hands.'; })
        .catch((e) => { updatenote.innerText = 'No camera: ' + (e && e.message ? e.message : e); });
}

function startKinect() {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(KINECT_URL);
        ws.binaryType = 'blob';
        const frame = document.createElement('canvas');
        const fctx = frame.getContext('2d');
        let opened = false, busy = false;
        const timer = setTimeout(() => { if (!opened) { ws.close(); reject(); } }, 1500);
        ws.onopen = () => {
            opened = true; clearTimeout(timer);
            isVideoRunning = true;
            updatenote.innerText = 'Kinect connected. Tracking hands.';
            resolve();
        };
        ws.onerror = () => { if (!opened) { clearTimeout(timer); reject(); } };
        ws.onclose = () => { if (opened) updatenote.innerText = 'Kinect bridge stopped. Restart it and reload the page.'; };
        ws.onmessage = async (e) => {
            if (busy) return; // skip frames while MediaPipe is still busy with the last one
            busy = true;
            try {
                const bmp = await createImageBitmap(e.data);
                if (frame.width !== bmp.width || frame.height !== bmp.height) { frame.width = bmp.width; frame.height = bmp.height; }
                fctx.drawImage(bmp, 0, 0);
                bmp.close();
                await sendFrame(frame, frame.width, frame.height);
            } catch (err) {
                console.error(err);
            } finally {
                busy = false;
            }
        };
    });
}

// ── Screen mapping ──
// The installation is laid out for a 1920×1080 frame, centred and scaled to fit the window
// (see --u in css/main.css). The camera image covers that frame: cropped, not letterboxed,
// so hands reach its edges whatever the camera's aspect ratio.
function frameRect() {
    const u = Math.min(innerWidth / 1920, innerHeight / 1080);
    const w = 1920 * u, h = 1080 * u;
    return { x: (innerWidth - w) / 2, y: (innerHeight - h) / 2, w, h, u };
}

// The drawing canvas is the size of the screen in device pixels, so the vector icons stay sharp.
function fitDrawingCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const W = Math.round(innerWidth * dpr), H = Math.round(innerHeight * dpr);
    if (drawingElement.width !== W || drawingElement.height !== H) {
        drawingElement.width = W;
        drawingElement.height = H;
    }
    drawingCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawingCtx.clearRect(0, 0, innerWidth, innerHeight);
}

// ── Hand colours ──
// Hands are matched frame to frame by position, so each keeps its colour while it stays in view.
const HAND_ICON = 90;   // icon size in 1920×1080 frame pixels
const HAND_COLOURS = ['#F0B429', '#3FA08C', '#E0605A', '#5B8DEF', '#C77DDB', '#7CCB5B', '#F08A3C', '#4FC3D9'];
let trackedHands = [];
let nextHandId = 1;

// ── Left or right ──
// Each hand keeps the side it was given while it stays in view, wherever it moves on the screen.
// Two clues per frame, combined in `vote` (+1 right, -1 left):
//  · MediaPipe's own label. It assumes a mirrored (selfie) image; ours is not mirrored, so it is swapped.
//  · The order of the knuckles: going round from the wrist, index knuckle then little-finger knuckle turn one
//    way for a right hand and the other way for a left one (palm towards the camera), however the hand is
//    tilted. With fingers up, a right hand's index knuckle is on the image's right.
// The side follows a slow average of the votes: the first few frames decide it, and after that it only
// changes if the clues disagree with it for about a second.
function handVote(hand, mp, width, height) {
    const ax = (hand[5].x - hand[0].x) * width, ay = (hand[5].y - hand[0].y) * height;
    const bx = (hand[17].x - hand[0].x) * width, by = (hand[17].y - hand[0].y) * height;
    const knuckles = ax * by - ay * bx < 0 ? 1 : -1;
    let label = 0;
    if (mp && mp.label) label = (mp.label === 'Left' ? 1 : -1) * Math.min(1, mp.score ?? 0.6);
    return 0.4 * knuckles + 0.6 * label;
}
function decideSide(h) {
    h.side += (h.vote - h.side) * (h.frames < 8 ? 0.35 : 0.04);
    if (!h.label || h.frames < 8) h.label = h.side >= 0 ? 'Right' : 'Left';
    else if (h.label === 'Right' && h.side < -0.45) h.label = 'Left';
    else if (h.label === 'Left' && h.side > 0.45) h.label = 'Right';
}

function identifyHands(found, now, maxJump) {
    const prev = trackedHands.slice();
    const taken = new Set();
    const next = [];
    for (const h of found) {
        let best = null, bd = maxJump;
        for (const p of prev) {
            if (taken.has(p.id)) continue;
            const d = Math.hypot(p.sx - h.sx, p.sy - h.sy);
            if (d < bd) { bd = d; best = p; }
        }
        if (best) { taken.add(best.id); h.id = best.id; h.colour = best.colour; h.side = best.side; h.label = best.label; h.frames = best.frames + 1; h.wasUp = best.wasUp; }
        else { h.id = nextHandId++; h.side = 0; h.label = null; h.frames = 0; h.wasUp = false; }
        decideSide(h);
        h.seen = now;
        next.push(h);
    }
    // a hand lost for a moment keeps its colour when it comes back
    for (const p of prev) if (!taken.has(p.id) && now - p.seen < 600) next.push(p);
    for (const h of next) {
        if (h.colour) continue;
        const used = new Set(next.filter(o => o.colour).map(o => o.colour));
        h.colour = HAND_COLOURS.find(c => !used.has(c)) || HAND_COLOURS[h.id % HAND_COLOURS.length];
    }
    trackedHands = next;
    return found;
}

// Solid silhouette of an outline icon (flood-fill the outside), tinted per colour and cached.
const silhouettes = new Map();
const tints = new Map();
function silhouetteOf(img) {
    if (silhouettes.has(img)) return silhouettes.get(img);
    if (!img.complete) return null;
    const N = 512, c = document.createElement('canvas');
    c.width = c.height = N;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(img, 0, 0, N, N);
    const d = x.getImageData(0, 0, N, N), a = d.data;
    const outside = new Uint8Array(N * N), stack = [];
    for (let i = 0; i < N; i++) stack.push(i, (N - 1) * N + i, i * N, i * N + N - 1);
    while (stack.length) {
        const p = stack.pop();
        if (outside[p] || a[p * 4 + 3] > 40) continue;
        outside[p] = 1;
        const px = p % N, py = (p / N) | 0;
        if (px > 0) stack.push(p - 1);
        if (px < N - 1) stack.push(p + 1);
        if (py > 0) stack.push(p - N);
        if (py < N - 1) stack.push(p + N);
    }
    for (let p = 0; p < N * N; p++) {
        a[p * 4] = a[p * 4 + 1] = a[p * 4 + 2] = 255;
        a[p * 4 + 3] = outside[p] ? 0 : 255;
    }
    x.putImageData(d, 0, 0);
    silhouettes.set(img, c);
    return c;
}
function tintedSilhouette(img, colour) {
    const key = img.src + colour;
    if (tints.has(key)) return tints.get(key);
    const sil = silhouetteOf(img);
    if (!sil) return null;
    const c = document.createElement('canvas');
    c.width = sil.width; c.height = sil.height;
    const x = c.getContext('2d');
    x.drawImage(sil, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = colour;
    x.fillRect(0, 0, c.width, c.height);
    tints.set(key, c);
    return c;
}

function onResults(results) {
    if (!isVideoRunning) return;
    const width = frameSize.w || videoElement.videoWidth;
    const height = frameSize.h || videoElement.videoHeight;
    if (!width || !height) return;
    canvasElement.width = width;
    canvasElement.height = height;
    canvasCtx.clearRect(0, 0, width, height);
    fitDrawingCanvas();

    // The letters react to hands in js/sections.js: a hand over a letter rolls it to its section's icon.

    const map = frameRect();
    const s = Math.max(map.w / width, map.h / height);            // camera px -> screen px (cover)
    const ox = map.x + (map.w - width * s) / 2, oy = map.y + (map.h - height * s) / 2;

    const found = [];
    const handList = results.multiHandLandmarks || []; // undefined when no hand is in view
    for (let i = 0; i < handList.length; i++) {
        const hand = handList[i];
        // If the video is mirrored, invert x coordinates of landmarks for correct spatial logic
        const mirrorX = true; // same as flipHorizontal camera option
        const xs = hand.map(l => (mirrorX ? width - l.x * width : l.x * width));
        const ys = hand.map(l => l.y * height);

        // Determine if hand is open: check finger tip above middle joint
        // MediaPipe hand landmark indexes: 4=thumb tip, 8=index tip, 12=middle, 16=ring, 20=pinky
        const tipIds = [4, 8, 12, 16, 20];
        let open = true;
        for (const id of tipIds) {
            const tipY = hand[id].y * height;
            const lowerId = id - 2; // corresponding middle joint
            const lowerY = hand[lowerId].y * height;
            if (tipY > lowerY + 5) { // fingertip below joint indicates folded
                open = false;
                break;
            }
        }

        // MediaPipe's handedness: { label, score } (older builds nest it in classification[0])
        const mh = results.multiHandedness && results.multiHandedness[i];
        const mp = mh && (mh.label ? mh : mh.classification && mh.classification[0]);
        const vote = handVote(hand, mp, width, height);

        const centerX = xs.reduce((a, b) => a + b, 0) / xs.length;
        const centerY = ys.reduce((a, b) => a + b, 0) / ys.length;

        // how far the hand leans from pointing straight up (wrist -> middle-finger knuckle), degrees
        const up = Math.atan2(Math.abs(xs[9] - xs[0]), ys[0] - ys[9]) * 180 / Math.PI;

        found.push({ open, vote, up, dx: xs[9] - xs[0], dy: ys[9] - ys[0], sx: ox + centerX * s, sy: oy + centerY * s, camX: centerX / width, camY: centerY / height });
    }

    identifyHands(found, performance.now(), map.w * 0.18);
    // Only hands pointing up take part: arms hanging down, or hands resting on a railing, are ignored.
    // A hand already in play gets 20° more, so tilting it while throwing doesn't make it vanish.
    const upOnly = venue().detect.upOnly;
    for (const h of found) {
        const limit = upOnly >= 180 ? 999 : upOnly + (h.wasUp ? 20 : 0);
        h.isUp = h.up <= limit;
        h.wasUp = h.isUp;
    }
    const shown = found.filter((h) => h.isUp);
    // icon rotation from wrist to middle-finger base; the icon is a right hand, mirrored for a left one
    for (const h of found) {
        const a = Math.atan2(h.dy, h.dx);
        h.angle = h.label === 'Left' ? -Math.PI / 2 - a : a + Math.PI / 2;
    }

    const size = HAND_ICON * map.u;
    const handInfos = [];
    for (const h of shown) {
        const img = h.open ? openImg : closeImg;
        drawingCtx.save();
        drawingCtx.translate(h.sx, h.sy);
        if (h.label === 'Left') drawingCtx.scale(-1, 1); // mirror the icon for a left hand
        drawingCtx.rotate(h.angle);
        const tint = tintedSilhouette(img, h.colour);
        if (tint) {
            drawingCtx.globalAlpha = 0.5;
            drawingCtx.drawImage(tint, -size / 2, -size / 2, size, size);
            drawingCtx.globalAlpha = 1;
        }
        drawingCtx.shadowColor = 'rgba(0,0,0,0.5)';
        drawingCtx.shadowBlur = 8;
        drawingCtx.drawImage(img, -size / 2, -size / 2, size, size);
        drawingCtx.restore();
        handInfos.push(`H${h.id}${h.label === 'Left' ? 'L' : 'R'} ${Math.round(h.sx)}|${Math.round(h.sy)}`);
    }
    if (updatenote) updatenote.innerText = handInfos.join(' ');

    // shared with js/sections.js: positions in viewport pixels
    window.dispatchEvent(new CustomEvent('ath:hands', { detail: {
        width, height,
        hands: shown.map(h => ({ id: h.id, colour: h.colour, px: h.sx, py: h.sy, open: h.open, label: h.label }))
    } }));
}

startCamera();

const letters = ['A', 'T', 'H', 'E', 'N', 'A']; // Add more letters as needed

// Animate letter the backgrond should slide downwards and a new letter should appear from top of the screen.
// The letter should be randomly selected from a set of letters.
// The letters are in svg format and are stored in the assets folder.
// Each letter is identified by .letter class.
// Among the 6 visible letters the current letter and the target letter should be saved. The in-between transition letters should be randomly selected from the set of letters.
// The letter should be displayed for a few seconds before sliding down and being replaced by a new letter.

function getRandomLetter() {
    const randomIndex = Math.floor(Math.random() * letters.length);
    return letters[randomIndex];
}

function createLetterElement(letter) {
    const slot = document.createElement('div');
    slot.classList.add('letter-slot');

    const letterElement = document.createElement('div');
    letterElement.classList.add('letter', `letter${letter}`);
    letterElement.dataset.letter = letter;

    if (letterAssets[letter]) {
        letterElement.style.backgroundImage = `url('assets/${letterAssets[letter]}')`;
    }

    slot.appendChild(letterElement);
    return slot;
}

function createLetters(){
    const container = document.querySelector('.container');
    if (!container) return;

    for(let i = 0; i < letters.length; i++){
        const letter = letters[i];
        const letterElement = createLetterElement(letter);
        container.appendChild(letterElement);
    }
}

function animateLetters(targetWord) {
    const container = document.querySelector('.container');
    if (!container || typeof targetWord !== 'string') return;

    const targetLetters = Array.from(targetWord.toUpperCase());
    const slots = Array.from(container.querySelectorAll('.letter-slot'));
    const currentSlots = slots.length === letters.length
        ? slots
        : Array.from(container.children).map((element) => {
            const slot = document.createElement('div');
            slot.className = 'letter-slot';
            element.parentNode.insertBefore(slot, element);
            slot.appendChild(element);
            return slot;
        });

    currentSlots.slice(0, letters.length).forEach((slot, index) => {
        const currentLetterElement = slot.querySelector('.letter');
        const targetLetter = targetLetters[index] || getRandomLetter();
        if (!currentLetterElement) return;

        const incomingLetterElement = createLetterElement(targetLetter).firstElementChild;
        incomingLetterElement.classList.add('letter-incoming');
        slot.appendChild(incomingLetterElement);

        const delay = 2000 * index;
        setTimeout(() => {
            currentLetterElement.classList.add('letter-exiting');
            incomingLetterElement.classList.add('letter-entering');
        }, delay);

        setTimeout(() => {
            currentLetterElement.remove();
            incomingLetterElement.classList.remove('letter-incoming', 'letter-entering');
        }, delay + 900);
    });

    return currentSlots;
}

function startLetterAnimation() {
    animateLetters(letters.join(''));
}

