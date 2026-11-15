// Plays the guided showcase on the flat page and samples what is on the form
// at each beat, so a broken step shows up without watching the tour.
//
// Usage (dev server with --allow-browser-automation, NOT in an XR session):
//   npx @iwsdk/cli browser run scripts/check-showcase.mjs --timeout 130000
export default async function run({ frame, page }) {
  const target = frame ?? page;
  return await target.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const s = globalThis.showcase;
    const a = globalThis.atelier;
    const errors = [];
    const onErr = (e) => errors.push(String(e.message ?? e.reason ?? e));
    addEventListener('error', onErr);
    addEventListener('unhandledrejection', onErr);
    s.start();
    const beats = [];
    const sample = (label) =>
      beats.push({
        label,
        t: Math.round(s.t * 10) / 10,
        look: a.outfitTitle,
        hem: Math.round((a.currentPieces[0]?.hem ?? 0) * 1000) / 1000,
        fabric: a.currentPieces.map((p) => p.fabric).join(','),
        cam: globalThis.atelier.world.camera.position.toArray().map((v) => Math.round(v * 100) / 100),
        caption: document.querySelector('.atelier-sc [data-title]')?.textContent,
      });
    // Just before each scene changes (times follow src/atelier/tour-timing.ts).
    for (const [at, label] of [
      [5, 'opening'], [23, 'dressed for today'], [31.3, 'refined'], [35.2, 'dress from the rail'],
      [43.4, 'marked on yourself'], [48.5, 'pin pulled'], [55.2, 'fabrics'], [62, 'laid out tomorrow'],
      [69.1, 'styled around least worn'], [78, 'boutique try-on'], [91.9, 'access panel'], [100, 'end card'],
    ]) {
      while (s.t < at && s.playing) await wait(100);
      sample(label);
    }
    while (s.playing) await wait(200);
    removeEventListener('error', onErr);
    removeEventListener('unhandledrejection', onErr);
    return { beats, done: globalThis.showcaseDone === true, errors };
  });
}
