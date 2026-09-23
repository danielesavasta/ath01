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
hands.setOptions({
    maxNumHands: 8, // allow more than two hands
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.5,
});
hands.onResults(onResults);

const camera = new Camera(videoElement, {
    onFrame: async () => { await hands.send({ image: videoElement }); },
    width: 1280,
    height: 720,
    flipHorizontal: true,
});

function startCamera() {
    camera.start();
    isVideoRunning = true;
    updatenote.innerText = 'Camera started. Tracking hands.';
}

function onResults(results) {
    if (!isVideoRunning) return;
    const width = videoElement.videoWidth;
    const height = videoElement.videoHeight;
    canvasElement.width = width;
    canvasElement.height = height;
    drawingElement.width = width;
    drawingElement.height = height;

    // Clear canvases each frame
    canvasCtx.clearRect(0, 0, width, height);
    drawingCtx.clearRect(0, 0, width, height);

    if (results.multiHandLandmarks?.length && !handAnimationTriggered) {
        handAnimationTriggered = true;
        animateLetters("🦉🥚🦅🦊🦥🦫");
    }

    // Prepare string for hand info display
    const handInfos = [];
    for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const hand = results.multiHandLandmarks[i];
        // If the video is mirrored, invert x coordinates of landmarks for correct spatial logic
        const mirrorX = true; // same as flipHorizontal camera option
        const xs = hand.map(l => (mirrorX ? width - l.x * width : l.x * width));
        const ys = hand.map(l => l.y * height);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

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

        // Get handedness label (Left/Right)
        let handLabel = 'Unknown';
        if (
            results.multiHandedness &&
            results.multiHandedness.length > i
        ) {
            const h = results.multiHandedness[i];
            handLabel = h.classification?.[0]?.label ?? 'Unknown';
        }

        // Fallback if handedness not provided: determine from landmark x position
        if (handLabel === 'Unknown') {
            const wristX = hand[0].x * width; // wrist is first landmark
            handLabel = wristX < width / 2 ? 'Left' : 'Right';
        }

        const centerX = xs.reduce((a, b) => a + b, 0) / xs.length;
        const centerY = ys.reduce((a, b) => a + b, 0) / ys.length;

        const img = open ? openImg : closeImg;
        /*console.log(open);
        console.log(img);*/
        const imgSize = 100;
                // Use mirrored coordinates for rotation calculation
                const wx = xs[0];
                const wy = ys[0];
                const mx = xs[9];
                const my = ys[9];
                let angle = Math.atan2(my - wy, mx - wx);
                // Adjust for handedness
                if (handLabel.toLowerCase() === 'right') {
                    angle = -Math.PI / 2- angle;
                } else {
                    angle += Math.PI / 2;
                }

        // Unified drawing logic with shadow and rotation
        drawingCtx.save();
        drawingCtx.translate(centerX, centerY);
                // Flip icon horizontally only for left hand
                if (handLabel.toLowerCase() === 'right') {
                    drawingCtx.scale(-1, 1);
                }
        drawingCtx.rotate(angle);
        // Apply drop‑shadow for better visibility
        drawingCtx.shadowColor = 'rgba(0,0,0,0.5)';
        drawingCtx.shadowBlur = 8;
        drawingCtx.drawImage(img, -imgSize / 2, -imgSize / 2, imgSize, imgSize);
                drawingCtx.restore();

                // Store hand info
                const xRound = Math.round(centerX);
                const yRound = Math.round(centerY);
                handInfos.push(`H${i} ${xRound}|${yRound}`);
        }
        // Update the updatenote element
        if (updatenote) {
            updatenote.innerText = handInfos.join(' ');
        }
}

if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    startCamera();
} else {
    updatenote.innerText = 'Webcam not supported.';
}

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

