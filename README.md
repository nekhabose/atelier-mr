# Atelier — a hands-first fashion studio in mixed reality

Atelier puts a life-size dress form on your real floor. Pinch an outfit on the
brass rail to dress it, pull the gold tailoring pins to change hem, neckline,
sleeve and waist, and grab fabric swatches off the library board and drop them
on any garment to re-skin it — all with bare hands, no controllers.

Built for the Meta VR Start Developer Competition 2026 (Productivity track,
New Experience) with the [Immersive Web SDK](https://iwsdk.dev) (WebXR).

## Try it

- **Live:** https://nekhabose.github.io/atelier-mr/ — open it in the Meta
  Quest Browser and tap **Enter Atelier**. On a desktop browser it runs in
  IWSDK's built-in XR emulator.

## Features

- **Tap to wear** — eight original designer looks hang on the rail.
- **Live tailoring** — garments are generated from body measurements, so every
  pin drag rebuilds the cloth instantly.
- **Fabric library** — 16 procedural fabrics (satin, velvet, denim, plaid,
  pinstripe, floral…). Tap a swatch to re-skin the selected piece, or drop it on
  one layer of an outfit to change only that piece.
- **Turntable** — grab the form and twist to see the look from every side.
- **Remembers you** — your last look is restored on the next visit.

## Develop

```sh
npm install
npm run dev        # https://localhost:8090 with the managed emulator browser
npm run typecheck
npm run build      # static output in dist/
```

Pushing to `main` builds and deploys to GitHub Pages via
`.github/workflows/deploy.yml`.

## Layout

```
src/atelier/            body measurements, garment geometry, fabrics, looks
src/atelier-system.ts   interaction: wear, tailor, fabric drop, persistence
src/scene-assets/       mannequin, clothing rack, swatch board
public/scenes/          scene composition (JSON)
public/ui/              spatial panel (UIKitML)
```
