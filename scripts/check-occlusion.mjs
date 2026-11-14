// Depth occlusion: was depth sensing granted, is occlusion live on the form's
// materials (garments, mannequin, pins), and are the UI panels left alone?
//   npx @iwsdk/cli browser run scripts/check-occlusion.mjs --timeout 30000   (in XR)
export default async function run({ frame, page }) {
  const target = frame ?? page;
  return await target.evaluate(() => {
    const a = globalThis.atelier;
    const session = a.world.renderer.xr.getSession();
    const count = (root) => {
      let meshes = 0, patched = 0, live = 0;
      root?.traverse((o) => {
        if (!o.isMesh) return;
        meshes++;
        const sh = o.material?.userData?.shader;
        if (sh?.uniforms?.occlusionEnabled) {
          patched++;
          if (sh.uniforms.occlusionEnabled.value) live++;
        }
      });
      return { meshes, patched, occlusionOn: live };
    };
    const form = a.world.getSceneObject('dress-form');
    return {
      depthGranted: !!session?.enabledFeatures?.includes('depth-sensing'),
      depthUsage: session?.depthUsage ?? null,
      form: count(form),
      panel: count(a.world.getSceneObject('atelier-panel')),
    };
  });
}
