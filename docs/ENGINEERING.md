# Atelier: engineering notes

How Atelier stays fast, reliable and private, and how that is checked. Every
claim here has a test or a script behind it; the last section lists what is
not yet verified.

## Architecture

- **IWSDK 1.1 (WebXR, Three.js, ECS).** One system per concern, registered in
  `src/index.ts`: studio and tailoring (`atelier-system`), closet, stylist,
  planner, mornings, boutique, marking on your body, room placement, access,
  onboarding, the guided tour, and performance.
- **Pure modules** in `src/atelier/` hold the logic that matters (garment
  geometry and measurements, the offline stylist, calendar parsing, weather
  mapping, wear statistics, furniture clearance, the body-mark maths, the
  quality governor), so it is unit-tested without a browser.
- **Procedural content.** Garments, the form and twelve fabrics are generated
  from measurements; tailoring changes real geometry. No downloaded models.
- **Scene composition** is IWSDK scene JSON (`public/scenes`), panels are
  UIKitML (`public/ui`), and the asset manifest is shared by the runtime and
  the editor.

## Holding up in rooms the developer never tested

- **Floor:** a plane labelled floor, else the lowest horizontal plane well
  below the head; `local-floor` otherwise.
- **Walls:** the nearest wall straight ahead decides the layout
  (`wallPlan`, tested): 1.85 to 2.8 m away, the studio backs up against it; nearer
  (a small room), the compact layout stands just in front of it; farther or
  none, the studio is set in front of you.
- **Furniture and walls:** tables, sofas, beds, desks, lamps and plants from
  plane and mesh detection, and every wall, are obstacles. A placement search
  (`searchPlacement`, tested) finds the smallest change that keeps the form,
  rail and board clear and on your side of the walls: a shift sideways or
  toward you, a turn of up to 40 degrees, then the compact and the small
  layouts; if nothing fits in front, it sets the studio to your left or right
  and says so. When nothing is clear anywhere it tells you to face a clearer
  spot instead of overlapping.
- **Eight rooms it was never designed around** (`scripts/check-rooms.sh`, the
  emulator's built-in rooms, clean first visit each time):

  | Room | Result |
  |---|---|
  | Sunlit living room | Clear: moved 25 cm right and 50 cm toward you (table, couch) |
  | Home office | Clear: small layout, turned 40 degrees (desk, shelf, screen, wall) |
  | Open office | Clear: small layout (desk, shelf) |
  | Bedroom | Clear: small layout (bed) |
  | Music studio | Clear: turned 20 degrees |
  | Open studio | Clear as placed |
  | Conference room | Blocked at the start spot (table on every side): asks you to face a clearer spot |
  | Kitchen | Blocked at the start spot (table, lamp): asks you to face a clearer spot |

  Before the search, only 3 of the 8 were clear. No errors in any room.
- **Persistence:** the studio frame is stored relative to IWSDK's persistent
  world anchor and restored next session; a new room or cleared space falls
  back to placement.
- **Field of view:** the real per-eye field of view is measured; narrow views
  (Meta VR Glasses) and granted gaze tracking switch to a compact layout that
  keeps essential UI within about 35 degrees. Seated mode lays the studio out
  around a chair.
- **Gaze and pinch (Meta VR Glasses):** gaze tracking is requested
  (optional); on the glasses emulator profile all eight rail looks and the
  panel buttons select by looking and pinching with either hand, and hand rays
  take over when gaze is off. Testing found the dress form "stealing" gaze:
  IWSDK sizes a gaze target by all its children, visible or not, so the hidden
  title card, landing ring and tape measure made the form about 1.5 m wide.
  They are now marked runtime-only, the compact rail stands where every hanger
  has a clear line past the form, and in the compact layout the panels follow
  your eye height: all 16 panel buttons sit inside the glasses' view
  (-35 to 33 degrees across, -43 to -23 degrees down) for a standing user.
- **Occlusion:** with the Quest 3 depth API, real hands and furniture hide the
  form, garments, pins, rail and board. Optional; skipped where unavailable.

## Performance

- **Budget.** The judging floor is 60 fps on Quest; Quest renders at 72 Hz
  (13.9 ms a frame).
- **Shadows on demand.** The shadow map is redrawn only when a caster moves
  (0 redraws a second while the studio is still, instead of 72).
- **Light drags.** While a pin is pulled the garment is rebuilt as a light
  mesh about 20 times a second, and at full detail once on release.
- **Quality governor** (`src/atelier/quality.ts`, tested). In the headset,
  if the frame rate stays below 85% of the display's refresh rate (61 fps at
  72 Hz) for 1.5 s, quality steps down one tier: first depth occlusion off and
  shadows limited to 4 redraws a second, then lighter worn garments (about
  half the triangles). It steps back up after 10 s on time. A short hitch
  changes nothing. Verified in the emulator by slowing the CPU: it stepped
  down to the lightest tier and switched occlusion off.
- **Measured** (Immersive Web Emulator on a Mac, capped at 60 Hz): 58-60 fps,
  192 draw calls and 185k triangles per stereo frame, no shadow redraws while
  still. `?perf` shows these numbers and the quality tier inside the headset.

## Reliability safety nets (`src/atelier/safety.ts`)

- **No single failure can freeze the view.** three.js asks for the next frame
  only after the frame callback returns, so one system throwing would stop the
  render loop. Every registered system (Atelier's and the engine's) is wrapped:
  the error is recorded once a minute per system and the frame goes on.
  Systems that start with the session are wrapped as they appear. Tested.
- **Errors are recorded**, not lost: page errors and unhandled promise
  rejections go to an in-memory log (`globalThis.atelierHealth`).
- **Graphics reset.** On WebGL context loss you are told; if the context is
  not restored within 4 s the page reloads and the studio comes back from the
  device.
- **Entering the headset.** If no session has started 8 s after asking, you get
  a plain explanation (browser, immersive mode, hand tracking).
- **Nothing depends on the network.** The stylist acts at once on the device
  and upgrades to the live AI only if it answers in time (8 s cap); offline,
  the service worker opens the app from the cache.
- **Storage.** Every read of saved data is validated and falls back to
  defaults; writes that fail (private mode, full storage) keep working for the
  visit.
- **Random input.** `scripts/check-monkey.sh` fires 80 random looks, selects
  and drags at the 68 interactable targets in XR: no errors, nothing caught
  by the safety nets, and the studio responds normally afterwards.
- **No leaks.** `scripts/check-soak.mjs` makes 300 outfit changes, fabric
  swaps, tailoring steps, undos and turns, collecting garbage before each
  sample: GPU geometries and textures stay level (140-160, 52-63) and the
  JavaScript heap stays flat (203 to 207 MB).

## Privacy and security

- **On the device:** your full-length photo (MediaPipe Pose runs locally), your
  closet, wear log, calendar (only the day and kind of event are kept) and
  studio placement. Shared looks travel inside the link.
- **Sent out, and only when you ask:** your location rounded to about 10 km
  for the forecast (Open-Meteo, no account), and closet descriptions or a
  garment photo to the stylist function.
- **The stylist function** validates every request against a schema, caps body
  and image sizes, rate-limits per address, keeps its API key on the server,
  validates the model's structured output, and times out cleanly.
- **Headers:** `nosniff`, a strict referrer policy, and a permissions policy
  that limits camera, microphone, location and XR to this site.

## Scalability

- The app is static files on a CDN (hashed assets cached for a year), so more
  users cost nothing extra to serve. The one server function is stateless and
  scales out; if it is slow, busy or down, the on-device stylist answers.
- There is no database: each person's data stays on their own device, so
  there is nothing to shard, back up or breach.

## Testing

| Check | What it proves | How |
|---|---|---|
| 81 unit tests | Garment maths, measurements, stylist planning and refinement, boutique maths, share links, API validation, calendar parsing, weather mapping, wear stats, furniture clearance, body marks, the quality governor, the safety nets | `npm test` (CI on every push) |
| Typecheck and build | Types across the app and the API | `npm run typecheck`, `npm run build` (CI) |
| 46-step journey | The whole product, driven with emulated controllers in XR | `scripts/e2e-emulator.sh` |
| Hand pinches | Marking hem, sleeve and neckline on the body; a pinch held out in front is ignored | Emulated hands, see `docs/SUBMISSION.md` |
| Gaze and pinch | Every rail look and panel button by gaze on the glasses profile; hand-ray fallback; every panel button inside the glasses' view | iwsdk-glasses-test procedure |
| Guided tour | Every beat of the story puts the right thing on the form | `scripts/check-showcase.mjs` |
| Soak | No GPU or memory leaks over 300 actions | `scripts/check-soak.mjs` |
| Eight rooms | Placement in every emulator room from a clean first visit | `scripts/check-rooms.sh` |
| Random input | 80 random interactions, no errors, still responsive | `scripts/check-monkey.sh` |
| Installable and offline | Manifest, icons, service worker | `scripts/check-pwa.mjs` |

## Device check (`?check`)

Opening the app with `?check` runs a 30-second self-driving benchmark in the
headset (looks, tailoring, fabrics, turntable, stylist, boutique) and shows a
results card: average and 1%-low fps, worst frame, share of frames under
60 fps, draw calls, triangles, quality tier, refresh rate and the features the
headset granted. Any Quest can run it from the link; see `docs/DEVICE-CHECK.md`.
Frame times go into a preallocated buffer, so the check adds no per-frame
allocation.

## Not yet verified

Frame rate, hand tracking (including marking on your own body), depth
occlusion and haptics on a physical Quest; placement in real rooms; the live
Open-Meteo request (tested with a stand-in response; the test browsers block
outside requests); speech features in Quest Browser. All testing so far used
the Immersive Web Emulator Runtime and desktop browsers.
