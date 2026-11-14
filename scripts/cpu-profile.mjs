// Where does the CPU time go? Records a 3 s CPU profile (optionally with the
// CPU slowed 4x) and groups self time by source: Atelier's own code, the
// IWSDK / three.js / UIKit runtime, and the XR emulator (IWER, its simulated
// room and dev UI) which does not exist on a real headset.
//
// Usage (dev server with --allow-browser-automation, XR session entered):
//   npx @iwsdk/cli browser run scripts/cpu-profile.mjs --timeout 60000
export default async function run({ cdp }) {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  await new Promise((r) => setTimeout(r, 3000));
  const { profile } = await cdp.send('Profiler.stop');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const counts = new Map();
  for (const id of profile.samples) counts.set(id, (counts.get(id) ?? 0) + 1);
  const total = profile.samples.length;
  const groups = {};
  const topApp = {};
  const bucket = (url, name) => {
    if (!url) return name === '(idle)' ? 'idle' : name === '(program)' || name === '(garbage collector)' ? 'browser/GC' : 'native';
    if (/\/src\//.test(url) && !/node_modules/.test(url)) return 'atelier app code';
    if (/iwer|devui|emulat|sem|room/i.test(url)) return 'xr emulator (not on Quest)';
    if (/three|uikit|iwsdk|elics|pmndrs/i.test(url)) return 'iwsdk / three / uikit runtime';
    return 'other js';
  };
  for (const [id, c] of counts) {
    const n = byId.get(id);
    const url = n.callFrame.url;
    const g = bucket(url, n.callFrame.functionName);
    groups[g] = (groups[g] ?? 0) + c;
    if (g === 'atelier app code') {
      const key = `${n.callFrame.functionName || '(anon)'} @ ${url.split('/src/')[1]}:${n.callFrame.lineNumber + 1}`;
      topApp[key] = (topApp[key] ?? 0) + c;
    }
  }
  const pct = (c) => `${Math.round((c / total) * 1000) / 10}%`;
  return {
    cpuSlowdown: '4x',
    shareOfCpuTime: Object.fromEntries(Object.entries(groups).sort((x, y) => y[1] - x[1]).map(([k, v]) => [k, pct(v)])),
    topAppFunctions: Object.entries(topApp).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, v]) => `${pct(v)}  ${k}`),
  };
}
