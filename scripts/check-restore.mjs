// After a reload, the last look is back on the form with its name and the
// "welcome back" note (run once after wearing a look, then after a reload).
//   npx @iwsdk/cli browser run scripts/check-restore.mjs --timeout 20000
export default async function run({ frame, page }) {
  const target = frame ?? page;
  return await target.evaluate(() => {
    const a = globalThis.atelier;
    return { title: a.outfitTitle, pieces: a.currentPieces.length, saved: !!localStorage.getItem('atelier.state.v1') };
  });
}
