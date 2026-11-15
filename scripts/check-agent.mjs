/**
 * The stylist agent, end to end in the page (on-device planner; the dev
 * server has no /api/agent, so the live attempt falls back as it would
 * offline). Runs today -> Keep, tomorrow -> Undo, and checks the form,
 * the plan card's steps, the laid-out morning and what the agent learned.
 *
 *   npx @iwsdk/cli browser run scripts/check-agent.mjs
 */
export default async function run({ frame, page }) {
  const t = frame ?? page;
  await t.waitForFunction(() => !!globalThis.agent && !!globalThis.atelier, null, { timeout: 30000 });
  return t.evaluate(async () => {
    const { agent, atelier, morning } = globalThis;
    const until = async (fn, ms = 40000) => {
      const end = Date.now() + ms;
      while (!fn()) {
        if (Date.now() > end) throw new Error('timed out');
        await new Promise((r) => setTimeout(r, 100));
      }
    };
    localStorage.removeItem('atelier.agent.memory.v1');
    agent.memory = { v: 1, kept: 0, undone: 0, traits: {} };
    const out = {};
    const before = atelier.outfitTitle;

    // 1. Today, with the live attempt (no /api/agent here) -> on-device; Keep.
    agent.run('today', { fast: true });
    await until(() => agent.state === 'deciding');
    out.today = { ...agent.last, outfit: atelier.outfitTitle, pieces: atelier.currentPieces.length };
    agent.keep();
    out.afterKeep = { state: agent.state, outfit: atelier.outfitTitle, notes: agent.memory };

    // 2. Tomorrow on the device; Undo puts back today's outfit exactly.
    const snap = JSON.stringify(atelier.snapshot().pieces);
    agent.run('tomorrow', { live: false, fast: true });
    await until(() => agent.state === 'deciding');
    out.tomorrow = { calls: agent.last.calls, title: agent.last.outcome?.title, changed: JSON.stringify(atelier.snapshot().pieces) !== snap };
    agent.undo();
    out.undoRestored = JSON.stringify(atelier.snapshot().pieces) === snap;
    out.memoryAfterUndo = { kept: agent.memory.kept, undone: agent.memory.undone };

    // 3. Tomorrow again, Keep: the morning layout is saved.
    agent.run('tomorrow', { live: false, fast: true });
    await until(() => agent.state === 'deciding');
    agent.keep();
    out.layout = JSON.parse(localStorage.getItem('atelier.layout.v1') ?? 'null');
    out.before = before;
    out.errors = globalThis.atelierHealth.log.length;
    return out;
  });
}
