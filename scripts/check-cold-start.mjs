// Cold start the way a Quest would see it, without a Quest (an early warning,
// not a headset measurement). Opens the production build in Chromium that:
//   - identifies as Quest 3 Browser (user agent),
//   - has no Web Speech API (Meta does not document Quest Browser support),
//   - runs its CPU 4x slower (a Quest's mobile chip against this laptop),
//   - downloads at 25 Mbit/s with 40 ms latency (a modest home Wi-Fi), cache empty,
// and measures what is downloaded before the studio is ready, the time to the
// first studio frame, how long the main thread is blocked, how quickly a tap
// on a look is answered, and any errors. Then a warm second visit.
// It cannot slow the GPU or show the headset's display.
//
//   npm run build && npx vite preview --port 4173 --strictPort &
//   node scripts/check-cold-start.mjs [https://localhost:4173/]
// --profile also records where the CPU time goes until the studio is ready
// (point it at the dev server, https://localhost:8090/, for readable names).
import { chromium } from 'playwright';

const url = process.argv.slice(2).find((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--shot') ?? 'https://localhost:4173/';
const PROFILE = process.argv.includes('--profile');
// --shot <file.png>: a screenshot two seconds into the cold start (the loading screen).
const shotAt = process.argv.indexOf('--shot');
const SHOT = shotAt > 0 ? process.argv[shotAt + 1] : null;
const QUEST_UA =
  'Mozilla/5.0 (X11; Linux x86_64; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/37.0.0.4.67 SamsungBrowser/4.0 Chrome/132.0.6834.163 VR Safari/537.36';
const CPU = 4;

const browser = await chromium.launch({
  headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=metal'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, userAgent: QUEST_UA, ignoreHTTPSErrors: true });
await context.addInitScript(() => {
  for (const k of ['speechSynthesis', 'SpeechSynthesisUtterance', 'SpeechRecognition', 'webkitSpeechRecognition']) {
    try {
      Object.defineProperty(window, k, { value: undefined, configurable: true });
    } catch {}
  }
  const w = window;
  w.__long = [];
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__long.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: true });
  } catch {}
});

async function visit(label, cold) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: 25e6 / 8, uploadThroughput: 10e6 / 8 });
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: cold });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
  let bytes = 0;
  let requests = 0;
  cdp.on('Network.loadingFinished', (e) => {
    bytes += e.encodedDataLength;
    requests++;
  });
  if (PROFILE && cold) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
    await cdp.send('Profiler.start');
  }
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'commit' });
  if (SHOT && cold) {
    await page.waitForTimeout(2000);
    await page.screenshot({ path: SHOT });
  }
  // The studio is ready when the form and rail are being drawn.
  await page.waitForFunction(() => (globalThis.perfStats?.drawCalls ?? 0) > 40, null, { timeout: 120_000, polling: 100 });
  const firstFrameS = (Date.now() - t0) / 1000;
  let profile;
  if (PROFILE && cold) profile = summarise((await cdp.send('Profiler.stop')).profile);
  const atReady = { bytes, requests };
  // A tap on a look: how long until the next frame shows it.
  const tapMs = await page.evaluate(async () => {
    const t = performance.now();
    globalThis.atelier.wearLook(1);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return Math.round(performance.now() - t);
  });
  await page.waitForTimeout(3000);
  const after = await page.evaluate(() => ({
    firstPaintS: Math.round((performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0) / 100) / 10,
    loadingScreenGone: !document.getElementById('boot'),
    longTasks: globalThis.__long.length,
    longestTaskMs: Math.max(0, ...globalThis.__long),
    blockedMs: globalThis.__long.reduce((s, d) => s + d, 0),
    speechApis: !!globalThis.speechSynthesis || !!globalThis.webkitSpeechRecognition,
    look: globalThis.atelier.outfitTitle,
    userAgentSaysQuest: /Quest 3/.test(navigator.userAgent),
  }));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.close();
  return {
    visit: label,
    firstStudioFrameS: Math.round(firstFrameS * 10) / 10,
    downloadedMB: Math.round((atReady.bytes / 1e6) * 100) / 100,
    requests: atReady.requests,
    tapToFrameMs: tapMs,
    ...after,
    errors,
    ...(profile ? { profile } : {}),
  };
}

/** Self and inclusive time (ms) by function, heaviest first. */
function summarise(profile) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const dt = profile.timeDeltas;
  profile.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (dt[i + 1] ?? 0) / 1000));
  const name = (n) => `${n.callFrame.functionName || '(anon)'} ${(n.callFrame.url.split('/').slice(-2).join('/') || '').split('?')[0]}:${n.callFrame.lineNumber + 1}`;
  const incl = new Map();
  const total = (n, stack) => {
    let t = self.get(n.id) ?? 0;
    for (const c of n.children ?? []) t += total(byId.get(c), stack);
    const k = name(n);
    // Count a function once per stack (recursion).
    if (!stack.has(k)) incl.set(k, (incl.get(k) ?? 0) + t);
    return t;
  };
  const roots = profile.nodes.filter((n) => !profile.nodes.some((p) => p.children?.includes(n.id)));
  roots.forEach((r) => total(r, new Set()));
  const selfBy = new Map();
  for (const [id, t] of self) {
    const k = name(byId.get(id));
    selfBy.set(k, (selfBy.get(k) ?? 0) + t);
  }
  const top = (m, re, n) => [...m].filter(([k]) => re.test(k)).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, t]) => `${Math.round(t)} ms  ${k}`);
  return { selfTop: top(selfBy, /./, 15), appInclusiveTop: top(incl, /src\//, 25) };
}

const results = [await visit('first (cold cache)', true), await visit('second (warm)', false)];
await browser.close();
console.log(JSON.stringify({ cpuSlowdown: `${CPU}x`, network: '25 Mbit/s, 40 ms', userAgent: 'Quest 3 Browser', results }, null, 1));
