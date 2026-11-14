// Share links and voice phrases: round trip, a malformed link, a hostile link
// (clamped and sanitised), and command matching. Flat page or XR.
//   npx @iwsdk/cli browser run scripts/check-share.mjs --timeout 60000
export default async function run({ frame, page }) {
  const target = frame ?? page;
  return await target.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const a = globalThis.atelier, acc = globalThis.access;
    a.wearLook(3);
    a.nudge('hem', 1);
    const sharedHem = a.currentPieces[0].hem;
    const url = acc.share();
    a.wearLook(0);
    location.hash = url.split('#')[1];
    await wait(400);
    const received = { title: a.outfitTitle, hem: a.currentPieces[0].hem, sharedHem, hashCleared: location.hash === '' };
    const before = a.outfitTitle;
    location.hash = '#look=AAAA_not-json';
    await wait(400);
    const garbageIgnored = a.outfitTitle === before;
    location.hash = '#look=' + btoa(JSON.stringify({ v: 1, n: '<script>x', p: [[0, 'navy-satin', 99, -5, 0.2, 7, 0.1, 0]] })).replace(/=+$/, '');
    await wait(400);
    const clamped = { title: a.outfitTitle, hem: a.currentPieces[0].hem, fit: a.currentPieces[0].fit };
    const voice = ['please undo', 'make it shorter', 'look two', 'blah blah'].map((p) => [p, acc.voice.handle(p)]);
    const qr = document.querySelector('#studio-options svg') ? 'qr shown' : 'no qr';
    return { urlLength: url.length, received, garbageIgnored, clamped, voice, qr };
  });
}
