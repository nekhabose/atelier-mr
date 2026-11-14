// Records the guided showcase (?showcase=record) to an MP4 for the demo video.
//
// Frames come from Chrome's screencast (so the captions are included), then
// ffmpeg turns them into a 30 fps H.264 file. No audio: add music or a
// voice-over in an editor.
//
// Usage (flat cut, from a production build):
//   npm run build && npx vite preview --port 4173 &
//   node scripts/record-showcase.mjs https://localhost:4173/ docs/video/atelier-showcase.mp4
// Mixed-reality cut (the emulator's simulated room; needs the dev server in
// agent mode so the emulator's control panels are hidden):
//   npx @iwsdk/cli dev restart --ai-mode agent
//   node scripts/record-showcase.mjs https://localhost:8090/ docs/video/atelier-mr.mp4 --mr
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const mr = process.argv.includes('--mr');
const base = args[0] ?? 'https://localhost:4173/';
const out = resolve(args[1] ?? (mr ? 'docs/video/atelier-mr.mp4' : 'docs/video/atelier-showcase.mp4'));
const W = 1920;
const H = 1080;
const frames = mkdtempSync(join(tmpdir(), 'atelier-showcase-'));

const browser = await chromium.launch({
  headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'],
});
const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, ignoreHTTPSErrors: true });
const page = await context.newPage();
// A clean first visit: no saved look or settings.
await page.addInitScript(() => {
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});
const url = new URL(base);
url.searchParams.set('showcase', mr ? 'mr-record' : 'record');
await page.goto(url.toString(), { waitUntil: 'load' });
// Start capturing when the tour starts (skips the loading screen).
await page.waitForFunction(() => globalThis.showcase?.playing === true, null, { timeout: 90_000, polling: 50 });

const cdp = await context.newCDPSession(page);
const shots = [];
cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  const file = join(frames, `f${String(shots.length).padStart(5, '0')}.jpg`);
  writeFileSync(file, Buffer.from(data, 'base64'));
  shots.push({ file, t: metadata.timestamp });
  await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });

const started = Date.now();
await page.waitForFunction(() => globalThis.showcaseDone === true, null, { timeout: 120_000, polling: 250 });
await page.waitForTimeout(800);
await cdp.send('Page.stopScreencast');
await browser.close();
console.log(`captured ${shots.length} frames in ${Math.round((Date.now() - started) / 1000)} s`);

// Concat list with each frame's real duration, then resample to 30 fps.
const lines = [];
for (let i = 0; i < shots.length; i++) {
  const next = shots[i + 1]?.t ?? shots[i].t + 1 / 30;
  lines.push(`file '${shots[i].file}'`, `duration ${Math.max(0.001, next - shots[i].t).toFixed(4)}`);
}
lines.push(`file '${shots[shots.length - 1].file}'`);
const list = join(frames, 'list.txt');
writeFileSync(list, lines.join('\n'));
mkdirSync(dirname(out), { recursive: true });
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
  '-vf', `fps=30,scale=${W}:${H}:flags=lanczos,format=yuv420p`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-movflags', '+faststart', out,
]);
console.log(`wrote ${out}`);
