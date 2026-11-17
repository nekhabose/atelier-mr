# Atelier: engineering notes

How Atelier stays fast, reliable and private, and how that is checked. Every claim here has a test or a script behind it.

## Architecture

- **IWSDK 1.1 (WebXR, Three.js, ECS).** One system per concern, registered in
  `src/index.ts`: studio and tailoring (`atelier-system`), closet, stylist,
  planner, mornings, boutique, marking on your body, room placement, access,
  onboarding, the guided tour, and performance.
- **Stylist agent** (`src/agent-system.ts`, `api/agent.ts`,
  `src/atelier/agent-*.ts`). The headset runs the agent loop; Claude decides
  which of seven tools to call (check the weather, check the calendar, recall
  preferences, search the closet, put on form, tailor, finish). The tools run
  in the headset on the user's own data and act through the studio's own
  methods (the ones hands and voice use), so the agent can do nothing a user
  cannot. Every call is validated first (known tool, closet ids that exist, a
  wearable combination, whole centimetres within 20). The function relays one
  turn: it rebuilds the first message from enums (goal, mood) and the date,
  accepts the run so far only in known shapes (the model's own blocks echoed
  unchanged, so the history only grows; tool results as short strings, every
  call answered), adds the fixed system prompt and strict tool schemas, and
  returns the next turn. What you ask for in your own words (said or typed,
  up to 140 plain characters) travels in tags in that first message, and the
  system prompt treats it only as a description of your day and what you want
  to wear. At most 6 model calls and 16 tool calls per run. If
  the live agent is unavailable, slow (20 s per turn) or declines, the form is
  put back and an on-device planner makes the same calls, so the plan card,
  Keep and Undo behave the same. Undo restores the exact snapshot taken before
  the run. Keep and Undo adjust trait scores (lengths, colours, fabrics,
  layering, tailoring) stored on the device; the agent reads them as short
  notes.
- **Pure modules** in `src/atelier/` hold the logic that matters (garment
  geometry and measurements, the offline stylist, calendar parsing, weather
  mapping, wear statistics, furniture clearance, the body-mark maths, the
  quality governor), so it is unit-tested without a browser.
- **Procedural content.** Garments, the form and 36 fabrics are generated
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

- **Budget.** The judging floor is 60 fps on Quest. Meta's WebXR guidance
  gives 13.7 ms a frame at 72 fps and 11.1 ms at 90 (the emulated Quest 3
  starts at 90 Hz and offers 72, 80, 90 and 120).
- **Shadows on demand.** The shadow map is redrawn only when a caster moves
  (0 redraws a second while the studio is still, instead of 72).
- **Light drags.** While a pin is pulled the garment is rebuilt as a light
  mesh about 20 times a second, and at full detail once on release.
- **Quality governor** (`src/atelier/quality.ts`, tested). In the headset,
  if the frame rate stays below 85% of the display's refresh rate (61 fps at
  72 Hz) for 1.5 s, quality steps down one tier: first depth occlusion off and
  shadows limited to 4 redraws a second, then lighter worn garments (about
  half the triangles) with standard cloth shading (no sheen or clearcoat
  layers; sheer lace and tulle cut out rather than blended, so no overdraw).
  It steps back up after 10 s on time. A short hitch
  changes nothing. Before it cuts detail, a headset running above 72 Hz is
  asked for its next lower refresh rate (90 to 80 to 72, never below 72, the
  rate Meta's own WebXR samples target), except in a session's first 6 s,
  when shaders are still compiling: then only detail steps down, since it
  comes back. Verified in the emulator: a fresh session cut detail in its
  first seconds, then stepped 90, 80, 72 Hz (`scripts/check-quest-class-xr.mjs`).
- **Measured** (Immersive Web Emulator on a Mac, capped at 60 Hz, headless,
  full quality held for the measurement): every rail look renders at 48-59 fps
  steady, with 158-184 draw calls and 156k-215k triangles per stereo frame
  (`scripts/check-frame-cost.mjs`); the heaviest are the three-piece suit and
  the denim-and-halter look. No shadow redraws while still. The new sequin,
  leather-look and lame finishes get their shine from metalness and low
  roughness rather than the costly clearcoat layer. `?perf` shows these
  numbers, the quality tier and the refresh rate inside the headset.
- **Loading screen.** `index.html` shows the Atelier name and a moving thread
  before any script runs (first paint 0.2 s in the cold start check below),
  until the studio's first frame. The thread animates on the compositor, so
  it keeps moving while the app starts.
- **The video holds full quality.** The emulator's browser draws at most about
  60 frames a second against a 90 Hz emulated headset, which the governor
  would read as a slow headset; recording the tour holds tier 0.

## Quest-class checks

These checks reproduce a Quest's constraints on a laptop: Quest 3 Browser's identity, a CPU slowed four times, home Wi-Fi speed and an emulated Quest 3 session. They measure the CPU side; the GPU and display are the laptop's.

| Check | Conditions | Result |
|---|---|---|
| Cold start (`scripts/check-cold-start.mjs`) | Production build in Chromium identifying as Quest 3 Browser, with no Web Speech API, CPU slowed 4x, 25 Mbit/s and 40 ms latency, empty cache | Loading screen at 0.2 s; studio drawn in 4.3-5.5 s (one very first run, while the browser warmed up, took 11.4 s); 1.2 MB in 12 requests before the studio is ready; longest main-thread block 1.8-2.2 s; a tap on a look shows in about 0.1 s; voice features report themselves unavailable; no errors (the local self-signed certificate aside) |
| In the headset, full quality (`scripts/check-quest-class-xr.mjs`) | Emulated Quest 3 session, CPU slowed 4x, governor held at full quality, while the stylist agent runs, "dressier", a boutique try-on, fabric swaps and rail looks | 44-60 fps median across the actions over two runs (60 is the browser's cap), worst frame 18-39 ms; every action finishes in under 0.1 s |
| In the headset, lightest tier | The same at tier 2 | 54-60 fps median |
| Governor order | Fresh session, governor on | Detail first in the first 6 s, then 90, 80, 72 Hz |

What Quest Browser does that the emulator does not, and that helps on the
headset: IWSDK renders both eyes in one pass (multiview, `multiviewStereo`),
which Meta says cuts CPU time 25-50% for CPU-bound WebXR apps; three.js asks
for full fixed foveation (edges of each eye at lower resolution) by default;
and the emulator's own controls and simulated room cost CPU time a headset
does not spend (`scripts/cpu-profile.mjs` separates them).

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
  and upgrades to the live AI only if it answers in time (8 s cap); the agent
  finishes on the device if the live agent fails at any step, and skips the
  live attempt for 5 minutes after a failure; offline, the service worker
  opens the app from the cache.
- **Storage.** Every read of saved data is validated and falls back to
  defaults; writes that fail (private mode, full storage) keep working for the
  visit.
- **Random input.** `scripts/check-monkey.sh` fires 80 random looks, selects
  and drags at the 70 interactable targets in XR: no errors, nothing caught
  by the safety nets, and the studio responds normally afterwards.
- **No leaks.** `scripts/check-soak.mjs` makes 300 outfit changes, fabric
  swaps, tailoring steps, undos and turns, collecting garbage before each
  sample: GPU geometries and textures stay level (135-161, 52-68) and the
  JavaScript heap settles (204 to 211 MB), with the new wardrobe's trims,
  fringe and lean shading included.

## Privacy and security

- **On the device:** your full-length photo (MediaPipe Pose runs locally), your
  closet, wear log, calendar (only the day and kind of event are kept) and
  studio placement. Shared looks travel inside the link.
- **Sent out, and only when you ask:** your location rounded to about 10 km
  for the forecast (Open-Meteo, no account), and closet descriptions or a
  garment photo to the stylist function. The stylist agent sends only what its
  tools return: the day's forecast summary, the kind of event (never titles or
  people), the preference notes and the closet descriptions, plus your own
  words when you ask it something.
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
| 108 unit tests | Garment maths and the modern cuts, measurements, stylist planning and refinement, the agent's tool schemas and input checks, the on-device agent, agent memory, requests in your own words (reading, routing, colour families), the agent function's request checks, boutique maths, share links, API validation, calendar parsing, weather mapping, wear stats, furniture clearance, body marks, the quality governor and its refresh-rate step, a weekday you name not borrowing today's forecast, the safety nets | `npm test` (CI on every push) |
| Stylist agent | Today then Keep, tomorrow then Undo (the form is restored exactly), tomorrow then Keep (the morning layout is saved), memory updated, no errors; Keep by controller ray; Undo by gaze and pinch on the glasses profile, with the card inside the glasses' view | `scripts/check-agent.mjs`, `scripts/agent-fov.mjs` |
| Asking in your own words | Typed on the start page and spoken: the request reaches the agent and shapes the outfit (occasion, day, colour); a clothing change still reaches the tailor; the lean shading tier swaps and restores materials; no errors | `scripts/check-ask.mjs` |
| Frame cost | Draw calls, triangles and steady frame rate for every rail look in XR at full quality | `scripts/check-frame-cost.mjs` |
| Quest-class cold start | Quest 3 Browser identity, no speech API, CPU 4x slower, home Wi-Fi speed, empty cache (see above) | `scripts/check-cold-start.mjs` |
| Quest-class in the headset | CPU 4x slower in an emulated Quest 3 session: headroom at full and lightest quality, and the governor's order (see above) | `scripts/check-quest-class-xr.mjs` |
| Typecheck and build | Types across the app and the API | `npm run typecheck`, `npm run build` (CI) |
| 46-step journey | The whole product, driven with emulated controllers in XR | `scripts/e2e-emulator.sh` |
| Hand pinches | Marking hem, sleeve and neckline on the body; a pinch held out in front is ignored | Emulated hands, see `docs/SUBMISSION.md` |
| Gaze and pinch | Every rail look and panel button by gaze on the glasses profile; hand-ray fallback; every panel button inside the glasses' view | iwsdk-glasses-test procedure |
| Guided tour | Every beat of the story puts the right thing on the form, and the stylist agent's steps run on their cues (checks weather, calendar, preferences, closet, dresses, tailors, finishes, then "dressier") | `scripts/check-showcase.mjs` |
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
