/**
 * Atelier's sound design, synthesised with the Web Audio API (no files to
 * download). Quiet, short, tactile: a felt tap for buttons, a ticking ratchet
 * while a pin is pulled, a cloth swish for fabric, a soft settle when the
 * studio lands, a sparkle when the stylist acts and a warm chord on success.
 *
 * The AudioContext is created lazily on the first sound (always after a user
 * gesture, which browsers require) and resumed if the platform suspended it.
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let muted = false;
let lastTick = 0;

function audio(): AudioContext | null {
  if (muted) return null;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
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
function note(freq: number, start: number, dur: number, gain: number, type: OscillatorType = 'sine'): void {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime + start;
  const osc = a.createOscillator();
  const env = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(env).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

/** Filtered noise burst (cloth, settle). */
function hush(dur: number, gain: number, from: number, to: number, q = 0.8): void {
  const a = audio();
  if (!a || !master || !noise) return;
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
  src.connect(filter).connect(env).connect(master);
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
    note(2200 + Math.random() * 300, 0, 0.025, 0.05, 'square');
  },
  /** Fabric applied to a garment. */
  swish(): void {
    hush(0.32, 0.5, 3200, 900, 0.7);
  },
  /** The studio settles onto the floor. */
  settle(): void {
    note(110, 0, 0.5, 0.25);
    hush(0.4, 0.2, 400, 120, 1.2);
  },
  /** The stylist puts an idea on the form. */
  sparkle(): void {
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => note(f, i * 0.055, 0.35, 0.07));
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
  setMuted(value: boolean): void {
    muted = value;
  },
};
