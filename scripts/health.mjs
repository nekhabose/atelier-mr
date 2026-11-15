export default async function run({ frame, page }) {
  const t = frame ?? page;
  return t.evaluate(() => ({ caught: globalThis.atelierHealth.caught, log: globalThis.atelierHealth.log.map((e) => `${e.where}: ${e.message}`), fps: globalThis.perfStats.fps, outfit: globalThis.atelier.outfitTitle }));
}
