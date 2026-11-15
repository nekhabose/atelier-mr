/**
 * Frame cost of every rail look in XR: draw calls and triangles per stereo
 * frame and the emulator's frame rate, from the ?perf meter's numbers.
 *
 *   npx @iwsdk/cli browser run scripts/check-frame-cost.mjs --timeout 90000
 */
export default async function run({ frame, page }) {
  const t = frame ?? page;
  return t.evaluate(async () => {
    const a = globalThis.atelier;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const out = [];
    // Full quality, held there for the measurement (the governor would step
    // down on a slow desktop; on the headset that is its job).
    const perf = globalThis.perf;
    const govern = perf.govern;
    perf.govern = () => {};
    perf.setTier(0);
    await wait(1500);
    for (let i = 0; i < 8; i++) {
      a.wearLook(i);
      // Steady state: after the dress-up animation and rebuild, the median
      // of three samples half a second apart.
      await wait(3500);
      const f = [];
      for (let k = 0; k < 3; k++) {
        await wait(500);
        f.push(globalThis.perfStats.fps);
      }
      f.sort((x, y) => x - y);
      const s = globalThis.perfStats;
      out.push({ look: a.outfitTitle, fps: Math.round(f[1]), drawCalls: s.drawCalls, triangles: s.triangles, tier: s.tier });
    }
    perf.govern = govern;
    return { looks: out, maxDraw: Math.max(...out.map((o) => o.drawCalls)), maxTris: Math.max(...out.map((o) => o.triangles)), minFps: Math.min(...out.map((o) => o.fps)) };
  });
}
