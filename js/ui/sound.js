/**
 * Sound effects, synthesised at runtime.
 *
 * No audio files anywhere. Partly for weight and offline caching, but mainly
 * for licensing: Lichess's default SFX are AGPLv3 and most alternative packs
 * are CC-BY-NC-SA. Oscillators and a noise buffer have no such strings, cost
 * about a kilobyte, and let each cue be tuned precisely.
 *
 * A move is a short filtered noise transient (the "click" of wood on wood) plus
 * a low sine thump for body. Captures are lower and harder. Musical cues —
 * solve, check, wrong — use pitched intervals so they read as meaning, not noise.
 */

import { getProfile } from '../core/store.js';

let ctx = null;
let master = null;
let noiseBuffer = null;
let enabled = true;

function ensureContext() {
  if (ctx) return ctx;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  ctx = new AudioCtx();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  return ctx;
}

function noise() {
  if (noiseBuffer) return noiseBuffer;
  const len = Math.floor(ctx.sampleRate * 0.12);
  noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuffer;
}

/** A filtered noise burst — the percussive part of a piece landing. */
function click({ freq = 2200, q = 1.4, gain = 0.4, decay = 0.055, type = 'bandpass' } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noise();
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  src.connect(filter).connect(g).connect(master);
  src.start(t);
  src.stop(t + decay + 0.02);
}

/** A pitched tone. */
function tone({ freq, type = 'sine', gain = 0.18, attack = 0.004, decay = 0.16, delay = 0, detune = 0 }) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.detune.value = detune;
  const t = ctx.currentTime + delay;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + decay + 0.03);
}

function play(fn) {
  if (!enabled) return;
  const c = ensureContext();
  if (!c) return;
  // Browsers start the context suspended until a gesture unlocks it.
  if (c.state === 'suspended') c.resume().catch(() => {});
  try { fn(); } catch { /* audio must never break gameplay */ }
}

export const sfx = {
  move() {
    play(() => {
      click({ freq: 2000, q: 1.1, gain: 0.34, decay: 0.05 });
      tone({ freq: 168, type: 'sine', gain: 0.1, decay: 0.09 });
    });
  },

  capture() {
    play(() => {
      click({ freq: 1150, q: 0.8, gain: 0.5, decay: 0.085 });
      tone({ freq: 104, type: 'triangle', gain: 0.16, decay: 0.14 });
    });
  },

  check() {
    play(() => {
      click({ freq: 2600, q: 2.2, gain: 0.22, decay: 0.04 });
      tone({ freq: 660, type: 'triangle', gain: 0.12, decay: 0.13 });
      tone({ freq: 699, type: 'triangle', gain: 0.1, decay: 0.16, delay: 0.045 });
    });
  },

  /** Rising major triad — unmistakably "yes". */
  solved() {
    play(() => {
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
      notes.forEach((freq, i) => {
        tone({ freq, type: 'sine', gain: 0.15, decay: 0.34, delay: i * 0.072 });
      });
    });
  },

  /** Low detuned pair — a dull "no" that never feels punishing. */
  wrong() {
    play(() => {
      tone({ freq: 196, type: 'sawtooth', gain: 0.1, decay: 0.17 });
      tone({ freq: 185, type: 'sawtooth', gain: 0.09, decay: 0.19, detune: -12 });
    });
  },

  hint() {
    play(() => {
      tone({ freq: 880, type: 'sine', gain: 0.1, decay: 0.11 });
      tone({ freq: 1174.7, type: 'sine', gain: 0.08, decay: 0.13, delay: 0.06 });
    });
  },

  tick() {
    play(() => click({ freq: 3000, q: 3, gain: 0.12, decay: 0.02 }));
  },

  /** Longer fanfare for a streak milestone. */
  celebrate() {
    play(() => {
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
      notes.forEach((freq, i) => {
        tone({ freq, type: 'sine', gain: 0.14, decay: 0.42, delay: i * 0.085 });
        tone({ freq: freq * 2, type: 'sine', gain: 0.05, decay: 0.3, delay: i * 0.085 });
      });
    });
  },
};

/** Chooses the right cue from a chess.js move object. */
export function playMoveSound(move, { check = false, mate = false } = {}) {
  if (mate) { sfx.solved(); return; }
  if (check) { sfx.check(); return; }
  if (move && move.captured) { sfx.capture(); return; }
  sfx.move();
}

export function setSoundEnabled(on) {
  enabled = !!on;
}

export function initSound() {
  enabled = getProfile().prefs.sound !== false;
  // Unlock the context on the first gesture so the first move is audible.
  const unlock = () => {
    const c = ensureContext();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  };
  window.addEventListener('pointerdown', unlock, { once: true, passive: true });
  window.addEventListener('keydown', unlock, { once: true });
}

/** Short haptic pulse where supported, respecting the preference. */
export function haptic(ms = 12) {
  try {
    if (getProfile().prefs.haptics !== false && navigator.vibrate) navigator.vibrate(ms);
  } catch { /* ignore */ }
}
