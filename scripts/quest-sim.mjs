// Quest-like stress test in the managed emulator browser.
//
// A Quest 3/3S CPU is several times slower than a modern laptop's. This slows
// the page's CPU with Chrome's throttling (default 4x), then measures frame
// times while idle, while a tailoring pin is "dragged" (light rebuilds at
// ~20 Hz, as in the app), and around the heaviest one-off actions (stylist
// plan, boutique try-on, full outfit rebuild). It cannot slow the GPU, so
// treat it as an early warning, not a Quest measurement.
//
// Usage (dev server with --allow-browser-automation, XR session entered):
//   npx @iwsdk/cli browser run scripts/quest-sim.mjs --timeout 100000
export default async function run({ frame, page, cdp }) {
  const target = frame ?? page;
  const RATE = 4;
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: RATE });
  try {
    return await target.evaluate(async () => {
      const a = globalThis.atelier;
      const sample = (ms, during) =>
        new Promise((resolve) => {
          const ts = [];
          const t0 = performance.now();
          let n = 0;
          const tick = (t) => {
            ts.push(t);
            if (during) during(n++);
            if (t - t0 < ms) requestAnimationFrame(tick);
            else resolve(ts);
          };
          requestAnimationFrame(tick);
        });
      const stats = (ts) => {
        const d = ts.slice(1).map((t, i) => t - ts[i]).sort((p, q) => p - q);
        const pick = (q) => Math.round(d[Math.min(d.length - 1, Math.floor(d.length * q))] * 10) / 10;
        const over = d.filter((x) => x > 1000 / 60 + 2).length;
        return { frames: d.length, medianMs: pick(0.5), p95Ms: pick(0.95), maxMs: pick(1), framesOver60fpsBudget: over };
      };
      const time = (fn) => {
        const t = performance.now();
        fn();
        return Math.round((performance.now() - t) * 10) / 10;
      };
      const idle = stats(await sample(3000));
      // Drag: light rebuild every 3rd frame (~20 Hz), as the app does.
      const drag = { segments: 30, ringDensity: 34 };
      const piece = a.currentPieces[0];
      const startHem = piece?.hem;
      const dragging = stats(
        await sample(3000, (n) => {
          if (!piece || n % 3) return;
          piece.hem = startHem + Math.sin(n / 10) * 0.05;
          a.rebuildPiece(0, drag);
        }),
      );
      if (piece) {
        piece.hem = startHem;
        a.rebuildPiece(0);
      }
      const heroRebuildMs = piece ? time(() => a.rebuildPiece(0)) : null;
      const fullOutfitMs = time(() => a.refreshAll());
      const s = globalThis.stylist;
      s.open();
      const t0 = performance.now();
      const plan = s.styleMe();
      const stylistFirstPreviewMs = Math.round((performance.now() - t0) * 10) / 10;
      await plan;
      s.revert();
      const b = globalThis.boutique;
      b.open(1);
      const tryOnMs = time(() => b.tryOn(1));
      b.close(true);
      return {
        cpuSlowdown: '4x',
        idle,
        dragging,
        oneOffMs: { heroRebuild: heroRebuildMs, fullOutfit: fullOutfitMs, stylistFirstPreview: stylistFirstPreviewMs, boutiqueTryOn: tryOnMs },
      };
    });
  } finally {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  }
}
