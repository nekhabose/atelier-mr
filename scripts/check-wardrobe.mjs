// Photo to closet and tailoring in plain words. Without a server key the
// photo is read on the device (colour only) and clear instructions are parsed
// on the device; with the key, the live AI answers.
//   npx @iwsdk/cli browser run scripts/check-wardrobe.mjs --timeout 60000
export default async function run({ frame, page }) {
  const target = frame ?? page;
  return await target.evaluate(async () => {
    const w = globalThis.wardrobe;
    const a = globalThis.atelier;
    const closet = globalThis.closet;
    // A "photo": a red garment shape on a light background.
    const c = document.createElement('canvas');
    c.width = 400;
    c.height = 500;
    const g = c.getContext('2d');
    g.fillStyle = '#eeeeee';
    g.fillRect(0, 0, 400, 500);
    g.fillStyle = '#a8262f';
    g.beginPath();
    g.moveTo(120, 60); g.lineTo(280, 60); g.lineTo(360, 140); g.lineTo(320, 180); g.lineTo(290, 150);
    g.lineTo(290, 440); g.lineTo(110, 440); g.lineTo(110, 150); g.lineTo(80, 180); g.lineTo(40, 140);
    g.closePath();
    g.fill();
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9));
    const before = closet.items.length;
    const added = await w.addFromPhoto(blob);
    const photo = { added, source: w.lastPhoto?.source, reply: w.lastPhoto?.reply, onForm: a.outfitTitle, closetGrew: closet.items.length - before };
    // Keep the test closet stable across runs.
    if (added) {
      closet.items.splice(closet.items.length - 1, 1);
      localStorage.setItem('atelier.closet.v1', JSON.stringify(closet.items));
      closet.setMode(true);
    }

    a.wearLook(1);
    const hemBefore = a.currentPieces[0].hem;
    const matched = globalThis.access.voice.handle('make it midi with long sleeves');
    await new Promise((r) => setTimeout(r, 300));
    const voiceTailor = { commandMatched: matched, result: w.lastTailor, hemBefore, hemAfter: a.currentPieces[0].hem, sleeve: a.currentPieces[0].sleeve };
    a.undo();
    const typed = await w.tailor('red satin');
    return { photo, voiceTailor, typed, fabricAfterTyped: a.currentPieces[0].fabric };
  });
}
