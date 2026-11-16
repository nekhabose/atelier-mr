/**
 * The quality governor's rule, pure so it can be tested: given the measured
 * frame rate, step quality down when the headset falls behind its refresh
 * rate, and back up once it has been comfortably on time for a while.
 */

/** Step down below this share of the refresh rate (61 fps at 72 Hz). */
export const LOW_SHARE = 0.85;
/** Seconds behind before stepping down, and seconds on time before stepping up. */
export const DOWN_AFTER = 1.5;
export const UP_AFTER = 10;
export const MAX_TIER = 2;

export interface Governor {
  tier: number;
  /** Seconds spent behind / on time, so far. */
  lowT: number;
  highT: number;
  /** Best frame rate seen (the refresh rate when the device does not say). */
  peak: number;
}

export function newGovernor(): Governor {
  return { tier: 0, lowT: 0, highT: 0, peak: 0 };
}

/**
 * Feed one measurement window (`fps` over `window` seconds). Returns the tier
 * to use; `g` is updated in place.
 */
export function govern(g: Governor, fps: number, window: number, reportedRate?: number): number {
  g.peak = Math.max(g.peak, fps);
  const target = reportedRate ?? Math.max(60, g.peak);
  if (fps < target * LOW_SHARE) {
    g.lowT += window;
    g.highT = 0;
    if (g.lowT >= DOWN_AFTER && g.tier < MAX_TIER) {
      g.tier++;
      g.lowT = 0;
    }
  } else {
    g.lowT = 0;
    g.highT = fps >= target * 0.95 ? g.highT + window : 0;
    if (g.highT >= UP_AFTER && g.tier > 0) {
      g.tier--;
      g.highT = 0;
    }
  }
  return g.tier;
}

/** The lowest refresh rate the governor will ask for (Meta's own WebXR samples target 72 Hz). */
export const FLOOR_HZ = 72;

/**
 * Before cutting any detail, a headset running faster than 72 Hz is asked for
 * the next lower rate it supports (90 -> 72 gives 13.7 ms per frame instead of
 * 11.1). Returns that rate, or null when there is none.
 */
export function lowerRate(supported: ArrayLike<number> | undefined, now: number | undefined): number | null {
  if (!supported || !now) return null;
  let best: number | null = null;
  for (let i = 0; i < supported.length; i++) {
    const r = supported[i];
    if (r >= FLOOR_HZ && r < now - 0.5 && (best === null || r > best)) best = r;
  }
  return best;
}
