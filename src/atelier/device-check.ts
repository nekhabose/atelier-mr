/**
 * The device check's numbers, pure so they can be tested: frame-time summary
 * and the result lines shown on the card and the start page.
 */

export interface CheckResult {
  when: string;
  device: string;
  refreshHz: number | null;
  frames: number;
  avgFps: number;
  lowFps: number;
  worstMs: number;
  /** Share of frames slower than 60 fps (16.7 ms + 5%). */
  under60: number;
  drawCalls: number;
  triangles: number;
  tier: number;
  features: string[];
  planes: number;
  meshes: number;
  anchored: boolean;
  errors: number;
}

/** Summarise frame times (seconds). Pure: tested. */
export function summarise(times: ArrayLike<number>, n: number): Pick<CheckResult, 'frames' | 'avgFps' | 'lowFps' | 'worstMs' | 'under60'> {
  if (n === 0) return { frames: 0, avgFps: 0, lowFps: 0, worstMs: 0, under60: 0 };
  const sorted = Array.from({ length: n }, (_, i) => times[i]).sort((a, b) => a - b);
  let sum = 0;
  let slow = 0;
  for (const t of sorted) {
    sum += t;
    if (t > (1 / 60) * 1.05) slow++;
  }
  const p99 = sorted[Math.min(n - 1, Math.floor(n * 0.99))];
  return {
    frames: n,
    avgFps: Math.round(n / sum),
    lowFps: Math.round(1 / p99),
    worstMs: Math.round(sorted[n - 1] * 1000),
    under60: Math.round((slow / n) * 1000) / 10,
  };
}

/** The results as a few plain lines. */
export function resultLines(r: CheckResult): string[] {
  return [
    `${r.device}${r.refreshHz ? ` at ${r.refreshHz} Hz` : ''}`,
    `${r.avgFps} fps average, ${r.lowFps} fps 1% low, worst frame ${r.worstMs} ms`,
    `${r.under60}% of frames slower than 60 fps`,
    `${r.drawCalls} draw calls, ${Math.round(r.triangles / 1000)}k triangles, quality ${['full', 'reduced', 'light'][r.tier] ?? r.tier}`,
    `Granted: ${r.features.length ? r.features.join(', ') : 'none listed'}`,
    `Room: ${r.planes} planes, ${r.meshes} meshes, anchor ${r.anchored ? 'saved' : 'not yet'}; errors ${r.errors}`,
  ];
}

