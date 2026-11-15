/** Start a paced on-device run and wait until the plan card offers Keep and Undo. */
export default async function run({ frame, page }) {
  const t = frame ?? page;
  return t.evaluate(async () => {
    const { agent } = globalThis;
    if (agent.state === 'deciding') agent.undo();
    agent.run('today', { live: false });
    const end = Date.now() + 30000;
    while (agent.state !== 'deciding' && Date.now() < end) await new Promise((r) => setTimeout(r, 100));
    const pos = (name) => {
      let o = null;
      globalThis.atelier.world.scene.traverse((x) => { if (x.name === name) o = x; });
      if (!o) return null;
      const v = o.getWorldPosition(o.position.clone());
      return { x: +v.x.toFixed(3), y: +v.y.toFixed(3), z: +v.z.toFixed(3) };
    };
    return { state: agent.state, steps: agent.last.steps, card: pos('agent-plan-card'), keep: pos('agent-keep'), undo: pos('agent-undo') };
  });
}
