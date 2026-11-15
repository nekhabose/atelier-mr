/**
 * Asking the stylist in your own words (typed and spoken), and the lean
 * shading tier. Flat page; the dev server has no /api/agent, so the agent
 * plans on the device, as it does offline.
 *
 *   npx @iwsdk/cli browser run scripts/check-ask.mjs --timeout 100000
 */
export default async function run({ frame, page }) {
  const t = frame ?? page;
  await t.waitForFunction(() => !!globalThis.agent && !!globalThis.access, null, { timeout: 30000 });
  return t.evaluate(async () => {
    const { agent, atelier, access, perf } = globalThis;
    const until = async (fn, ms = 40000) => {
      const end = Date.now() + ms;
      while (!fn()) {
        if (Date.now() > end) throw new Error('timed out');
        await new Promise((r) => setTimeout(r, 100));
      }
    };
    const out = {};
    // 1. Typed on the start page.
    const input = document.querySelector('#stylist-memory input');
    input.value = 'a dinner date tonight, something red';
    input.form.requestSubmit();
    await until(() => agent.state === 'deciding');
    out.typed = { request: agent.last.request, goal: agent.last.goal, steps: agent.last.steps, outcome: agent.last.outcome, look: atelier.currentPieces.map((p) => p.fabric) };
    agent.keep();
    // 2. Spoken: a request goes to the agent, a change goes to the tailor.
    access.voice.handle('dress me for a wedding tomorrow, something silver');
    await until(() => agent.state === 'deciding');
    out.spoken = { request: agent.last.request, goal: agent.last.goal, reason: agent.last.outcome?.reason, look: atelier.currentPieces.map((p) => p.fabric) };
    agent.undo();
    const runs = agent.last;
    access.voice.handle('make the dress midi with long sleeves');
    await new Promise((r) => setTimeout(r, 600));
    out.tailorNotAgent = agent.last === runs;
    // 3. The lean tier dresses the form in standard shading, and back.
    const mats = () => [...new Set(atelier.outfit.children.flatMap((g) => g.children.map((m) => m.material?.name ?? '')))];
    perf.setTier(2);
    out.lean = mats();
    perf.setTier(0);
    out.full = mats();
    out.errors = globalThis.atelierHealth.log.map((e) => `${e.where}: ${e.message}`);
    return out;
  });
}
