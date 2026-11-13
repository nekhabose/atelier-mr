// Checks "Make the form you": uploads a synthetic portrait (no real person)
// through the real file input and confirms the face lands on the form and is
// stored on the device only.
//
// Usage (dev server started with --allow-browser-automation):
//   npx @iwsdk/cli browser run scripts/check-face-upload.mjs
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
  await target.waitForFunction(() => globalThis.me.hasFace === true, null, { timeout: 10000 });
  return target.evaluate(() => ({
    hasFace: globalThis.me.hasFace,
    storedBytes: (localStorage.getItem('atelier.face.v1') || '').length,
    status: document.querySelector('#make-it-you [data-status]')?.textContent,
    removeVisible: getComputedStyle(document.querySelector('#make-it-you [data-remove]')).display !== 'none',
  }));
}
