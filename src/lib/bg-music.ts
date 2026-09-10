import { getAudioContext } from "./sounds";

const STORAGE_KEY = "bgMusicEnabled";
const MASTER_GAIN = 0.1;
export const isBgMusicEnabled = (): boolean => {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === null ? true : v === "true";
};

export const setBgMusicEnabled = (on: boolean) => {
  localStorage.setItem(STORAGE_KEY, String(on));
};

interface BgMusicState {
  ctx: AudioContext | null;
  masterGain: GainNode | null;
  nodes: AudioNode[];
  scheduler: number | null;
  nextNoteTime: number;
  step: number;
  started: boolean;
  drumBuffer: AudioBuffer | null;
  snareBuffer: AudioBuffer | null;
  isPausing: boolean;
}

const state: BgMusicState = {
  ctx: null,
  masterGain: null,
  nodes: [],
  scheduler: null,
  nextNoteTime: 0,
  step: 0,
  started: false,
  drumBuffer: null,
  snareBuffer: null,
  isPausing: false,
};

// ── Music theory ──
// D minor / D dorian feel — classic pirate / sea shanty mode
// Melody (one full bar = 8 eighth notes; pattern length 64 steps = 8 bars ≈ 16s)
// Looping a 64-step phrase 4× → ~64s of music, then phrase variation continues seamlessly.
const D = 146.83;
const E = 164.81;
const F = 174.61;
const G = 196.0;
const A = 220.0;
const Bb = 233.08;
const C5 = 261.63;
const D5 = 293.66;
const E5 = 329.63;
const F5 = 349.23;
const G5 = 392.0;
const A5 = 440.0;

// Triumphant rising-and-falling shanty melody (8 bars × 8 steps = 64 steps)
// 0 = rest
const MELODY: number[] = [
  // Bar 1 — call
  D5, 0, F5, 0, A5, 0, F5, 0,
  // Bar 2 — answer
  G5, 0, F5, 0, E5, 0, D5, 0,
  // Bar 3 — climb
  D5, F5, A5, C5 * 2, A5, G5, F5, E5,
  // Bar 4 — resolve
  D5, 0, A, 0, D5, 0, 0, 0,
  // Bar 5 — variation
  F5, 0, A5, 0, G5, 0, E5, 0,
  // Bar 6 — descent
  F5, E5, D5, E5, F5, 0, A, 0,
  // Bar 7 — heroic lift
  A5, 0, G5, F5, E5, F5, G5, A5,
  // Bar 8 — cadence back to D
  F5, E5, D5, 0, D5, 0, 0, 0,
];

// Bass — root of chord on every beat (4 beats per bar = 4 steps in eighth-note grid? Use every 2 steps)
// Chord progression: Dm — F — C — Dm — Gm — F — C — Dm
const BASS: number[] = [
  D / 2, 0, D / 2, 0, D / 2, 0, A / 2, 0,
  F / 2, 0, F / 2, 0, F / 2, 0, C5 / 4, 0,
  C5 / 4, 0, C5 / 4, 0, G / 2, 0, G / 2, 0,
  D / 2, 0, D / 2, 0, A / 2, 0, A / 2, 0,
  G / 2, 0, G / 2, 0, D / 2, 0, D / 2, 0,
  F / 2, 0, F / 2, 0, C5 / 4, 0, C5 / 4, 0,
  C5 / 4, 0, G / 2, 0, C5 / 4, 0, G / 2, 0,
  D / 2, 0, A / 2, 0, D / 2, 0, A / 2, 0,
];

// Drum pattern — kick on 1 & 5, snare on 3 & 7 of each bar
const KICK: boolean[] = Array.from({ length: 64 }, (_, i) => i % 8 === 0 || i % 8 === 4);
const SNARE: boolean[] = Array.from({ length: 64 }, (_, i) => i % 8 === 2 || i % 8 === 6);

const STEP_DURATION = 0.25; // seconds per eighth note → 120 BPM
// 64 steps × 0.25s = 16s per phrase; we play 4 phrases = 64s before it wraps step counter

const buildDrumBuffer = (ctx: AudioContext, type: "kick" | "snare"): AudioBuffer => {
  const duration = type === "kick" ? 0.18 : 0.12;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const sr = ctx.sampleRate;

  if (type === "kick") {
    // Decaying low sine sweep — ship drum thud
    for (let i = 0; i < data.length; i++) {
      const t = i / sr;
      const freq = 80 * Math.exp(-t * 18) + 40;
      const env = Math.exp(-t * 12);
      data[i] = Math.sin(2 * Math.PI * freq * t) * env * 0.9;
    }
  } else {
    // Filtered noise burst — snare/wood crack
    for (let i = 0; i < data.length; i++) {
      const t = i / sr;
      const env = Math.exp(-t * 25);
      data[i] = (Math.random() * 2 - 1) * env * 0.5;
    }
  }
  return buffer;
};

const playDrum = (when: number, type: "kick" | "snare") => {
  if (!state.ctx || !state.masterGain || state.isPausing) return;
  const buffer = type === "kick" ? state.drumBuffer : state.snareBuffer;
  if (!buffer) return;
  const src = state.ctx.createBufferSource();
  src.buffer = buffer;
  const g = state.ctx.createGain();
  g.gain.setValueAtTime(type === "kick" ? 0.55 : 0.28, when);
  src.connect(g).connect(state.masterGain);
  src.start(when);
  src.stop(when + buffer.duration + 0.05);
};

const playMelodyNote = (when: number, freq: number) => {
  if (!state.ctx || !state.masterGain || state.isPausing) return;
  const ctx = state.ctx;
  const dur = STEP_DURATION * 0.9;

  // Horn-like: triangle + slight square harmonic
  const osc1 = ctx.createOscillator();
  osc1.type = "triangle";
  osc1.frequency.setValueAtTime(freq, when);

  const osc2 = ctx.createOscillator();
  osc2.type = "sawtooth";
  osc2.frequency.setValueAtTime(freq, when);

  const oscGain = ctx.createGain();
  // ADSR
  oscGain.gain.setValueAtTime(0, when);
  oscGain.gain.linearRampToValueAtTime(0.35, when + 0.02);
  oscGain.gain.linearRampToValueAtTime(0.22, when + 0.08);
  oscGain.gain.exponentialRampToValueAtTime(0.001, when + dur);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(2400, when);

  const sawGain = ctx.createGain();
  sawGain.gain.value = 0.15;

  osc1.connect(oscGain);
  osc2.connect(sawGain).connect(oscGain);
  oscGain.connect(filter).connect(state.masterGain);

  osc1.start(when);
  osc2.start(when);
  osc1.stop(when + dur + 0.05);
  osc2.stop(when + dur + 0.05);
};

const playBassNote = (when: number, freq: number) => {
  if (!state.ctx || !state.masterGain || state.isPausing) return;
  const ctx = state.ctx;
  const dur = STEP_DURATION * 1.6;

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, when);

  const sub = ctx.createOscillator();
  sub.type = "triangle";
  sub.frequency.setValueAtTime(freq / 2, when);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(0.45, when + 0.03);
  g.gain.exponentialRampToValueAtTime(0.001, when + dur);

  const subG = ctx.createGain();
  subG.gain.value = 0.4;

  osc.connect(g);
  sub.connect(subG).connect(g);
  g.connect(state.masterGain);

  osc.start(when);
  sub.start(when);
  osc.stop(when + dur + 0.05);
  sub.stop(when + dur + 0.05);
};

const PATTERN_LENGTH = MELODY.length; // 64

const scheduleNote = (step: number, time: number) => {
  const i = step % PATTERN_LENGTH;
  const m = MELODY[i];
  const b = BASS[i];
  if (m && m > 0) playMelodyNote(time, m);
  if (b && b > 0) playBassNote(time, b);
  if (KICK[i]) playDrum(time, "kick");
  if (SNARE[i]) playDrum(time, "snare");
};

const SCHEDULE_AHEAD = 0.2; // seconds
const LOOKAHEAD = 50; // ms

const schedulerTick = () => {
  if (!state.ctx || state.isPausing) return;
  while (state.nextNoteTime < state.ctx.currentTime + SCHEDULE_AHEAD) {
    scheduleNote(state.step, state.nextNoteTime);
    state.nextNoteTime += STEP_DURATION;
    state.step++;
  }
  state.scheduler = window.setTimeout(schedulerTick, LOOKAHEAD);
};

export const startBgMusic = () => {
  if (state.started) {
    // Already running — just resume context if suspended
    if (state.ctx && state.ctx.state === "suspended") {
      state.ctx.resume().catch(() => {});
    }
    return;
  }
  if (!isBgMusicEnabled()) return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    state.ctx = ctx;
    state.isPausing = false;

    const masterGain = ctx.createGain();
    masterGain.gain.value = 0; // fade in
    masterGain.connect(ctx.destination);
    state.masterGain = masterGain;

    // Build percussion buffers once
    state.drumBuffer = buildDrumBuffer(ctx, "kick");
    state.snareBuffer = buildDrumBuffer(ctx, "snare");

    // Fade in to MASTER_GAIN over 2s
    masterGain.gain.linearRampToValueAtTime(MASTER_GAIN, ctx.currentTime + 2.0);

    state.nextNoteTime = ctx.currentTime + 0.1;
    state.step = 0;
    state.started = true;

    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    schedulerTick();
  } catch (e) {
    console.warn("[bg-music] failed to start", e);
  }
};

export const pauseBgMusic = async () => {
  console.log("[bg-music] Pausing background music");
  state.isPausing = true;
  
  if (state.scheduler) {
    clearTimeout(state.scheduler);
    state.scheduler = null;
  }

  if (state.ctx && state.masterGain) {
    // Quick fade out (0.1s) then suspend
    const now = state.ctx.currentTime;
    state.masterGain.gain.cancelScheduledValues(now);
    state.masterGain.gain.setValueAtTime(state.masterGain.gain.value, now);
    state.masterGain.gain.linearRampToValueAtTime(0, now + 0.1);
    
    // Wait for fade to complete, then suspend
    await new Promise(resolve => setTimeout(resolve, 120));
    
    if (state.ctx && state.ctx.state === "running") {
      try {
        await state.ctx.suspend();
        console.log("[bg-music] AudioContext suspended");
      } catch (e) {
        console.error("[bg-music] Failed to suspend AudioContext:", e);
      }
    }
  }
};

export const resumeBgMusic = () => {
  if (!isBgMusicEnabled()) return;
  if (!state.started) {
    startBgMusic();
    return;
  }
  
  console.log("[bg-music] Resuming background music");
  state.isPausing = false;
  
  if (!state.ctx || !state.masterGain) return;
  
  state.ctx.resume().catch(() => {});
  
  const now = state.ctx.currentTime;
  state.masterGain.gain.cancelScheduledValues(now);
  state.masterGain.gain.setValueAtTime(state.masterGain.gain.value, now);
  state.masterGain.gain.linearRampToValueAtTime(MASTER_GAIN, now + 0.5);
  
  if (!state.scheduler && state.ctx.state === "running") {
    state.nextNoteTime = state.ctx.currentTime + 0.1;
    schedulerTick();
  }
};