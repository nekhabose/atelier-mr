export default async function run({ frame, page }) {
  const t = frame ?? page;
  await t.evaluate(() => { localStorage.clear(); });
  return { cleared: true };
}
