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

Open it in the Meta Quest Browser and tap **Enter the studio** (or accept the
immersive prompt). On a desktop browser the studio opens as a flat 3D preview
you can click, and **Watch the tour (under 2 min)** plays the whole story
with captions.

Live now as a web app; on the Meta Horizon Store (packaged web app) in
February 2027.

## What it does

- **Purposeful passthrough:** on entry the studio is placed on your real floor,
  snapped against a detected wall when one is in a comfortable range, or set in
  front of you when no planes are reported. **Move studio** re-places it.
- **Keeps clear of your furniture:** tables, sofas, beds and lamps reported by
  plane and mesh detection are kept out of the studio's footprint. If the form,
  rail or board would stand in one, the studio slides along the wall (or a
  little toward you) and says why ("Moved the studio 30 cm right to clear your
  table").
- **Remembers your room:** the studio is saved against a persistent world
  anchor, so next time it returns to the same spot in your room (falls back to
  plane placement when the anchor cannot be restored).
- **Tap to wear:** eight original designer looks hang on the rail.
- **Mark it on yourself:** tap **Mark on me**, then pinch your own clothes
  where you want the garment to end: at your knee for a hem, at your wrist for a
  sleeve, below your collarbone for a neckline. The pinch is scaled from your
  height to the form's and the tape measure shows the result. A pinch held out
  in front to point at a panel is not taken as a mark.
- **Your mornings:** on the start page, **Use my local weather** fetches the
  week's forecast from Open-Meteo (only your location rounded to about 10 km
  is sent), and **Import a calendar (.ics)** reads your calendar on the device,
  keeping only the day and kind of event (interview, party, trip, work). On the
  closet panel, **This morning** shows today's weather and plans, with **Dress
  me for today** and **Lay out tomorrow** (picked tonight, waiting on the form
  in the morning), both run by the stylist agent below. **Plan week** plans each
  day for its own forecast and calendar.
- **Stylist agent:** a tool-using agent with its plan in view. It decides which
  of seven tools to call - check the weather, check the calendar, recall your
  preferences, search your closet, put an outfit on the form, tailor it,
  finish - and a paper card beside the form ticks off each step as it happens.
  The tools run in the headset on your own data, through the same studio
  actions your hands and voice use, and every call is validated first (known
  tool, closet ids that exist, a wearable outfit, centimetres in range).
  **Keep** it, or **Undo** puts back exactly what was on the form; both teach
  it what you like (kept on the device; **What your stylist remembers** on the
  start page shows it and forgets it). Claude decides when the server has a key;
  an on-device planner makes the same calls otherwise. Say or type what you
  need in your own words ("a dinner date tonight, something red") and it
  plans from them; on the start page it is **Ask your stylist**. While the card is up,
  "warmer", "dressier" or "more colour" edits the outfit and adds a step. Voice: "get me ready",
  "lay out tomorrow", "keep", "undo".
- **Wear what you own:** **Wear today** logs a wear for each closet piece on
  the form. Pieces keep what they cost, so the closet shows cost per wear and
  your least worn piece, with **Style it** to build a look around it.
- **Live tailoring:** garments are generated from measurements, so dragging a
  pin rebuilds the cloth every frame. **Undo / Redo / Reset look** cover every
  tailoring, fabric and outfit change.
- **Fabric library:** 12 swatches on the board from 36 fabrics (satins,
  sequins that catch the light one by one, sheer lace and tulle, velvet,
  leather-look, metallic lame, crepe, plus denim, wool and prints). Tap one to
  re-skin the selected garment, or drop it on one layer of the outfit to
  change only that piece.
- **Current cuts:** garments are built from their cut: slip straps, halters,
  open backs, thigh slits, cowl, sweetheart and square necklines, corsets,
  tiered ruffles, drape, puff shoulders, gold buttons and fringe. The rail's
  eight looks and the starter closet are current eveningwear and workwear
  (original designs, no brands).
- **Turntable:** grab the form and twist, or tap **Turn** (no reaching needed).
- **Digital Closet:** recreate your own clothes from 5 templates, 14 colours and
  15 fabrics (including sequin, lace, velvet, leather and tulle), tailor them
  to match, then mix them on the form. Edit and remove.
- **Agentic stylist:** pick occasion, weather and mood. The stylist weighs every
  wearable combination in your closet, previews its best idea on the form, and
  waits: **Keep**, **Next idea** or **Undo**. Change a chip and it re-plans.
  **Refine** it - Warmer, Dressier, More colour - and the stylist edits the
  outfit on the form (longer hems, sleeves, knit or satin, a colour, a jacket
  from your closet) and says what it changed. It also points out the piece your
  closet is missing for that kind of day.
  Claude plans when the server has a key; a deterministic offline planner
  answers otherwise, so the stylist always works.
- **Photo to closet:** on the start page, photograph one of your garments;
  the live AI stylist reads its type, colour, fabric, length and sleeves, and
  it joins your closet rail, cut to match, and goes on the form (the photo is
  sent to be read and not stored; without the AI, the colour is read on the
  device).
- **Tell the tailor:** say or type what you want ("make the dress midi with
  long sleeves", "red satin skirt"). Clear requests are read on the device and
  applied instantly; anything else goes to the live AI tailor. One undo step.
- **Plan your week, pack for a trip:** in the stylist view, **Plan week** lays
  out seven outfits from your closet (work days, a Friday date, the weekend),
  varied so no outfit repeats two days running; tap a day to wear it, today is
  outlined, and the plan is kept for the week. **Pack** 3, 5 or 7 days from the
  fewest pieces.
- **Boutique - shop against your closet:** three original labels (Maison
  Lune, Studio Nord, Sol & Sable) hang their pieces on the rail, each tagged
  with how many new outfits it unlocks with *your* closet. Tap one: it is tried
  on the form with the pieces you own, and the boutique stylist gives a verdict
  - BUY / MAYBE / SKIP - with new outfits, cost per outfit and near-duplicates.
  Add to closet keeps it. (Original labels only; no real brands or catalogues.)
- **A handmade look:** paper-and-ink panels, hang tags on the rail, pinned
  labels on the fabric board, and on the flat page a real studio set (oak
  floor, plaster wall, window light) with one side panel. While you pull a
  pin, a tape measure, a chalk mark and a card show the measurement in cm
  (hem from the floor, neckline depth, sleeve length, waist round).
- **Make the form you:** on the start page, take (camera with a head-to-feet
  guide and auto-capture) or upload a full-length photo. It is checked on the
  device with MediaPipe Pose: one person, head to feet, facing the camera, or
  it is refused with the reason (a head-only photo is not enough). A good
  photo turns the porcelain form into you: your head and hair cut out of the
  background, your skin tone, hair colour and length, your shoulder and hip
  proportions, and your height if you add it. Clothes and pins reshape with
  the body. Nothing is uploaded; it is kept on the device only.
- **Opening reveal:** on entry the studio settles into your room piece by piece
  and the ATELIER title card appears before the tour starts.
- **Lookbook and Outfit of the Day:** save whole outfits (with tailoring) and
  put them back on any day; **Wear today** logs a daily streak.
- **Ghost-hand tour:** three steps - pinch a look, pull a pin, ask the stylist -
  each demonstrated by a translucent hand; fabric and the boutique are offered
  at the end. On a first visit the form is already dressed when the studio
  appears.
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
- **Guided showcase:** a captioned story of under two minutes (a rainy morning with an
  interview at ten) that drives the real systems on the flat page, for judges
  without a headset and for recording the demo video
  (`?showcase`; `?showcase=record` for unattended capture). Under the IWSDK
  emulator, `?showcase=mr` plays it inside XR in the simulated room, moving the
  emulated headset (used for the mixed-reality demo video).
- **Built for a headset budget:** shadows are redrawn only when a caster
  moves or changes (0 redraws a second while the studio is still, instead of
  60); `?perf` shows frame rate, draw calls, triangles and shadow redraws on the
  page and above the studio panel. Fixed foveation is at the maximum (1.0).
- **Quality governor:** in the headset, below 85% of the refresh rate (61 fps
  at 72 Hz) quality steps down (depth occlusion, then shadow updates, then
  garment detail) and back up when there is headroom; `?perf` shows the tier.
- **Safety nets:** every system's frame update is guarded so one failure
  cannot freeze the view; errors are recorded; a graphics reset recovers; a
  headset view that does not start is explained. No leaks over a 300-action
  soak test (`scripts/check-soak.mjs`).
- **Rooms of any size:** in a small room (a wall nearer than 1.85 m) the
  studio switches to its compact layout in front of the wall; in a cluttered
  one a placement search shifts, turns or compacts it until it is clear of
  furniture and inside the walls. Tested in the emulator's eight rooms
  (`scripts/check-rooms.sh`).
- **Depth occlusion (Quest 3):** real hands and furniture hide the form,
  garments, pins, the rail and the fabric board behind them, so a hand reaching
  into the rail shows in front. Depth sensing is optional, so other devices
  skip it.
- **Seated:** **Access > Seated** lays the studio out around your chair: the
  form just past your knees, the rail and board turned in at your sides at a
  height you can reach sitting, the panels low and tilted up.
- **Pins by ray or by fingers:** pull a pin with a ray from a seat, or pinch it
  directly (a near-grab handle on each pin), with a light controller tap on
  every tailoring step.
- **Installable and offline:** web manifest, icons and a service worker; after
  one visit the studio opens without a network (the on-device stylist answers).
- **Sound design:** taps, a ratchet while you pull a pin, a cloth swish, a
  settle when the studio lands and a sparkle when the stylist acts, all
  synthesised with Web Audio (no audio files).

## Develop

```sh
npm install
npm run dev        # https://localhost:8090 with the managed emulator browser
npm run typecheck  # app + serverless function
npm run build      # static output in dist/
npm test           # unit tests (vitest; also run in CI on every push)
```

Regression checks against the emulator (dev server running, XR session entered):

```sh
bash scripts/e2e-emulator.sh                         # 42-step hands-free journey
npx @iwsdk/cli browser run scripts/check-me-photo.mjs      # needs dev up --allow-browser-automation
npx @iwsdk/cli browser run scripts/check-pause-resume.mjs  # system menu blur / resume
npx @iwsdk/cli browser run scripts/check-layout.mjs        # FoV-aware layout decision
npx @iwsdk/cli browser run scripts/check-showcase.mjs      # flat page, not in XR: every tour beat
npx @iwsdk/cli browser run scripts/check-perf.mjs          # shadows on demand vs every frame
npx @iwsdk/cli browser run scripts/check-occlusion.mjs     # depth granted, occlusion live on the form
npx @iwsdk/cli browser run scripts/check-share.mjs         # share links and voice phrases
node scripts/check-pwa.mjs http://localhost:4174/          # installable + offline (serve dist on 4174)
```

The mixed-reality demo video (emulator room, captions, music, your own
narration) is rebuilt with the steps in `docs/SUBMISSION.md` (Demo video);
`docs/RECORDING.md` has the 14 lines and how to record them, and
`docs/NEWCOMER-TEST.md` a 15-minute test with someone new to Atelier.

How it stays fast and reliable (quality governor, safety nets, rooms of any
size, soak test, privacy, scaling): `docs/ENGINEERING.md`. Measure any Quest
in 30 seconds with `?check`: `docs/DEVICE-CHECK.md`.
Record the flat showcase as an MP4 (needs ffmpeg; output is git-ignored):

```sh
npm run build && npx vite preview --port 4173 &
node scripts/record-showcase.mjs https://localhost:4173/ docs/video/atelier-showcase.mp4
```

Pushes to `main` deploy to Vercel (Git integration) and to GitHub Pages
(`.github/workflows/deploy.yml`).

### Enabling Claude for the stylist and the agent (optional)

The key lives only on the server. Locally, put `ANTHROPIC_API_KEY=...` in
`.env.local` (git-ignored). On Vercel:

```sh
vercel env add ANTHROPIC_API_KEY production
vercel deploy --prod
```

Without a key, `/api/stylist` answers `503 stylist_not_configured`,
`/api/agent` answers `503 agent_not_configured`, and the headset uses its
on-device planners. `/api/agent` relays one agent turn: it accepts only the
goal, the date, the mood and the run so far (the model's own blocks echoed
back, and short tool results for known tools), adds the fixed system prompt
and tool definitions, and returns the model's next turn. The function only accepts allow-listed
origins (`ALLOWED_ORIGINS` adds more), enumerated inputs and short validated
names, and returns only validated, wearable outfits. Its in-memory request
counter is not real rate limiting on serverless; for public traffic add a
Vercel Firewall rate-limit rule and an Anthropic workspace spend limit.

## Layout

```
api/stylist.ts            Vercel Function: Claude stylist (server-side key)
api/agent.ts              Vercel Function: one turn of the stylist agent
src/agent-system.ts       stylist agent: run loop, tool execution, plan card
src/atelier/agent-*.ts    agent tools + validation, on-device planner, memory
src/atelier/              measurements, garment geometry, fabrics, looks,
                          closet, lookbook, streak, stylist contract + engine
src/atelier-system.ts     wear, tailor, fabric drop, undo/redo, turntable
src/closet-system.ts      Digital Closet rail and builder
src/stylist-system.ts     stylist proposals, Outfit of the Day
src/lookbook-system.ts    saved looks
src/boutique-system.ts    boutique rail, try-on and buy / maybe / skip verdicts
src/me-system.ts          full-length photo -> the form becomes you (device-only)
src/atelier/body-scan.ts  full-body check, proportions, skin/hair colour (pure, tested)
src/atelier/pose.ts       MediaPipe Pose loader, person cut-out (lazy, on device)
src/room-system.ts        floor / wall placement + persistent anchor
src/onboarding-system.ts  ghost-hand tour
src/access-system.ts      accessibility panel, voice, read aloud, share links
src/showcase-system.ts    captioned guided tour (flat page, video capture)
src/perf-system.ts        shadows on demand, ?perf meter
tests/                    unit tests (vitest)
public/scenes/            scene composition (JSON)
public/ui/                spatial panels (UIKitML)
docs/                     submission kit and screenshots
```

## Third-party

- [MediaPipe Tasks Vision](https://github.com/google-ai-edge/mediapipe) and the
  Pose Landmarker (lite) model in `public/models/`, Apache-2.0, Google. Used on
  the device only, to check and read a full-length photo.
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator), MIT.
