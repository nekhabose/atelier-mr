// Reports the FoV-aware layout decision for the current XR session: the
// measured horizontal half field of view and whether the compact layout is in
// use. Run with the emulator on metaVRGlasses (expect compact) and on
// metaQuest3 (expect the authored layout).
//
// Usage (dev server with --allow-browser-automation, XR session entered):
//   npx @iwsdk/cli browser run scripts/check-layout.mjs
export default async function run({ frame, page }) {
  const target = frame ?? page;
  return target.evaluate(() => {
    const room = globalThis.room;
    return {
      fovHalfDeg: Math.round(room.fovHalfDeg * 10) / 10,
      compact: room.compact,
      reason: room.narrowReason,
      placement: room.lastPlacement,
    };
  });
}
