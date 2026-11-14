/**
 * Atelier's sound design, synthesised with the Web Audio API (no files to
 * download). Quiet, short, tactile: a felt tap for buttons, a ticking ratchet
 * while a pin is pulled, a cloth swish for fabric, a soft settle when the
 * studio lands, a sparkle when the stylist acts and a warm chord on success.
 *
 * Sounds that happen on the dress form (the ratchet, cloth, settle, sparkle)
 * go through an HRTF panner placed at the form, so in the headset they come
 * from the form's spot in the room; button taps stay centred.
 *
 * The AudioContext is created lazily on the first sound (always after a user
 * gesture, which browsers require) and resumed if the platform suspended it.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
/** Spatial bus: positioned at the dress form. */
let spatial: GainNode | null = null;
let panner: PannerNode | null = null;
const formPos = { x: 0, y: 1, z: -1.55 };
let noise: AudioBuffer | null = null;
let muted = false;
/** Paused by the platform (system menu open); separate from a user mute. */
let paused = false;
let lastTick = 0;

function audio(): AudioContext | null {
  if (muted || paused) return null;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 1;
      panner.rolloffFactor = 0.6;
      panner.positionX.value = formPos.x;
      panner.positionY.value = formPos.y;
      panner.positionZ.value = formPos.z;
      spatial = ctx.createGain();
      spatial.gain.value = 0.42;
      spatial.connect(panner).connect(ctx.destination);
      noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** One enveloped oscillator note. */
function note(freq: number, start: number, dur: number, gain: number, type: OscillatorType = 'sine', at = false): void {
  const a = audio();
  const out = at ? spatial : master;
  if (!a || !out) return;
  const t = a.currentTime + start;
  const osc = a.createOscillator();
  const env = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** Filtered noise burst (cloth, settle). */
function hush(dur: number, gain: number, from: number, to: number, q = 0.8, at = false): void {
  const a = audio();
  const out = at ? spatial : master;
  if (!a || !out || !noise) return;
  const t = a.currentTime;
  const src = a.createBufferSource();
  src.buffer = noise;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + dur);
  const env = a.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + dur * 0.3);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(env).connect(out);
  src.start(t);
  src.stop(t + dur + 0.02);
}

export const sfx = {
  /** Any button, chip or rack tap. */
  tap(): void {
    note(880, 0, 0.07, 0.18, 'triangle');
    note(1320, 0.005, 0.05, 0.06);
  },
  /** While a tailoring pin moves; rate-limited so it reads as a ratchet. */
  tick(): void {
    const a = audio();
    if (!a) return;
    const now = a.currentTime;
    if (now - lastTick < 0.055) return;
    lastTick = now;
    note(2200 + Math.random() * 300, 0, 0.025, 0.05, 'square', true);
  },
  /** Fabric applied to a garment. */
  swish(): void {
    hush(0.32, 0.5, 3200, 900, 0.7, true);
  },
  /** The studio settles onto the floor. */
  settle(): void {
    note(110, 0, 0.5, 0.25, 'sine', true);
    hush(0.4, 0.2, 400, 120, 1.2, true);
  },
  /** The stylist puts an idea on the form. */
  sparkle(): void {
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => note(f, i * 0.055, 0.35, 0.07, 'sine', true));
  },
  /** Saved, logged, kept. */
  success(): void {
    [523.25, 659.25, 783.99].forEach((f, i) => note(f, i * 0.07, 0.6, 0.1, 'triangle'));
  },
  /** Undo / redo. */
  rewind(): void {
    note(660, 0, 0.08, 0.1, 'triangle');
    note(440, 0.06, 0.1, 0.08, 'triangle');
  },
  /** Where the dress form is (world space), for the spatial bus. */
  setSource(x: number, y: number, z: number): void {
    formPos.x = x;
    formPos.y = y;
    formPos.z = z;
    if (panner && ctx) {
      const t = ctx.currentTime;
      panner.positionX.setTargetAtTime(x, t, 0.05);
      panner.positionY.setTargetAtTime(y, t, 0.05);
      panner.positionZ.setTargetAtTime(z, t, 0.05);
    }
  },
  /** The listener's head pose (world space): position, forward and up. */
  setListener(px: number, py: number, pz: number, fx: number, fy: number, fz: number, ux: number, uy: number, uz: number): void {
    const l = ctx?.listener;
    if (!l || !ctx || !l.positionX) return;
    const t = ctx.currentTime;
    l.positionX.setTargetAtTime(px, t, 0.03);
    l.positionY.setTargetAtTime(py, t, 0.03);
    l.positionZ.setTargetAtTime(pz, t, 0.03);
    l.forwardX.setTargetAtTime(fx, t, 0.03);
    l.forwardY.setTargetAtTime(fy, t, 0.03);
    l.forwardZ.setTargetAtTime(fz, t, 0.03);
    l.upX.setTargetAtTime(ux, t, 0.03);
    l.upY.setTargetAtTime(uy, t, 0.03);
    l.upZ.setTargetAtTime(uz, t, 0.03);
  },
  /** Whether the spatial bus exists yet (for scripted checks). */
  get spatialReady(): boolean {
    return !!panner;
  },
  setMuted(value: boolean): void {
    muted = value;
  },
  /** The session lost focus (e.g. the system menu): silence everything. */
  pause(): void {
    paused = true;
    if (ctx && ctx.state === 'running') void ctx.suspend();
  },
  resume(): void {
    paused = false;
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  },
  get paused(): boolean {
    return paused;
  },
};
