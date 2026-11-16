// In the headset, Quest-class: the emulated Quest 3 session (90 Hz, offering
// 72/80/90/120) with the page's CPU slowed 4x. An early warning, not a
// headset measurement: the GPU is not slowed, and the headless test browser
// draws at most about 60 frames a second.
//   1. Headroom: full quality held (governor off), CPU 4x slower, while the
//      studio is used hard (the stylist agent on the device, "dressier", a
//      boutique try-on, fabric swaps, rail looks): frame rate and action times.
//   2. Governor order: a fresh session with the governor on. With the
//      browser's ~60 fps cap it is always "behind" 72 Hz, which shows the
//      order of its steps: in the first 6 s only detail (it comes back),
//      after that lower refresh rates first (never below 72 Hz), then detail.
//
// Usage (dev server with --allow-browser-automation, XR session entered):
//   npx @iwsdk/cli xr enter
//   npx @iwsdk/cli browser run scripts/check-quest-class-xr.mjs --timeout 100000
export default async function run({ frame, page, cdp }) {
  const target = frame ?? page;
  const slow = (rate) => cdp.send('Emulation.setCPUThrottlingRate', { rate });
  const sample = (ms) => target.evaluate(async (ms) => {
    const g = globalThis;
    const out = [];
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      await new Promise((r) => setTimeout(r, 500));
      const s = g.perfStats;
      out.push({ t: Math.round((performance.now() - t0) / 100) / 10, fps: s.fps, hz: s.refreshHz, tier: s.tier, frameMs: s.frameMs });
    }
    return out;
  }, ms);
  const act = (step) => target.evaluate(async (step) => {
    const g = globalThis;
    const t = performance.now();
    if (step === 'ask') await g.agent.run('today', { live: false, fast: true, request: 'dinner on Friday, something black' });
    if (step === 'dressier') g.agent.refine('dressier');
    if (step === 'keep') g.agent.keep();
    if (step === 'boutique') {
      g.closet.openBoutique();
      g.boutique.open(0);
      g.boutique.tryOn(2);
    }
    if (step === 'close') g.boutique.close(true);
    if (step === 'fabric') g.atelier.applyFabric('navy-satin');
    if (step === 'look') g.atelier.wearLook(5);
    return Math.round(performance.now() - t);
  }, step);

  const med = (xs) => xs.slice().sort((p, q) => p - q)[Math.floor(xs.length / 2)];
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  // 1. Headroom at full quality.
  const session = await target.evaluate(() => {
    const s = globalThis.atelier.world.renderer.xr.getSession();
    globalThis.perf.governor = false;
    globalThis.perf.setTier(0);
    return { frameRate: s?.frameRate, offered: s?.supportedFrameRates ? [...s.supportedFrameRates] : null };
  });
  const before = await sample(3000);
  await slow(4);
  const actionsMs = {};
  const perAction = {};
  try {
    for (const step of ['ask', 'dressier', 'keep', 'boutique', 'close', 'fabric', 'look']) {
      actionsMs[step] = await act(step);
      const ss = await sample(2500);
      perAction[step] = { medianFps: med(ss.map((x) => x.fps)), worstFrameMs: Math.max(...ss.map((x) => x.frameMs)) };
    }
  } finally {
    await slow(1);
  }
  // 1b. The same at the lightest tier (what the governor falls back to).
  await target.evaluate(() => globalThis.perf.setTier(2));
  await slow(4);
  const light = {};
  try {
    for (const step of ['ask', 'dressier', 'keep', 'boutique', 'close', 'fabric', 'look']) {
      await act(step);
      const ss = await sample(2000);
      light[step] = med(ss.map((x) => x.fps));
    }
  } finally {
    await slow(1);
  }
  // 2. A fresh session, governor on: the order of its steps.
  await target.evaluate(async () => {
    const w = globalThis.atelier.world;
    await w.renderer.xr.getSession()?.end();
    await new Promise((r) => setTimeout(r, 800));
    globalThis.perf.governor = true;
    await w.launchXR();
    const t0 = performance.now();
    while (!w.renderer.xr.isPresenting && performance.now() - t0 < 8000) await new Promise((r) => setTimeout(r, 100));
  });
  const fresh = await sample(13000);
  const decisions = [];
  let last = fresh[0];
  decisions.push(`start: ${last.hz} Hz, tier ${last.tier}`);
  for (const x of fresh) {
    if (x.hz !== last.hz || x.tier !== last.tier) decisions.push(`at ${x.t} s: ${last.hz} Hz tier ${last.tier} -> ${x.hz} Hz tier ${x.tier} (${x.fps} fps)`);
    last = x;
  }
  return {
    session,
    headroom: { cpuSlowdown: '4x', quality: 'full (tier 0, governor held)', fpsBeforeSlowdown: med(before.map((x) => x.fps)), actionsMs, perAction },
    lightestTierMedianFps: light,
    governorOrder: decisions,
    errors,
  };
}
