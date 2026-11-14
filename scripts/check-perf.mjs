// Shadows on demand: how often the shadow map is redrawn while the studio is
// still, while the form turns, and with three.js's default (every frame) for
// comparison; plus draw calls, triangles and the XR foveation level.
//
// Usage (dev server with --allow-browser-automation, XR session entered):
//   npx @iwsdk/cli browser run scripts/check-perf.mjs --timeout 60000
export default async function run({ frame, page }) {
  const target = frame ?? page;
  return await target.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const perf = globalThis.perf;
    const snap = () => ({ ...globalThis.perfStats });
    perf.shadowsOnDemand = true;
    await wait(1600);
    const idle = snap();
    globalThis.atelier.turnForm(1);
    await wait(550);
    const turning = snap();
    await wait(1600);
    perf.shadowsOnDemand = false;
    await wait(1600);
    const everyFrame = snap();
    perf.shadowsOnDemand = true;
    return { idle, turning, everyFrame };
  });
}
