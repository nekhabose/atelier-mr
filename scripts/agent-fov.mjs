/**
 * Paced on-device run, then the plan card's corners and buttons as angles
 * from the view axis (for the Meta VR Glasses view: 37 deg each side,
 * 25 deg up, 43 deg down).
 */
export default async function run({ frame, page }) {
  const t = frame ?? page;
  return t.evaluate(async () => {
    const { agent } = globalThis;
    if (agent.state === 'deciding') agent.undo();
    agent.run('today', { live: false });
    const end = Date.now() + 30000;
    while (agent.state !== 'deciding' && Date.now() < end) await new Promise((r) => setTimeout(r, 100));
    const cam = agent.world.camera;
    cam.updateMatrixWorld();
    let card = null;
    const named = {};
    agent.world.scene.traverse((o) => {
      if (o.name === 'agent-plan-card') card = o;
      if (o.name === 'agent-keep' || o.name === 'agent-undo') named[o.name] = o;
    });
    const angle = (v) => {
      const p = cam.worldToLocal(v.clone());
      return [+((Math.atan2(p.x, -p.z) * 180) / Math.PI).toFixed(1), +((Math.atan2(p.y, -p.z) * 180) / Math.PI).toFixed(1)];
    };
    const g = card.geometry.parameters;
    const corners = [
      [-g.width / 2, g.height / 2], [g.width / 2, g.height / 2], [-g.width / 2, -g.height / 2], [g.width / 2, -g.height / 2],
    ].map(([x, y]) => angle(card.localToWorld(card.position.clone().set(x, y, 0))));
    const buttons = {};
    for (const [k, o] of Object.entries(named)) buttons[k] = angle(o.getWorldPosition(o.position.clone()));
    const wp = (o) => { const v = o.getWorldPosition(o.position.clone()); return { x: +v.x.toFixed(3), y: +v.y.toFixed(3), z: +v.z.toFixed(3) }; };
    return { state: agent.state, corners, buttons, undoAt: wp(named['agent-undo']), keepAt: wp(named['agent-keep']) };
  });
}
