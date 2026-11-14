// Mixed-reality cut, step 1: captures frames from the managed emulator
// browser (dev server in agent mode, so the emulator's own controls are
// hidden) while ?showcase=mr-record plays in the simulated room.
// Step 2 (ffmpeg) is scripts/make-video.sh.
//
//   npx @iwsdk/cli dev restart --ai-mode agent --allow-browser-automation
//   npx @iwsdk/cli browser run scripts/record-mr-frames.mjs --timeout 110000
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'docs/video/frames-mr');
const W = 1920;
const H = 1080;

export default async function run({ frame, page, cdp }) {
  const app = frame ?? page;
  mkdirSync(OUT, { recursive: true });
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await page.waitForTimeout(1500);
  // Start the mixed-reality cut inside the app frame (no exit button).
  await app.evaluate(() => {
    const s = globalThis.showcase;
    s.record = true;
    s.start('mr');
  });
  await app.waitForFunction(() => globalThis.showcase?.playing === true, null, { timeout: 30_000, polling: 50 });
  const shots = [];
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const file = join(OUT, `f${String(shots.length).padStart(5, '0')}.jpg`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    shots.push(`${file} ${metadata.timestamp}`);
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  await app.waitForFunction(() => globalThis.showcaseDone === true, null, { timeout: 75_000, polling: 250 });
  await page.waitForTimeout(600);
  await cdp.send('Page.stopScreencast');
  writeFileSync(join(OUT, 'frames.txt'), shots.join('\n'));
  await cdp.send('Emulation.clearDeviceMetricsOverride').catch(() => {});
  return { frames: shots.length, dir: OUT };
}
