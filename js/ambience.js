// Soundscapes: a quiet bed of sound under each page, made on the spot like the effects (js/sound.js), no files.
// Not music: a place. Air moving through a stone hall, drones like bowed glass tuned in pure intervals, and rare
// events far away in a long, dark hall (a bronze bowl, a lyre string, a frame drum, water dripping in the baths).
// Nothing loops: every layer drifts on its own over minutes, and events come at uneven times.
//
//   import { ambience } from "./ambience.js";
//   ambience.scene("war");          // crossfades to that page's soundscape ("menu" for the main page)
//   ambience.set("hush", 0.8);      // a scene's parameter: war hushes under the gorgon's stare, mind grows
//   ambience.activity(handsIn);     // every frame: with nobody there for a while it sinks to a whisper
//
// All the pages share one root (D) and one hall, so going from one to another sounds like walking between rooms.
// Volume and the pages' recipes are below (T, SCENES). `?mute` and `S` silence it with the effects.

import { audio, onSfx } from "./sound.js";

const T = {
  volume: 0,         // the soundscapes under the effects, 0..1 (K → Sound overrides). Off: the first version did not
                     // work in the museum's large hall (a noise bed plus echo, in a room that echoes); being redone
  fade: 3,           // s, crossfade between pages
  idleAfter: 60,     // s with nobody in front before it sinks…
  idleLevel: 0.3,    // …to this share of its volume
  duck: 0.7,         // the soundscape dips to this while an effect plays
  hall: 4.2,         // s, the hall's echo (longer and darker than the effects' room)
  root: 73.42        // Hz, D2: every page is built on it
};

// D Dorian, the mode the Greeks called Phrygian, in pure (just) intervals from the root
const JI = { 1: 1, 2: 9 / 8, m3: 6 / 5, 4: 4 / 3, 5: 3 / 2, 6: 5 / 3, m7: 9 / 5, m2: 16 / 15 };

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

let ctx = null, bus = null, level = null, duck = null, hall = null, hallIn = null;
let current = null, wanted = "menu", fading = [], params = {}, lastActive = 0, idle = false, volume = T.volume;
const buffers = {};

// ───────────── the shared hall and buffers ─────────────
function setup(a){
  ctx = a.ctx;
  bus = ctx.createGain();                  // volume
  level = ctx.createGain();                // idle
  duck = ctx.createGain();                 // dips under the effects
  bus.gain.value = volume; level.gain.value = 1; duck.gain.value = 1;
  bus.connect(level).connect(duck).connect(a.master);
  // the hall: a few early reflections, then a tail that darkens as it dies (stone swallows the highs first)
  const sr = ctx.sampleRate, len = Math.floor(sr * T.hall), ir = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++){
    const d = ir.getChannelData(ch);
    let y = 0;
    for (let i = 0; i < len; i++){
      const k = i / len, x = (Math.random() * 2 - 1) * Math.exp(-k * 7);
      const a = 0.55 * Math.pow(1 - k, 2.2) + 0.03;   // one-pole low-pass, closing over time
      y += a * (x - y);
      d[i] = i < sr * 0.022 ? 0 : y;               // 22 ms before the room answers
    }
    for (const [ms, g] of [[11, 0.5], [17, 0.35], [29, 0.3], [41, 0.22], [53, 0.15]]){
      d[Math.floor(sr * (ms + ch * 3) / 1000)] += g * (ch ? 0.8 : 1);
    }
  }
  hall = ctx.createConvolver(); hall.buffer = ir;
  hallIn = ctx.createGain(); hallIn.gain.value = 0.9;
  hallIn.connect(hall).connect(bus);
  // long noise, different per side, so nothing repeats you can hear
  buffers.white = noiseBuffer(9, "white");
  buffers.brown = noiseBuffer(11, "brown");
  onSfx(() => {
    const t = ctx.currentTime;
    duck.gain.cancelScheduledValues(t);
    duck.gain.setTargetAtTime(T.duck, t, 0.04);
    duck.gain.setTargetAtTime(1, t + 0.35, 0.7);
  });
}
function noiseBuffer(sec, kind){
  const len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++){
    const d = b.getChannelData(ch);
    let last = 0;
    for (let i = 0; i < len; i++){
      const w = Math.random() * 2 - 1;
      if (kind === "brown"){ last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    // fade the seam so the loop never clicks
    const f = Math.floor(ctx.sampleRate * 0.05);
    for (let i = 0; i < f; i++){ const g = i / f; d[i] *= g; d[len - 1 - i] *= g; }
  }
  return b;
}
// a looping noise source, starting at audio time t (an event's own noise must not run before it)
function source(buf, t = 0){ const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(t, rnd(0, buf.duration)); return s; }
function panner(x){ const p = ctx.createStereoPanner(); p.pan.value = x; return p; }
// a value that wanders slowly between lo and hi, a new aim every few seconds
function wander(param, lo, hi, every, glide){
  let timer = 0, alive = true;
  const go = () => {
    if (!alive) return;
    param.setTargetAtTime(rnd(lo, hi), ctx.currentTime, glide);
    timer = setTimeout(go, rnd(every[0], every[1]) * 1000);
  };
  param.value = rnd(lo, hi); go();
  return () => { alive = false; clearTimeout(timer); };
}

// ───────────── layers: each returns { stop } and plays into `out` (dry) and `wet` (the hall) ─────────────

// air moving through the hall: brown noise through two drifting band-passes, with slow gusts
function air(out, wet, { lo = 250, hi = 900, level = 0.5, q = 0.9, gust = 0.5 } = {}){
  const stops = [], nodes = [];
  for (const side of [-0.6, 0.6]){
    const s = source(buffers.brown), f = ctx.createBiquadFilter(), g = ctx.createGain(), p = panner(side);
    f.type = "bandpass"; f.Q.value = q;
    s.connect(f).connect(g).connect(p); p.connect(out); p.connect(wet);
    stops.push(wander(f.frequency, lo, hi, [5, 11], 3.5));
    stops.push(wander(g.gain, level * (1 - gust), level, [4, 9], 2.5));
    nodes.push(s);
  }
  return { stop(){ stops.forEach((x) => x()); nodes.forEach((n) => n.stop()); } };
}

// a drone like bowed glass: for each partial, a breath of noise tuned narrowly to it plus a soft sine pair
// beating slowly, each swelling and fading on its own
function drone(out, wet, { root = T.root, ratios = [1, 1.5, 2], level = 0.3, breath = 0.6, cutoff = 1400, grow = null } = {}){
  const stops = [], nodes = [], gains = [];
  const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = cutoff; lp.Q.value = 0.3;
  lp.connect(out); lp.connect(wet);
  ratios.forEach((r, i) => {
    const f = root * r, amp = level / (1 + i * 0.55), g = ctx.createGain(), e = ctx.createGain(), p = panner(rnd(-0.5, 0.5));
    g.gain.value = 0; e.gain.value = grow && i > 0 ? 0 : 1;   // e: whether this partial has joined yet (mind)
    g.connect(e).connect(p).connect(lp);
    // the breath: noise through a very narrow band-pass at the partial
    const n = source(buffers.white), bp = ctx.createBiquadFilter(), bg = ctx.createGain();
    bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = Math.min(80, 25 + f / 20);
    bg.gain.value = breath * 6; n.connect(bp).connect(bg).connect(g);
    // the body: two sines a fraction of a hertz apart
    for (const det of [-0.11, 0.13]){
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.frequency.value = f + det * (1 + i * 0.4); og.gain.value = (1 - breath) * 0.5;
      o.connect(og).connect(g); o.start(); nodes.push(o);
    }
    nodes.push(n);
    gains.push({ e, i });
    stops.push(wander(g.gain, amp * 0.25, amp, [6, 14], 4));
  });
  return {
    stop(){ stops.forEach((x) => x()); nodes.forEach((n) => n.stop()); },
    // mind: partials join one by one as the olive grows (0..1)
    set(name, v){
      if (name !== "grow" || !grow) return;
      for (const { e, i } of gains) e.gain.setTargetAtTime(i <= v * (ratios.length - 1) + 0.01 ? 1 : 0, ctx.currentTime, 2.5);
    }
  };
}

// events at uneven times; `play(t)` schedules one at audio time t
function every(minS, maxS, play, firstIn = null){
  let timer = 0, alive = true;
  const next = (s) => { timer = setTimeout(() => { if (!alive) return; play(ctx.currentTime + 0.05); next(rnd(minS, maxS)); }, s * 1000); };
  next(firstIn ?? rnd(minS * 0.3, maxS * 0.6));
  return { stop(){ alive = false; clearTimeout(timer); } };
}

// a steady beat, scheduled ahead on the audio clock so it never stumbles
function pulse(beatS, play){
  let next = ctx.currentTime + 0.2;
  const timer = setInterval(() => { while (next < ctx.currentTime + 0.4){ play(next); next += beatS; } }, 100);
  return { stop(){ clearInterval(timer); } };
}

// a bronze bowl struck softly with a felt mallet, far away: inharmonic partials, each a slowly beating pair
function bowl(out, wet, t, f, { level = 0.12, decay = 9, pan = rnd(-0.7, 0.7) } = {}){
  const p = panner(pan), g = ctx.createGain(); g.gain.value = level;
  g.connect(p); p.connect(out); p.connect(wet);
  [[1, 1], [2.71, 0.45], [5.15, 0.2], [8.4, 0.08]].forEach(([m, a], i) => {
    for (const det of [0, 0.6 + i * 0.4]){
      const o = ctx.createOscillator(), e = ctx.createGain();
      o.frequency.value = f * m + det;
      const d = decay / (1 + i * 0.8);
      e.gain.setValueAtTime(0.0001, t);
      e.gain.exponentialRampToValueAtTime(a * 0.5, t + 0.012 + i * 0.004);
      e.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(e).connect(g); o.start(t); o.stop(t + d + 0.1);
    }
  });
}

// a lyre string: Karplus-Strong, rendered once per note (a soft pluck, a warm body)
function lyreBuffer(f){
  const key = "lyre" + f.toFixed(2);
  if (buffers[key]) return buffers[key];
  const sr = ctx.sampleRate, len = Math.floor(sr * 4), b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0);
  const n = Math.max(2, Math.round(sr / f - 0.5)), line = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++){ lp += 0.35 * ((Math.random() * 2 - 1) - lp); line[i] = lp; }   // a soft finger
  for (let i = 0; i < len; i++){
    const k = i % n, y = 0.4985 * (line[k] + line[(k + 1) % n]);   // averaging: the string loses its highs and dies away
    line[k] = y;
    d[i] = y;
  }
  // the body: a gentle low-pass and a fade at the end
  let s = 0;
  for (let i = 0; i < len; i++){ s += 0.5 * (d[i] - s); d[i] = s * Math.min(1, (len - i) / (sr * 0.5)); }
  buffers[key] = b;
  return b;
}
function lyre(out, wet, t, f, { level = 0.18, pan = rnd(-0.6, 0.6) } = {}){
  const s = ctx.createBufferSource(), g = ctx.createGain(), p = panner(pan);
  s.buffer = lyreBuffer(f); g.gain.value = level;
  s.connect(g).connect(p); p.connect(out); p.connect(wet);
  s.start(t);
}

// a frame drum: "dum" in the middle of the skin, "tek" near the rim
function drum(out, wet, t, kind, v = 1){
  const p = panner(rnd(-0.15, 0.15)); p.connect(out); p.connect(wet);
  const o = ctx.createOscillator(), g = ctx.createGain();
  const f0 = kind === "dum" ? 92 : 190, f1 = kind === "dum" ? 52 : 150, d = kind === "dum" ? 0.9 : 0.25;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + 0.18);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(p); o.start(t); o.stop(t + d + 0.05);
  const n = source(buffers.white, t), bp = ctx.createBiquadFilter(), ng = ctx.createGain();
  bp.type = "bandpass"; bp.frequency.value = kind === "dum" ? 260 : 900; bp.Q.value = 1.2;
  ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime((kind === "dum" ? 0.25 : 0.35) * v, t + 0.003); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  n.connect(bp).connect(ng).connect(p); n.stop(t + 0.15);
}

// a loom: the shuttle swishing through, then the beater pressing the thread home (a wooden knock)
function loom(out, wet, t, { level = 0.5, pan = rnd(-0.4, 0.4) } = {}){
  const p = panner(pan), g = ctx.createGain(); g.gain.value = level; g.connect(p); p.connect(out); p.connect(wet);
  const n = source(buffers.white, t), bp = ctx.createBiquadFilter(), ng = ctx.createGain();
  bp.type = "bandpass"; bp.Q.value = 1.4;
  bp.frequency.setValueAtTime(rnd(500, 700), t); bp.frequency.exponentialRampToValueAtTime(rnd(1400, 1900), t + 0.45);
  ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.09, t + 0.2); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  n.connect(bp).connect(ng).connect(g); n.stop(t + 0.6);
  const k = t + rnd(0.75, 0.95);
  const o = ctx.createOscillator(), og = ctx.createGain();
  o.frequency.setValueAtTime(rnd(170, 200), k); o.frequency.exponentialRampToValueAtTime(110, k + 0.08);
  og.gain.setValueAtTime(0.0001, k); og.gain.exponentialRampToValueAtTime(0.35, k + 0.004); og.gain.exponentialRampToValueAtTime(0.0001, k + 0.22);
  o.connect(og).connect(g); o.start(k); o.stop(k + 0.3);
  const c = source(buffers.white, k), cf = ctx.createBiquadFilter(), cg = ctx.createGain();
  cf.type = "bandpass"; cf.frequency.value = rnd(1800, 2600); cf.Q.value = 5;
  cg.gain.setValueAtTime(0.0001, k); cg.gain.exponentialRampToValueAtTime(0.3, k + 0.002); cg.gain.exponentialRampToValueAtTime(0.0001, k + 0.04);
  c.connect(cf).connect(cg).connect(g); c.stop(k + 0.08);
}

// a drop of water in a vaulted room
function drip(out, wet, t, { level = 0.12, pan = rnd(-0.8, 0.8) } = {}){
  const p = panner(pan), o = ctx.createOscillator(), g = ctx.createGain(), f = rnd(900, 1600);
  o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * rnd(1.8, 2.4), t + 0.035);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(level, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  o.connect(g).connect(p); p.connect(out); p.connect(wet);
  o.start(t); o.stop(t + 0.12);
}

// crickets far off in the night: a high tone in short bursts of pulses
function cricket(out, wet, t, { level = 0.02, pan = rnd(-0.9, 0.9), f = rnd(4300, 4900) } = {}){
  const p = panner(pan); p.connect(out); p.connect(wet);
  const pulses = 3 + Math.floor(Math.random() * 2);
  for (let i = 0; i < pulses; i++){
    const at = t + i * 0.032, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(level, at + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.022);
    o.connect(g).connect(p); o.start(at); o.stop(at + 0.03);
  }
}

// a little owl calling far away: a breathy, falling "hoo", sometimes twice
function owlCall(out, wet, t, { level = 0.05, pan = rnd(-0.8, 0.8) } = {}){
  const p = panner(pan); p.connect(out); p.connect(wet);
  const calls = Math.random() < 0.4 ? 2 : 1;
  for (let i = 0; i < calls; i++){
    const at = t + i * 0.9, f = rnd(560, 620);
    const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 1400;
    o.type = "triangle";
    o.frequency.setValueAtTime(f * 1.06, at); o.frequency.exponentialRampToValueAtTime(f * 0.94, at + 0.5);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(level, at + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.55);
    o.connect(lp).connect(g).connect(p); o.start(at); o.stop(at + 0.6);
    const n = source(buffers.white, at), bp = ctx.createBiquadFilter(), ng = ctx.createGain();
    bp.type = "bandpass"; bp.frequency.value = f; bp.Q.value = 8;
    ng.gain.setValueAtTime(0.0001, at); ng.gain.exponentialRampToValueAtTime(level * 1.2, at + 0.06); ng.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
    n.connect(bp).connect(ng).connect(p); n.stop(at + 0.6);
  }
}

// a slow glide up from a note, a breath of bowed glass rising (birth)
function rising(out, wet, t, f, { level = 0.05, len = rnd(4, 7) } = {}){
  const p = panner(rnd(-0.6, 0.6)); p.connect(out); p.connect(wet);
  const n = source(buffers.white, t), bp = ctx.createBiquadFilter(), g = ctx.createGain();
  bp.type = "bandpass"; bp.Q.value = 60;
  bp.frequency.setValueAtTime(f, t); bp.frequency.exponentialRampToValueAtTime(f * JI[5], t + len);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(level * 8, t + len * 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  n.connect(bp).connect(g).connect(p); n.stop(t + len + 0.1);
}

// ───────────── the pages ─────────────
const R = T.root;
const note = (name, oct = 0) => R * JI[name] * Math.pow(2, oct);
const SCENES = {
  // the hall before choosing: wind in the stone, a low drone, now and then a bowl far off
  menu: (out, wet) => [
    air(out, wet, { lo: 260, hi: 700, level: 0.55 }),
    drone(out, wet, { ratios: [1, 1.5, 2, 3], level: 0.22, breath: 0.65, cutoff: 900 }),
    every(22, 48, (t) => bowl(out, wet, t, pick([note(1, 2), note(5, 2), note(4, 2)]), { level: 0.07 }), 9)
  ],
  // birth: higher and open, breaths of glass rising a fifth, as if something were coming into being
  egg: (out, wet) => [
    air(out, wet, { lo: 1200, hi: 3200, level: 0.32, q: 0.7 }),
    drone(out, wet, { root: note(1, 1), ratios: [1, 1.5, 2, 2.25, 3], level: 0.16, breath: 0.8, cutoff: 2600 }),
    every(9, 17, (t) => rising(out, wet, t, pick([note(1, 3), note(5, 3), note(2, 3), note(6, 3)]))),
    every(28, 55, (t) => bowl(out, wet, t, pick([note(5, 3), note(1, 4)]), { level: 0.045, decay: 7 }))
  ],
  // the owl: night in an empty agora, crickets, now and then a lyre, and rarely the little owl itself
  owl: (out, wet) => [
    air(out, wet, { lo: 180, hi: 420, level: 0.45, gust: 0.6 }),
    drone(out, wet, { ratios: [1, 1.5, 2], level: 0.12, breath: 0.7, cutoff: 600 }),
    every(0.7, 2.2, (t) => cricket(out, wet, t, { pan: -0.75 })),
    every(0.9, 2.8, (t) => cricket(out, wet, t, { pan: 0.7, f: 4100 })),
    every(7, 15, (t) => {
      const phrase = pick([[1, 5], [4, 5, 1], ["m3", 1], [5, 4, "m3"], ["m7", 5]]);
      phrase.forEach((n, i) => lyre(out, wet, t + i * rnd(0.35, 0.6), note(n, 2)));
    }, 4),
    every(35, 70, (t) => owlCall(out, wet, t), 14)
  ],
  // war: a frame drum like a slow heartbeat, a low drone with a half step of unease in it
  war: (out, wet) => {
    // the stare hushes both the sound and its echo
    const hush = ctx.createBiquadFilter(); hush.type = "lowpass"; hush.frequency.value = 6000;
    const hg = ctx.createGain(); hush.connect(hg).connect(out);
    const hw = ctx.createGain(); hw.connect(wet);
    const beat = 60 / 54;   // a slow heart; the pattern runs in half beats
    let n = 0;
    const layers = [
      air(hush, hw, { lo: 140, hi: 380, level: 0.5 }),
      drone(hush, hw, { ratios: [0.5, 1, 1.5, 16 / 15 * 2], level: 0.24, breath: 0.5, cutoff: 700 }),
      pulse(beat / 2, (t) => {
        const step = n++ % 8, swing = rnd(-0.012, 0.012);
        if (step === 0) drum(hush, hw, t + swing, "dum", 0.9);
        else if (step === 3) drum(hush, hw, t + swing, "tek", 0.35);
        else if (step === 4) drum(hush, hw, t + swing, "dum", 0.55);
        else if (step === 6 && Math.random() < 0.6) drum(hush, hw, t + swing, "tek", 0.25);
      })
    ];
    layers.push({
      stop(){},
      set(name, v){
        if (name !== "hush") return;   // the gorgon's stare: everything goes quiet and muffled
        hush.frequency.setTargetAtTime(6000 - 5600 * v, ctx.currentTime, 0.3);
        hg.gain.setTargetAtTime(1 - 0.75 * v, ctx.currentTime, 0.3);
        hw.gain.setTargetAtTime(1 - 0.75 * v, ctx.currentTime, 0.3);
      }
    });
    return layers;
  },
  // craft: a loom at work in the next room, warm and patient
  craft: (out, wet) => [
    air(out, wet, { lo: 300, hi: 800, level: 0.35 }),
    drone(out, wet, { ratios: [1, 1.5, 2, 2.5], level: 0.16, breath: 0.6, cutoff: 1100 }),
    every(2.4, 3.6, (t) => loom(out, wet, t, { level: 0.45 }), 1.5),
    every(16, 30, (t) => lyre(out, wet, t, pick([note(1, 2), note(5, 2), note(4, 2)]), { level: 0.12 }))
  ],
  // mind: a drone that grows with the olive, one voice for each sentence
  mind: (out, wet) => [
    air(out, wet, { lo: 400, hi: 1100, level: 0.3 }),
    drone(out, wet, { ratios: [1, 1.5, 2, 3, 2.25 * 2, 4], level: 0.2, breath: 0.7, cutoff: 1800, grow: true }),
    every(18, 34, (t) => bowl(out, wet, t, pick([note(5, 2), note(1, 3), note(2, 3)]), { level: 0.05 }))
  ],
  // gymnasion: a vaulted ruin, deep and wet; water dripping in the baths, wind in the doorways
  gymn: (out, wet) => [
    air(out, wet, { lo: 120, hi: 320, level: 0.55, gust: 0.7 }),
    drone(out, wet, { ratios: [0.5, 1, 1.5], level: 0.18, breath: 0.75, cutoff: 500 }),
    every(1.2, 4.5, (t) => drip(out, wet, t)),
    every(26, 50, (t) => bowl(out, wet, t, pick([note(1, 1), note(5, 1)]), { level: 0.06, decay: 12 }))
  ]
};

// how loud each page sits against the others (measured, so that moving between them keeps an even level)
const LEVEL = { menu: 1, egg: 1.9, owl: 1.35, war: 0.85, craft: 1.3, mind: 1.4, gymn: 0.95 };

// ───────────── running it ─────────────
function build(name){
  const make = SCENES[name] || SCENES.menu;
  const g = ctx.createGain(); g.gain.value = 0.0001; g.connect(bus);
  const w = ctx.createGain(); w.gain.value = name === "gymn" ? 1.4 : 1; w.connect(hallIn);
  const layers = make(g, w);
  for (const [k, v] of Object.entries(params)) layers.forEach((l) => l.set && l.set(k, v));
  g.gain.setTargetAtTime(LEVEL[name] || 1, ctx.currentTime, T.fade / 3);
  return { name, g, w, layers };
}
function retire(sc){
  const t = ctx.currentTime;
  sc.g.gain.cancelScheduledValues(t);
  sc.g.gain.setTargetAtTime(0.0001, t, T.fade / 4);
  setTimeout(() => {
    sc.layers.forEach((l) => l.stop());
    setTimeout(() => { sc.g.disconnect(); sc.w.disconnect(); }, 6000);   // let the hall ring out
  }, T.fade * 1000 + 500);
}
function sync(){
  if (!ctx){ const a = audio(); if (!a) return; setup(a); }
  if (ctx.state !== "running") return;
  if (!current || current.name !== wanted){
    if (current) retire(current);
    params = {};
    current = build(wanted);
  }
}
setInterval(sync, 300);

export const ambience = {
  scene(name){ wanted = SCENES[name] ? name : "menu"; sync(); },
  set(name, v){
    if (params[name] !== undefined && Math.abs(params[name] - v) < 0.02) return;
    params[name] = v;
    if (current) current.layers.forEach((l) => l.set && l.set(name, v));
  },
  // called every frame: after a minute with nobody there the soundscape sinks to a whisper
  activity(someone){
    const now = performance.now();
    if (someone) lastActive = now;
    const quiet = now - lastActive > T.idleAfter * 1000;
    if (quiet !== idle && level){
      idle = quiet;
      level.gain.setTargetAtTime(quiet ? T.idleLevel : 1, ctx.currentTime, quiet ? 4 : 0.8);
    }
  },
  volume(v){ volume = v; if (bus) bus.gain.setTargetAtTime(v, ctx.currentTime, 0.2); },
  get name(){ return current && current.name; },
  scenes: Object.keys(SCENES),
  timing: T
};
window.athAmbience = ambience;
