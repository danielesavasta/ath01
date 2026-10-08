// Sound for the whole installation, made on the spot with Web Audio: no sound files, nothing to license,
// works offline. Every sound is a short recipe below (SOUNDS); sections call
//
//   import { sfx } from "./sound.js";
//   sfx("open");                 // a name from SOUNDS
//   sfx("stone", { x: 1400 });   // x: frame px (0..1920), pans the sound to where it happens on the wall
//   sfx("clink", { v: 0.6 });    // v: strength 0..1, for sounds that come soft or hard (the coin's hits)
//
// Everything goes through a little room reverb and a compressor, so many sounds at once stay calm.
// `S` mutes / unmutes; `?mute` starts muted. Chrome at the venue is started with
// --autoplay-policy=no-user-gesture-required (start.command, start-windows.bat); elsewhere the sound starts
// with the first click, tap or key.

const T = {
  volume: 0.8,     // master volume, 0..1
  reverb: 0.22,    // how much of each sound goes to the room
  room: 2.2        // s, length of the room's echo
};

let ctx = null, master, wet, muted = /[?&]mute\b/.test(location.search);
const last = new Map();   // name -> time last played, so a burst of one sound does not pile up

function init(){
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.25;
  master = ctx.createGain();
  master.gain.value = muted ? 0 : T.volume;
  master.connect(comp).connect(ctx.destination);
  // the room: a convolver with a decaying noise impulse
  const len = Math.floor(ctx.sampleRate * T.room), ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++){
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  const conv = ctx.createConvolver();
  conv.buffer = ir;
  wet = ctx.createGain(); wet.gain.value = T.reverb;
  wet.connect(conv).connect(master);
  return ctx;
}
// iPad / iPhone: Safari's Web Audio is silenced by the silent switch / Silent Mode unless the page asks for
// "playback" (Safari 17+), only starts inside a touch, and can come back "interrupted" (after a call or the
// screen locking). A silent sample played in the first touch unlocks older versions too.
if (navigator.audioSession) try { navigator.audioSession.type = "playback"; } catch (e) {}
let unlocked = false;
function wake(e){
  if (!init()) return;
  if (ctx.state !== "running") ctx.resume().catch(() => {});
  if (e && !unlocked){                       // only inside a touch, click or key press
    unlocked = true;
    const b = ctx.createBufferSource();
    b.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    b.connect(ctx.destination); b.start(0);
  }
}
["pointerdown", "keydown", "touchstart", "touchend", "click"].forEach((e) => window.addEventListener(e, wake, { passive: true }));
document.addEventListener("visibilitychange", () => { if (!document.hidden && ctx) wake(); });
window.addEventListener("ath:hands", () => { if (!ctx) wake(); });
wake();   // with the autoplay flag this starts right away; otherwise it waits for one of the above

// the overall volume (K → Sound)
export function setVolume(v){ T.volume = v; if (master && !muted) master.gain.setTargetAtTime(v, ctx.currentTime, 0.1); }

window.addEventListener("keydown", (e) => {
  if (e.code !== "KeyS" || (e.target && e.target.tagName === "INPUT")) return;
  muted = !muted;
  if (master) master.gain.setTargetAtTime(muted ? 0 : T.volume, ctx.currentTime, 0.05);
});

// ───────────── building blocks ─────────────
let noiseBuf = null;
function noise(){
  if (!noiseBuf){
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  return s;
}
// an output for one sound: panned, with a share sent to the room
function out(pan = 0, room = 1){
  const g = ctx.createGain();
  const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (p){ p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p).connect(master); }
  else g.connect(master);
  const send = ctx.createGain(); send.gain.value = room; g.connect(send).connect(wet);
  return g;
}
// an envelope on a gain: up in `a` s to `peak`, then down to silence in `d` s
function env(gain, t, a, peak, d){
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function tone(dest, t, { f, type = "sine", a = 0.005, peak = 0.2, d = 0.5, to = null, detune = 0 }){
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + a + d);
  env(g, t, a, peak, d);
  o.connect(g).connect(dest);
  o.start(t); o.stop(t + a + d + 0.05);
}
// filtered noise; the filter can sweep from f to `to`
function hiss(dest, t, { f, to = null, q = 1, type = "bandpass", a = 0.01, peak = 0.2, d = 0.3 }){
  const s = noise(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, t);
  if (to) fl.frequency.exponentialRampToValueAtTime(to, t + a + d);
  env(g, t, a, peak, d);
  s.connect(fl).connect(g).connect(dest);
  s.start(t, Math.random()); s.stop(t + a + d + 0.05);
}
// a struck metal or bell: inharmonic partials, the higher ones dying sooner
function bell(dest, t, f, { peak = 0.15, d = 1.6, partials = [1, 2.76, 5.4, 8.93], bright = 1 } = {}){
  partials.forEach((m, i) => tone(dest, t, { f: f * m, peak: peak * Math.pow(0.55, i) * (i ? bright : 1), a: 0.002, d: d / (1 + i * 0.9) }));
}

// ───────────── the sounds ─────────────
const rnd = (a, b) => a + Math.random() * (b - a);
const SOUNDS = {
  // menu
  hover(o, t){ hiss(o, t, { f: 500, to: 2200, q: 1.4, a: 0.06, peak: 0.1, d: 0.3 }); tone(o, t + 0.05, { f: 880, peak: 0.025, a: 0.04, d: 0.5 }); },
  open(o, t){                                  // entering a topic: a warm, low chord, struck softly
    [220, 329.6, 440, 554.4].forEach((f, i) => tone(o, t + i * 0.06, { f, type: "triangle", a: 0.02, peak: 0.07, d: 2.2 }));
    bell(o, t + 0.02, 880, { peak: 0.06, d: 2.4 });
  },
  close(o, t){ [440, 329.6, 246.9].forEach((f, i) => tone(o, t + i * 0.09, { f, type: "triangle", a: 0.01, peak: 0.06, d: 0.9 })); },
  lang(o, t){ tone(o, t, { f: 1250, type: "triangle", peak: 0.08, d: 0.07 }); hiss(o, t, { f: 3000, q: 2, peak: 0.05, d: 0.04 }); },
  spin(o, t){ hiss(o, t, { f: 2200, to: 900, q: 0.9, a: 0.3, peak: 0.035, d: 1.4 }); },   // the letters' reels start
  clack(o, t){ hiss(o, t, { f: 2600, q: 1.6, peak: 0.06, d: 0.05 }); tone(o, t, { f: 196, type: "triangle", peak: 0.05, d: 0.16 }); },   // one stops
  tick(o, t){ tone(o, t, { f: 1600, peak: 0.03, d: 0.05 }); },
  line(o, t){ bell(o, t, 659.3, { peak: 0.05, d: 2, bright: 0.5 }); tone(o, t, { f: 329.6, peak: 0.03, a: 0.08, d: 1.4 }); },

  // owl: the silver coin
  grab(o, t){ bell(o, t, 2600, { peak: 0.05, d: 0.25, bright: 0.6 }); },
  toss(o, t){                                  // the thumb's flick and the coin singing as it spins up
    bell(o, t, rnd(1900, 2100), { peak: 0.1, d: 1.6, partials: [1, 1.51, 2.34, 3.7], bright: 0.8 });
    hiss(o, t, { f: 900, to: 2600, q: 0.8, a: 0.03, peak: 0.08, d: 0.35 });
  },
  clink(o, t, v){                              // a hit on the table, soft to hard
    bell(o, t, rnd(2300, 3400), { peak: 0.03 + 0.14 * v, d: 0.15 + 0.6 * v, partials: [1, 1.47, 2.09, 2.97], bright: 0.7 });
    hiss(o, t, { f: 5000, q: 1.5, peak: 0.03 * v, d: 0.03 });
  },
  result(o, t){ bell(o, t, 523.3, { peak: 0.07, d: 1.6, bright: 0.4 }); bell(o, t + 0.12, 784, { peak: 0.05, d: 1.6, bright: 0.4 }); },
  zoom(o, t){ hiss(o, t, { f: 300, to: 1200, q: 0.7, a: 0.5, peak: 0.05, d: 0.6 }); tone(o, t, { f: 196, a: 0.4, peak: 0.04, d: 1 }); },
  card(o, t){ tone(o, t, { f: 987.8, type: "triangle", peak: 0.05, d: 0.5 }); hiss(o, t, { f: 2500, q: 1, peak: 0.03, d: 0.08 }); },

  // war: arrows and the gorgon's stare
  arrow(o, t){ hiss(o, t, { f: 700, to: 2600, q: 3, a: 0.25, peak: 0.14, d: 0.35 }); },
  gorgon(o, t){                                // a still hand: a low swell and the snakes' hiss
    tone(o, t, { f: 73.4, type: "sawtooth", a: 0.35, peak: 0.035, d: 1.2 });
    tone(o, t, { f: 110, a: 0.3, peak: 0.05, d: 1.2 });
    hiss(o, t + 0.1, { f: 6000, q: 0.8, type: "highpass", a: 0.3, peak: 0.035, d: 0.7 });
  },
  stone(o, t){                                 // clay turning to stone: a dry crack and a thud
    hiss(o, t, { f: 1800, q: 0.9, peak: 0.16, d: 0.06 });
    hiss(o, t + 0.02, { f: 600, q: 1.2, peak: 0.09, d: 0.18 });
    tone(o, t, { f: 120, to: 60, peak: 0.12, d: 0.25 });
  },
  crumble(o, t){                               // gravel trickling down
    for (let i = 0; i < 14; i++){
      const at = t + Math.pow(Math.random(), 1.6) * 1.1;
      hiss(o, at, { f: rnd(1200, 4200), q: rnd(2, 6), peak: rnd(0.05, 0.12), d: rnd(0.02, 0.06) });
    }
  },

  // craft: the light on the cloth
  light(o, t){ [1318.5, 1760, 2217.5].forEach((f, i) => tone(o, t + i * 0.05, { f, a: 0.12, peak: 0.018, d: 0.9 })); },
  choose(o, t){ bell(o, t, 659.3, { peak: 0.08, d: 2.2, bright: 0.6 }); tone(o, t, { f: 329.6, type: "triangle", a: 0.03, peak: 0.05, d: 1.8 }); },

  // birth: the gallery
  tile(o, t){ hiss(o, t, { f: 1400, to: 700, q: 0.8, a: 0.02, peak: 0.05, d: 0.22 }); tone(o, t, { f: 523.3, peak: 0.02, a: 0.03, d: 0.4 }); },

  // mind: the olive growing
  stir(o, t, v){ hiss(o, t, { f: 3400, to: 1900, q: 0.7, a: 0.06, peak: 0.02 + 0.035 * v, d: 0.4 }); },   // a hand through the olive's leaves
  grow(o, t){ hiss(o, t, { f: 2600, to: 1500, q: 0.6, a: 0.15, peak: 0.045, d: 0.5 }); },

  // gymnasion: the ruin
  rise(o, t){                                  // walls rising out of the ground: a long low rumble and some dust
    hiss(o, t, { f: 180, to: 90, q: 0.7, type: "lowpass", a: 0.6, peak: 0.12, d: 1.8 });
    tone(o, t, { f: 49, a: 0.5, peak: 0.07, d: 1.9 });
    for (let i = 0; i < 10; i++) hiss(o, t + 0.3 + Math.random() * 1.6, { f: rnd(1500, 4000), q: rnd(2, 5), peak: rnd(0.01, 0.03), d: rnd(0.02, 0.05) });
  },
  torch(o, t){ hiss(o, t, { f: 400, to: 1400, q: 0.6, a: 0.05, peak: 0.06, d: 0.35 }); tone(o, t, { f: 110, a: 0.04, peak: 0.03, d: 0.4 }); }
};
// the least time between two of the same sound (ms), so bursts stay readable
const GAP = { clink: 45, arrow: 250, crumble: 120, hover: 120, tick: 200, light: 200, grow: 300, torch: 400, stir: 350 };

// ───────────── a ring filling under a resting hand ─────────────
// A held voice like bowed glass on A that swells while the ring fills: the fifth joins at a third, the octave
// at two thirds, the brightness opens, and the "open" chord (also on A) completes it. When the hand leaves it
// sinks with the ring. One voice per ring (`key`); p is the ring's fill 0..1, x where it is (frame px).
const voices = new Map();
function dwellVoice(){
  const g = ctx.createGain(), lp = ctx.createBiquadFilter(), p = ctx.createStereoPanner(), send = ctx.createGain();
  g.gain.value = 0; lp.type = "lowpass"; lp.frequency.value = 500; lp.Q.value = 0.4; send.gain.value = 0.9;
  lp.connect(g).connect(p).connect(master); p.connect(send).connect(wet);
  const parts = [[220, 0, 1], [330, 0.33, 0.55], [440, 0.66, 0.4], [660, 0.88, 0.22]].map(([f, at, a]) => {
    const pg = ctx.createGain(); pg.gain.value = at ? 0 : 1; pg.connect(lp);
    const oscs = [-0.6, 0.7].map((det) => {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.frequency.value = f + det; og.gain.value = a * 0.5;
      o.connect(og).connect(pg); o.start();
      return o;
    });
    return { pg, at, oscs };
  });
  return { g, lp, p, parts };
}
export function dwell(key, p, x = 960){
  let v = voices.get(key);
  if (p <= 0.001 || muted || !ctx || ctx.state !== "running"){
    if (v){
      const t = ctx.currentTime;
      v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(0, t, 0.12);
      v.parts.forEach((q) => q.oscs.forEach((o) => o.stop(t + 1)));
      voices.delete(key);
    }
    return;
  }
  if (!v){ v = dwellVoice(); voices.set(key, v); }
  const t = ctx.currentTime;
  v.g.gain.setTargetAtTime(0.06 * Math.pow(p, 0.8), t, 0.06);
  v.lp.frequency.setTargetAtTime(500 + 3000 * p * p, t, 0.08);
  v.p.pan.setTargetAtTime(Math.max(-1, Math.min(1, (x / 1920) * 2 - 1)) * 0.8, t, 0.1);
  for (const q of v.parts) q.pg.gain.setTargetAtTime(p >= q.at ? 1 : 0, t, 0.3);
}
export function dwellStop(){ for (const k of [...voices.keys()]) dwell(k, 0); }

export function sfx(name, opts = {}){
  const recipe = SOUNDS[name];
  if (!recipe || muted || !init() || ctx.state !== "running") return;
  const now = performance.now();
  if (now - (last.get(name) || 0) < (GAP[name] || 30)) return;
  last.set(name, now);
  const pan = opts.x === undefined ? 0 : (opts.x / 1920) * 2 - 1;
  recipe(out(pan * 0.8, opts.room ?? 1), ctx.currentTime + 0.005, Math.max(0, Math.min(1, opts.v ?? 1)));
}

window.athSound = { sfx, dwell, get muted(){ return muted; }, get context(){ return ctx; }, get master(){ return master; }, timing: T, names: Object.keys(SOUNDS) };
