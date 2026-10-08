// Soundscapes, second try: no bed and no echo of our own. The museum's hall is large and already rings, so
// silence is the ground and the room is the echo. Each page has one voice that plays a short phrase now and
// then and falls silent again, close and dry:
//
//   menu  a lyre, someone idly plucking a few notes in the Dorian mode
//   owl   the little owl (Athene noctua, Athena's own bird) calling a few times, and a low lyre string
//
// The other pages have no soundscape yet. The lyre is a simulated string (Karplus-Strong: a plucked burst
// travelling along a string that loses its highs), with the pluck position, a wooden body, and neighbouring
// strings ringing along faintly, so it sounds like a string rather than a tone.
//
//   import { ambience } from "./ambience.js";
//   ambience.scene("owl");          // that page's soundscape; any page without one is silent
//   ambience.activity(handsIn);     // every frame: with nobody there for a while it stops
//   ambience.hall(true);            // sound check page only: a simulated large hall, to judge it on headphones
//
// Off in the piece for now (T.volume 0, K → Sound); the sound check page (tools/test/sound.html) turns it up.

import { audio, onSfx } from "./sound.js";

const T = {
  volume: 0,         // 0..1 (K → Sound overrides); 0 = off in the piece while it is being tried
  idleAfter: 60,     // s with nobody in front before it stops (it starts again when someone comes)
  duck: 0.75,        // it dips to this while an effect plays
  root: 146.83       // Hz, D3: the lyre's tonic
};

// D Dorian in pure intervals; the Greek feel comes from the falling tetrachords (A G F E, D C A)
const JI = { D: 1, E: 9 / 8, F: 6 / 5, G: 4 / 3, A: 3 / 2, B: 5 / 3, C: 9 / 5 };
const hz = (n) => { const m = /^([A-G])(\d)?$/.exec(n); return T.root * JI[m[1]] * Math.pow(2, (+(m[2] || 3)) - 3); };

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

let ctx = null, bus = null, duck = null, gate = null, hallSend = null, hallOn = false;
let current = null, wanted = "menu", lastActive = 0, idle = false, volume = T.volume;
const strings = {};

function setup(a){
  ctx = a.ctx;
  bus = ctx.createGain(); duck = ctx.createGain(); gate = ctx.createGain();
  bus.gain.value = volume; duck.gain.value = 1; gate.gain.value = 1;
  bus.connect(duck).connect(gate).connect(a.master);
  onSfx(() => {
    const t = ctx.currentTime;
    duck.gain.cancelScheduledValues(t);
    duck.gain.setTargetAtTime(T.duck, t, 0.04);
    duck.gain.setTargetAtTime(1, t + 0.4, 0.8);
  });
  // only for judging on headphones: a large stone hall like the museum's (the piece itself stays dry)
  const sr = ctx.sampleRate, len = Math.floor(sr * 3.6), ir = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++){
    const d = ir.getChannelData(ch);
    let y = 0;
    for (let i = Math.floor(sr * 0.03); i < len; i++){
      const k = i / len;
      y += (0.5 * Math.pow(1 - k, 2) + 0.04) * ((Math.random() * 2 - 1) * Math.exp(-k * 6.5) - y);
      d[i] = y;
    }
  }
  const conv = ctx.createConvolver(); conv.buffer = ir;
  hallSend = ctx.createGain(); hallSend.gain.value = hallOn ? 0.5 : 0;
  bus.connect(hallSend).connect(conv).connect(duck);
}

// ───────────── the lyre ─────────────
// One string, rendered once per note: a soft burst, combed by where the finger plucks (a fifth of the way along,
// which takes out every fifth harmonic, as on a real string), then Karplus-Strong. The low strings keep a little
// more brightness and ring longer.
function string(f){
  const key = f.toFixed(2);
  if (strings[key]) return strings[key];
  const sr = ctx.sampleRate, len = Math.floor(sr * 5), b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0);
  const n = Math.max(4, Math.round(sr / f - 0.5)), line = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++){ lp += 0.35 * ((Math.random() * 2 - 1) - lp); line[i] = lp; }   // a soft fingertip
  const at = Math.max(1, Math.round(n / 5)), burst = line.slice();
  for (let i = 0; i < n; i++) line[i] = burst[i] - burst[(i + at) % n];
  let mean = 0;
  for (const v of line) mean += v;
  mean /= n;
  for (let i = 0; i < n; i++) line[i] -= mean;
  const loss = 0.996 + Math.min(0.0035, 0.03 / f), bright = f < 200 ? 0.15 : 0.05;
  for (let i = 0; i < len; i++){
    const k = i % n, a = line[k], c = line[(k + 1) % n];
    const y = loss * ((1 - bright) * 0.5 * (a + c) + bright * a);
    line[k] = y; d[i] = y;
  }
  let peak = 0;
  for (let i = 0; i < 2000; i++) peak = Math.max(peak, Math.abs(d[i]));
  const g = 0.6 / (peak || 1), fade = sr * 0.4;
  for (let i = 0; i < len; i++) d[i] *= g * Math.min(1, (len - i) / fade);
  strings[key] = b;
  return b;
}
// the instrument's wooden body: a few broad resonances, the harsh top taken off
function lyreBody(dest){
  const input = ctx.createGain();
  let node = input;
  for (const [f, q, g] of [[110, 1.2, 4], [240, 1.5, 3], [520, 2, 2], [1400, 1, -3], [3200, 0.7, -9]]){
    const bq = ctx.createBiquadFilter(); bq.type = "peaking"; bq.frequency.value = f; bq.Q.value = q; bq.gain.value = g;
    node.connect(bq); node = bq;
  }
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 4200; lp.Q.value = 0.5;
  node.connect(lp).connect(dest);
  return input;
}
function pluck(out, t, name, { v = 1, pan = 0 } = {}){
  const f = hz(name);
  const play = (freq, level, delay = 0) => {
    const s = ctx.createBufferSource(), g = ctx.createGain(), p = ctx.createStereoPanner();
    s.buffer = string(freq); g.gain.value = level; p.pan.value = pan;
    s.connect(g).connect(p).connect(out.lyre);
    s.start(t + delay);
  };
  play(f, 0.5 * v);
  // the neighbouring strings answer faintly (the octave and the fifth), as on a real lyre
  play(f * 2, 0.04 * v, 0.02); play(f * 1.5, 0.03 * v, 0.03);
}

// a few notes, played freely: someone idly plucking, never twice the same
const PHRASES = [
  ["A", "G", "F", "E"], ["D4", "C4", "A"], ["E", "F", "A"], ["A", "D"], ["D", "A", "D4"],
  ["G", "F", "E", "D"], ["F", "E", "D"], ["A", "C4", "D4"], ["E", "D"], ["D", "F", "A", "G"]
];
function phrase(out, t, notes, { v = 1, pan = rnd(-0.25, 0.25), slow = 1 } = {}){
  let at = t;
  notes.forEach((n, i) => {
    const last = i === notes.length - 1;
    pluck(out, at, n, { v: v * rnd(0.75, 1) * (last ? 0.85 : 1), pan });
    if (i === 0 && Math.random() < 0.18) pluck(out, at + 0.012, n[0] === "D" ? "A2" : "D", { v: v * 0.5, pan });   // two strings at once
    at += rnd(0.42, 0.75) * slow * (i === notes.length - 2 ? 1.35 : 1);   // the last note comes a little later
  });
}

// ───────────── the little owl (Athene noctua) ─────────────
// Its call: a plaintive, slightly mewing "kiew", rising then falling a little, with breath in it.
function owlCall(out, t, { v = 1, pan = 0 } = {}){
  const f = rnd(1050, 1150), len = rnd(0.42, 0.55), peak = 0.11 * v;
  const p = ctx.createStereoPanner(); p.pan.value = pan; p.connect(out.dry);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + len * 0.3);
  g.gain.setTargetAtTime(peak * 0.7, t + len * 0.35, len * 0.2);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  g.connect(p);
  const vib = ctx.createOscillator(), vg = ctx.createGain();
  vib.frequency.value = 22; vg.gain.value = f * 0.012; vib.connect(vg);
  const oscs = [[1, 1], [2, 0.18]].map(([m, a]) => {
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.frequency.setValueAtTime(f * 0.78 * m, t);
    o.frequency.exponentialRampToValueAtTime(f * 1.06 * m, t + len * 0.45);
    o.frequency.exponentialRampToValueAtTime(f * 0.94 * m, t + len);
    vg.connect(o.frequency);
    og.gain.value = a; o.connect(og).connect(g);
    return o;
  });
  // the breath: a little noise shaped like the voice
  const nb = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate), nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const ns = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), ng = ctx.createGain();
  ns.buffer = nb; bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = 6;
  ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(peak * 0.5, t + len * 0.25); ng.gain.exponentialRampToValueAtTime(0.0001, t + len);
  ns.connect(bp).connect(ng).connect(p);
  for (const x of [...oscs, vib]){ x.start(t); x.stop(t + len + 0.05); }
  ns.start(t);
}
// it calls a few times, a few seconds apart, from one place, then falls silent
function owlSeries(out, t){
  const n = 2 + Math.floor(Math.random() * 3), pan = pick([-0.55, -0.35, 0.35, 0.55]);
  let at = t;
  for (let i = 0; i < n; i++){ owlCall(out, at, { v: rnd(0.75, 1), pan }); at += rnd(2.6, 4.2); }
}

// ───────────── the pages ─────────────
// events at uneven times; play(t) schedules one at audio time t
function every(minS, maxS, play, firstIn){
  let timer = 0, alive = true;
  const next = (s) => { timer = setTimeout(() => { if (!alive) return; play(ctx.currentTime + 0.05); next(rnd(minS, maxS)); }, s * 1000); };
  next(firstIn);
  return { stop(){ alive = false; clearTimeout(timer); } };
}
const SCENES = {
  menu: (out) => [
    every(16, 32, (t) => phrase(out, t, pick(PHRASES)), rnd(3, 6))
  ],
  owl: (out) => [
    every(26, 48, (t) => owlSeries(out, t), rnd(3, 6)),
    every(30, 55, (t) => phrase(out, t, pick([["D"], ["A2", "D"], ["D", "A2"]]), { v: 0.8, slow: 1.6 }), rnd(14, 20))
  ]
};
const LEVEL = { menu: 1, owl: 1 };

function build(name){
  const g = ctx.createGain(); g.gain.value = LEVEL[name] || 1; g.connect(bus);
  const out = { dry: g, lyre: lyreBody(g) };
  const layers = SCENES[name] ? SCENES[name](out) : [];
  return { name, g, out, layers };
}
function retire(sc){
  sc.layers.forEach((l) => l.stop());
  setTimeout(() => sc.g.disconnect(), 6000);   // what is already sounding rings out; nothing new starts
}
function sync(){
  if (!ctx){ const a = audio(); if (!a) return; setup(a); }
  if (ctx.state !== "running") return;
  if (!current || current.name !== wanted){
    if (current) retire(current);
    current = build(wanted);
  }
}
setInterval(sync, 300);

export const ambience = {
  scene(name){ wanted = name; sync(); },
  set(){},   // pages without a soundscape yet ask for parameters (war's hush, mind's growth); nothing to do
  // called every frame: after a while with nobody there it stops, and starts again with the next visitor
  activity(someone){
    const now = performance.now();
    if (someone) lastActive = now;
    const quiet = now - lastActive > T.idleAfter * 1000;
    if (quiet !== idle && gate){
      idle = quiet;
      gate.gain.setTargetAtTime(quiet ? 0 : 1, ctx.currentTime, quiet ? 3 : 0.5);
    }
  },
  volume(v){ volume = v; if (bus) bus.gain.setTargetAtTime(v, ctx.currentTime, 0.2); },
  hall(on){ hallOn = on; if (hallSend) hallSend.gain.setTargetAtTime(on ? 0.5 : 0, ctx.currentTime, 0.2); },
  // sound check page: play a phrase or a call now, without waiting
  now(){
    if (!current || !ctx) return;
    const t = ctx.currentTime + 0.05;
    if (current.name === "owl") owlSeries(current.out, t); else phrase(current.out, t, pick(PHRASES));
  },
  get name(){ return current && current.name; },
  scenes: Object.keys(SCENES),
  timing: T
};
window.athAmbience = ambience;
