// First five minutes and polish: the welcome card, cloth sway on a turn, the
// spatial sound bus, and (with ?first after clearing state) a dressed form and
// the 3-step tour.
//   npx @iwsdk/cli browser run scripts/check-polish.mjs --timeout 30000
export default async function run({ frame, page }) {
  const target = frame ?? page;
  return await target.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const a = globalThis.atelier;
    const welcome = document.getElementById('atelier-welcome');
    const firstVisit = { look: a.outfitTitle, pieces: a.currentPieces.length, tourActive: globalThis.tour.active, tourStep: globalThis.tour.step };
    if (!a.currentPieces.length) a.wearLook(1);
    await wait(700);
    a.turnForm(1);
    let maxSway = 0;
    for (let i = 0; i < 30; i++) {
      await wait(33);
      for (const g of a.pieceGroups) maxSway = Math.max(maxSway, Math.abs(g.rotation.y));
    }
    await wait(2000);
    const settled = Math.max(...a.pieceGroups.map((g) => Math.abs(g.rotation.y)));
    globalThis.sfx.swish();
    return {
      welcomeCard: !!welcome && welcome.style.display !== 'none',
      welcomeButton: welcome?.querySelector('[data-enter]')?.textContent?.trim(),
      firstVisit,
      swayDuringTurnRad: Math.round(maxSway * 1000) / 1000,
      swayAfterSettleRad: Math.round(settled * 10000) / 10000,
      spatialAudio: globalThis.sfx.spatialReady,
    };
  });
}
