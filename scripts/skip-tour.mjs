export default async function run({ frame, page }) {
  const t = frame ?? page;
  await t.waitForFunction(() => !!globalThis.atelier && !!globalThis.me, null, { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));
  return t.evaluate(() => { const tour = globalThis.tour ?? globalThis.onboarding; tour?.finish?.(true); return { tour: !!tour, outfit: globalThis.atelier.outfitTitle }; });
}
