// Soak test: 300 outfit changes, fabric swaps, tailoring steps, undos and
// turns in a row. Before each sample the browser collects garbage, then GPU
// memory (geometries, textures) and the JS heap are read. A leak shows up as
// steady growth; a healthy studio stays level.
//
// Usage (dev server with --allow-browser-automation; flat page is fine):
//   npx @iwsdk/cli browser run scripts/check-soak.mjs --timeout 100000
export default async function run({ frame, page, cdp }) {
  const target = frame ?? page;
  await target.evaluate(() => {
    globalThis.__soakErrors = [];
    const push = (e) => globalThis.__soakErrors.push(String(e.message ?? e.reason ?? e));
    addEventListener('error', push);
    addEventListener('unhandledrejection', push);
  });
  const samples = [];
  const sample = async (step) => {
    await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
    await page.waitForTimeout(200);
    samples.push(
      await target.evaluate((s) => {
        const r = globalThis.atelier.world.renderer;
        return {
          step: s,
          geometries: r.info.memory.geometries,
          textures: r.info.memory.textures,
          heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null,
        };
      }, step),
    );
  };
  await sample(0);
  for (let batch = 0; batch < 10; batch++) {
    await target.evaluate(async (b) => {
      const a = globalThis.atelier;
      const closet = globalThis.closet;
      const fabrics = ['navy-satin', 'ivory-silk', 'bordeaux-velvet', 'indigo-denim', 'olive-linen', 'mustard-plaid'];
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      for (let j = 0; j < 30; j++) {
        const i = b * 30 + j;
        const k = i % 6;
        if (k === 0) a.wearLook(i % 8);
        else if (k === 1) a.applyFabric(fabrics[i % fabrics.length]);
        else if (k === 2) a.nudge('hem', i % 2 ? 1 : -1);
        else if (k === 3) closet.setMode(i % 4 === 3);
        else if (k === 4) a.undo();
        else a.turnForm(1);
        if (i % 3 === 0) await wait(16);
      }
    }, batch);
    await sample((batch + 1) * 30);
  }
  const errors = await target.evaluate(() => globalThis.__soakErrors);
  const health = await target.evaluate(() => globalThis.atelierHealth);
  const first = samples[1];
  const last = samples[samples.length - 1];
  return {
    samples,
    growth: {
      geometries: last.geometries - first.geometries,
      textures: last.textures - first.textures,
      heapMB: last.heapMB !== null && first.heapMB !== null ? last.heapMB - first.heapMB : null,
    },
    errors,
    caught: health?.caught ?? 0,
  };
}
