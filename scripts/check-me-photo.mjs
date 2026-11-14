// Checks "Make the form you" refuses anything but a full-length photo:
// uploads a synthetic head-and-shoulders portrait (no real person) through the
// real file input and confirms it is refused with a reason, nothing is stored
// and the form stays the form. (A real full-length photo is needed to see the
// accepted path; MediaPipe does not count drawings or mannequins as people.)
//
// Usage (dev server started with --allow-browser-automation):
//   npx @iwsdk/cli browser run scripts/check-me-photo.mjs --timeout 60000
export default async function run({ frame, page }) {
  const target = frame ?? page;
  await target.waitForFunction(() => !!globalThis.me, null, { timeout: 30000 });
  // Draw a simple cartoon portrait in the page and export it as a JPEG.
  const dataUrl = await target.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 600;
    c.height = 800;
    const x = c.getContext('2d');
    x.fillStyle = '#9fb3c8';
    x.fillRect(0, 0, 600, 800);
    x.fillStyle = '#3b2a20';
    x.beginPath();
    x.ellipse(300, 300, 200, 230, 0, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#e0b08f';
    x.beginPath();
    x.ellipse(300, 340, 160, 200, 0, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#2b2118';
    for (const ex of [240, 360]) {
      x.beginPath();
      x.arc(ex, 310, 14, 0, Math.PI * 2);
      x.fill();
    }
    x.strokeStyle = '#a0463c';
    x.lineWidth = 8;
    x.beginPath();
    x.arc(300, 400, 60, 0.2 * Math.PI, 0.8 * Math.PI);
    x.stroke();
    return c.toDataURL('image/jpeg', 0.9);
  });
  const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
  await target.locator('#make-it-you input[type=file]').setInputFiles({
    name: 'portrait.jpg',
    mimeType: 'image/jpeg',
    buffer,
  });
  await target.waitForFunction(
    () => /Photo not used/.test(document.querySelector('#make-it-you [data-status]')?.textContent ?? ''),
    null,
    { timeout: 45000 },
  );
  return target.evaluate(() => ({
    refused: globalThis.me.hasFace === false,
    problem: globalThis.me.lastCheck?.problem,
    storedBytes: (localStorage.getItem('atelier.me.v2') || '').length,
    status: document.querySelector('#make-it-you [data-status]')?.textContent,
  }));
}
