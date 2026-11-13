// Pause / resume check in the IWSDK emulator: simulates the Quest system
// menu (session "visible-blurred"), then resuming, and verifies the studio
// keeps its outfit, keeps rendering and mutes sound while paused.
//
// Usage (dev server with --allow-browser-automation, XR session entered):
//   npx @iwsdk/cli browser run scripts/check-pause-resume.mjs
export default async function run({ frame, page }) {
  const target = frame ?? page;
  return target.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    // Find the emulated XR device (IWER) among globals.
    let device = null;
    for (const key of Object.getOwnPropertyNames(globalThis)) {
      try {
        const v = globalThis[key];
        if (v && typeof v === 'object' && typeof v.updateVisibilityState === 'function') {
          device = v;
          break;
        }
      } catch {
        /* inaccessible global */
      }
    }
    if (!device) return { error: 'no emulated device found' };
    const atelier = globalThis.atelier;
    const frames = () => new Promise((r) => {
      let n = 0;
      const t0 = performance.now();
      const tick = () => {
        n++;
        if (performance.now() - t0 < 500) requestAnimationFrame(tick);
        else r(n);
      };
      requestAnimationFrame(tick);
    });
    const before = { outfit: atelier.outfitTitle, pieces: atelier.currentPieces.length };
    device.updateVisibilityState('visible-blurred');
    await wait(800);
    const paused = {
      outfit: atelier.outfitTitle,
      soundPaused: globalThis.sfx?.paused === true,
      framesIn500ms: await frames(),
    };
    device.updateVisibilityState('visible');
    await wait(800);
    const resumed = {
      outfit: atelier.outfitTitle,
      pieces: atelier.currentPieces.length,
      soundPaused: globalThis.sfx?.paused === true,
      framesIn500ms: await frames(),
    };
    return { before, paused, resumed };
  });
}
