// Installable and offline: Chrome's installability verdict for the manifest,
// then a second visit with the network switched off must still boot the studio.
// Service workers need a trusted origin: serve dist over http on localhost.
//   npm run build && (cd dist && python3 -m http.server 4174 &)
//   node scripts/check-pwa.mjs http://localhost:4174/
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:4174/';
const browser = await chromium.launch({ headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=metal'] });
const context = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await page.goto(url, { waitUntil: 'load' });
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload({ waitUntil: 'load' }); // now controlled: assets go through the cache
await page.waitForFunction(() => !!globalThis.atelier, null, { timeout: 30_000 });
const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
const manifest = await cdp.send('Page.getAppManifest');
const installability = await cdp.send('Page.getInstallabilityErrors');
await page.waitForTimeout(1500);

await context.setOffline(true);
await page.reload({ waitUntil: 'load' });
let offlineBoot = false;
try {
  await page.waitForFunction(() => !!globalThis.atelier && !!globalThis.stylist, null, { timeout: 30_000 });
  offlineBoot = true;
} catch {
  /* stays false */
}
const offlineLook = offlineBoot ? await page.evaluate(() => globalThis.atelier.outfitTitle) : null;
await browser.close();
console.log(JSON.stringify({
  controlled,
  manifestUrl: manifest.url,
  manifestErrors: manifest.errors,
  installabilityErrors: installability.installabilityErrors,
  offlineBoot,
  offlineLook,
}, null, 1));
