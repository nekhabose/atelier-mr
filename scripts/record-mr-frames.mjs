// Story cut, step 1: captures frames from the managed emulator browser (dev
// server in agent mode, so the emulator's own controls are hidden) while the
// guided tour plays in the simulated room. The tour is readied in XR first
// (the empty room, studio held back), capture starts, then the tour starts,
// so the whole story fits the browser-script time limit.
//
// Writes docs/video/frames-mr/frames.txt ("<file> <timestamp>" per frame,
// appended as they arrive) and cues.json: `offset` (video seconds when the
// tour started) and the tour's sound cues, for the soundtrack and the mixer.
//
//   npx @iwsdk/cli dev restart --ai-mode agent --allow-browser-automation
//   npx @iwsdk/cli browser run scripts/record-mr-frames.mjs --timeout 110000
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(process.cwd(), 'docs/video/frames-mr');
const W = 1920;
const H = 1080;

export default async function run({ frame, page, cdp }) {
  const app = frame ?? page;
  mkdirSync(OUT, { recursive: true });
  const list = join(OUT, 'frames.txt');
  writeFileSync(list, '');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await page.waitForTimeout(400);
  // Enter XR and wait in the empty room.
  await app.evaluate(() => {
    const s = globalThis.showcase;
    s.record = true;
    s.start('mr', { waitForGo: true });
  });
  await app.waitForFunction(() => globalThis.showcase?.ready === true, null, { timeout: 20_000, polling: 50 });
  let n = 0;
  let firstTs = 0;
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const file = join(OUT, `f${String(n).padStart(5, '0')}.jpg`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    if (n === 0) firstTs = metadata.timestamp;
    appendFileSync(list, `${n ? '\n' : ''}${file} ${metadata.timestamp}`);
    n++;
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  while (n === 0) await page.waitForTimeout(20);
  // Start the story; note the wall-clock time (same clock as frame timestamps).
  const goAt = await app.evaluate(() => {
    globalThis.showcase.go();
    return (performance.timeOrigin + performance.now()) / 1000;
  });
  await app.waitForFunction(() => globalThis.showcaseDone === true, null, { timeout: 106_000, polling: 250 });
  await page.waitForTimeout(400);
  await cdp.send('Page.stopScreencast');
  const cues = await app.evaluate(() => globalThis.showcase.cues);
  writeFileSync(join(OUT, 'cues.json'), JSON.stringify({ offset: Math.max(0, goAt - firstTs), cues }, null, 1));
  await cdp.send('Emulation.clearDeviceMetricsOverride').catch(() => {});
  return { frames: n, offset: goAt - firstTs, cues: cues.length };
}
