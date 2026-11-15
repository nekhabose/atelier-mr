// Where the studio stands in one emulated room: placement type, what was in
// the way, how the search moved or re-laid the studio, and any errors.
// Used by scripts/check-rooms.sh.
export default async function run({ frame, page }) {
  const t = frame ?? page;
  await t.waitForFunction(() => globalThis.room?.isPlaced === true, null, { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(1500);
  return t.evaluate(() => {
    const r = globalThis.room;
    const w = globalThis.atelier.world;
    const pos = (id) => { const o = w.getSceneObject(id); const v = o.getWorldPosition(o.position.clone()); return [v.x, v.y, v.z].map((n) => +n.toFixed(2)); };
    const c = r.lastClearance;
    return {
      placed: r.isPlaced, placement: r.lastPlacement, snug: r.snug, wall: +r.wallDistance.toFixed(2),
      planes: r.queries.planes.entities.size, meshes: r.queries.meshes.entities.size,
      furniture: [...new Set(r.lastObstacles.map((o) => o.label))].join(','), walls: r.lastObstacles.filter((o) => o.label === 'wall').length,
      blockedBy: c ? c.blockedBy.join(',') : '', clear: c ? c.clear : true, shift: c ? [c.dx, c.dz] : [0, 0], turnDeg: r.lastSearch ? Math.round(r.lastSearch.dyaw * 57.3) : 0, layout: r.lastSearch ? r.lastSearch.layout : 'full', fit: r.fit,
      form: pos('dress-form'),
      errors: globalThis.atelierHealth?.log?.length ?? 0, caught: globalThis.atelierHealth?.caught ?? 0,
    };
  });
}
