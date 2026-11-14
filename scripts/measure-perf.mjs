// Diagnostic: measures the costliest Atelier operations in the running app.
// Desktop numbers (not Quest) - use them to compare before/after changes.
//
// Usage (dev server with --allow-browser-automation, XR session entered):
//   npx @iwsdk/cli browser run scripts/measure-perf.mjs
export default async function run({ frame, page }) {
  const target = frame ?? page;
  return target.evaluate(async () => {
    const a = globalThis.atelier;
    const median = (xs) => xs.sort((p, q) => p - q)[Math.floor(xs.length / 2)];
    const time = (fn, n) => {
      const out = [];
      for (let i = 0; i < n; i++) {
        const t = performance.now();
        fn(i);
        out.push(performance.now() - t);
      }
      return Math.round(median(out) * 100) / 100;
    };
    // Outfit on the form: geometry size.
    let verts = 0;
    let meshes = 0;
    const form = a.formEntity?.object3D;
    form?.traverse((o) => {
      if (o.isMesh) {
        meshes++;
        verts += o.geometry.attributes.position?.count ?? 0;
      }
    });
    // One garment rebuild (what happens every time a dragged pin moves).
    const rebuildMs = a.currentPieces.length ? time(() => a.rebuildPiece(0), 20) : null;
    // A full outfit rebuild + save (wear, undo, refine).
    const refreshAllMs = a.currentPieces.length ? time(() => a.refreshAll(), 10) : null;
    // Renderer counters for one frame.
    const r = a.world.renderer;
    const info = { calls: r.info.render.calls, triangles: r.info.render.triangles, geometries: r.info.memory.geometries, textures: r.info.memory.textures, programs: r.info.programs?.length };
    // Frame pacing over 2 s.
    const frames = await new Promise((res) => {
      const ts = [];
      const t0 = performance.now();
      const tick = (t) => {
        ts.push(t);
        if (t - t0 < 2000) requestAnimationFrame(tick);
        else res(ts);
      };
      requestAnimationFrame(tick);
    });
    const dts = frames.slice(1).map((t, i) => t - frames[i]);
    const heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null;
    // Visible meshes (each roughly one draw call) per studio node.
    const perNode = {};
    for (const id of ['dress-form', 'clothing-rack', 'swatch-board', 'atelier-panel', 'closet-panel', 'shadow-catcher']) {
      const obj = a.world.getSceneObject(id);
      let n = 0;
      let casters = 0;
      obj?.traverseVisible((o) => {
        if (o.isMesh) {
          n++;
          if (o.castShadow) casters++;
        }
      });
      perNode[id] = { meshes: n, shadowCasters: casters };
    }
    let storage = 0;
    for (const k of Object.keys(localStorage)) storage += (localStorage.getItem(k) || '').length;
    return {
      outfit: { pieces: a.currentPieces.length, meshesOnForm: meshes, verticesOnForm: verts },
      rebuildOnePieceMs: rebuildMs,
      refreshAllMs,
      renderer: info,
      frameMs: { median: Math.round(median(dts.slice()) * 10) / 10, p95: Math.round(dts.sort((p, q) => p - q)[Math.floor(dts.length * 0.95)] * 10) / 10 },
      perNode,
      jsHeapMB: heap,
      localStorageChars: storage,
    };
  });
}
