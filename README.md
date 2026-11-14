# Atelier: your AI-powered fashion studio in mixed reality

Atelier puts a life-size dress form in your real room. Pinch an outfit on the
brass rail to dress it, pull the coloured tailoring pins to change hem,
neckline, sleeves and waist, drop fabric swatches onto one garment at a time,
recreate the clothes you actually own, and let the stylist plan outfits from
them. Everything works with bare hands, seated, without a controller.

Built for the Meta VR Start Developer Competition 2026 (Productivity track,
New Experience) with Meta's [Immersive Web SDK](https://iwsdk.dev) (WebXR).

## Try it

- **Live (primary):** https://atelier-mr.vercel.app
- **Mirror:** https://nekhabose.github.io/atelier-mr/

Open it in the Meta Quest Browser and tap **Enter Atelier** (or accept the
immersive prompt). On a desktop browser the studio opens as a flat 3D preview
you can click, and **Watch the 50-second tour** (top right) plays the whole
journey with captions.

## What it does

- **Purposeful passthrough:** on entry the studio is placed on your real floor,
  snapped against a detected wall when one is in a comfortable range, or set in
  front of you when no planes are reported. **Move studio** re-places it.
- **Remembers your room:** the studio is saved against a persistent world
  anchor, so next time it returns to the same spot in your room (falls back to
  plane placement when the anchor cannot be restored).
- **Tap to wear:** eight original designer looks hang on the rail.
- **Live tailoring:** garments are generated from measurements, so dragging a
  pin rebuilds the cloth every frame. **Undo / Redo / Reset look** cover every
  tailoring, fabric and outfit change.
- **Fabric library:** 12 swatches (satin, velvet, silk, denim, linen, plaid,
  pinstripe, floral...). Tap one to re-skin the selected garment, or drop it on
  one layer of the outfit to change only that piece.
- **Turntable:** grab the form and twist, or tap **Turn** (no reaching needed).
- **Digital Closet:** recreate your own clothes from 5 templates, 10 colours and
  10 fabrics, tailor them to match, then mix them on the form. Edit and remove.
- **Agentic stylist:** pick occasion, weather and mood. The stylist weighs every
  wearable combination in your closet, previews its best idea on the form, and
  waits: **Keep**, **Next idea** or **Undo**. Change a chip and it re-plans.
  **Refine** it - Warmer, Dressier, More colour - and the stylist edits the
  outfit on the form (longer hems, sleeves, knit or satin, a colour, a jacket
  from your closet) and says what it changed. It also points out the piece your
  closet is missing for that kind of day.
  Claude plans when the server has a key; a deterministic offline planner
  answers otherwise, so the stylist always works.
- **Boutique - shop against your closet:** three original labels (Maison
  Lune, Studio Nord, Sol & Sable) hang their pieces on the rail, each tagged
  with how many new outfits it unlocks with *your* closet. Tap one: it is tried
  on the form with the pieces you own, and the boutique stylist gives a verdict
  - BUY / MAYBE / SKIP - with new outfits, cost per outfit and near-duplicates.
  Add to closet keeps it. (Original labels only; no real brands or catalogues.)
- **Make the form you:** on the start page, add a photo (kept on the device,
  never uploaded) and pick a skin tone; your face and tone appear on the form.
- **Opening reveal:** on entry the studio settles into your room piece by piece
  and the ATELIER title card appears before the tour starts.
- **Lookbook and Outfit of the Day:** save whole outfits (with tailoring) and
  put them back on any day; **Wear today** logs a daily streak.
- **Ghost-hand tour:** five steps - pinch a look, pull a pin, drop a fabric,
  ask the stylist, visit the boutique - each demonstrated by a translucent hand.
- **FoV-aware layout:** the studio reads the headset's real field of view (and
  whether gaze tracking was granted) when the session starts. On narrow-view
  devices such as Meta VR Glasses it switches to a compact layout that keeps
  the form, rack, fabric board and both panels within about +-35 degrees of a
  seated user's view; Quest keeps the roomier layout. Gaze and pinch select
  everything on the glasses.
- **Pause and resume:** opening the system menu (session blurred) silences
  sound and saves state; resuming, or leaving and re-entering, brings back the
  outfit and the studio exactly where it was.
- **Accessibility:** **Access** on the studio panel (and checkboxes on the
  start page): Large text (bigger, closer panels), High contrast, Calm motion
  (no bounces, slides or spins), Read aloud (the panel speaks each change),
  Voice commands ("style me", "undo", "shorter", "turn", "share", "look
  two"...), and **Tailor without dragging**: one-tap Shorter / Longer, Waist
  in / out and Sleeves buttons. Calm motion and high contrast follow the
  system's reduce-motion and more-contrast preferences. Speech features are
  feature-detected and say so when the browser lacks them.
- **Share a look:** **Share** packs the outfit into the link itself
  (`#look=...`; nothing is uploaded). The start page shows the link and a QR
  code; opening it dresses the form in that look. Shared links are validated
  and every measurement is clamped to the garment's range.
- **Guided showcase:** a captioned tour that drives the real systems on the
  flat page, for judges without a headset and for recording the demo video
  (`?showcase`; `?showcase=record` for unattended capture). Under the IWSDK
  emulator, `?showcase=mr` plays it inside XR in the simulated room, moving the
  emulated headset (used for the mixed-reality demo video).
- **Sound design:** taps, a ratchet while you pull a pin, a cloth swish, a
  settle when the studio lands and a sparkle when the stylist acts, all
  synthesised with Web Audio (no audio files).

## Develop

```sh
npm install
npm run dev        # https://localhost:8090 with the managed emulator browser
npm run typecheck  # app + serverless function
npm run build      # static output in dist/
```

Regression checks against the emulator (dev server running, XR session entered):

```sh
bash scripts/e2e-emulator.sh                         # 42-step hands-free journey
npx @iwsdk/cli browser run scripts/check-face-upload.mjs   # needs dev up --allow-browser-automation
npx @iwsdk/cli browser run scripts/check-pause-resume.mjs  # system menu blur / resume
npx @iwsdk/cli browser run scripts/check-layout.mjs        # FoV-aware layout decision
npx @iwsdk/cli browser run scripts/check-showcase.mjs      # flat page, not in XR: every tour beat
```

The narrated mixed-reality demo video (emulator room, captions, music,
narration) is rebuilt with the steps in `docs/SUBMISSION.md` (Demo video).
Record the flat showcase as an MP4 (needs ffmpeg; output is git-ignored):

```sh
npm run build && npx vite preview --port 4173 &
node scripts/record-showcase.mjs https://localhost:4173/ docs/video/atelier-showcase.mp4
```

Pushes to `main` deploy to Vercel (Git integration) and to GitHub Pages
(`.github/workflows/deploy.yml`).

### Enabling Claude for the stylist (optional)

The key lives only on the server. Locally, put `ANTHROPIC_API_KEY=...` in
`.env.local` (git-ignored). On Vercel:

```sh
vercel env add ANTHROPIC_API_KEY production
vercel deploy --prod
```

Without a key, `/api/stylist` answers `503 stylist_not_configured` and the
headset uses the offline planner. The function only accepts allow-listed
origins (`ALLOWED_ORIGINS` adds more), enumerated inputs and short validated
names, and returns only validated, wearable outfits. Its in-memory request
counter is not real rate limiting on serverless; for public traffic add a
Vercel Firewall rate-limit rule and an Anthropic workspace spend limit.

## Layout

```
api/stylist.ts            Vercel Function: Claude stylist (server-side key)
src/atelier/              measurements, garment geometry, fabrics, looks,
                          closet, lookbook, streak, stylist contract + engine
src/atelier-system.ts     wear, tailor, fabric drop, undo/redo, turntable
src/closet-system.ts      Digital Closet rail and builder
src/stylist-system.ts     stylist proposals, Outfit of the Day
src/lookbook-system.ts    saved looks
src/boutique-system.ts    boutique rail, try-on and buy / maybe / skip verdicts
src/me-system.ts          face photo + skin tone for the form (device-only)
src/room-system.ts        floor / wall placement + persistent anchor
src/onboarding-system.ts  ghost-hand tour
src/access-system.ts      accessibility panel, voice, read aloud, share links
src/showcase-system.ts    captioned guided tour (flat page, video capture)
public/scenes/            scene composition (JSON)
public/ui/                spatial panels (UIKitML)
docs/                     submission kit and screenshots
```
