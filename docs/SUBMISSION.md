# Atelier: Devpost submission kit

Deadline: **Nov 18, 2026, 12:00 PM PT**. Track: **Productivity**. Division: **New Experience**.

## Links

- Play: https://atelier-mr.vercel.app (mirror: https://nekhabose.github.io/atelier-mr/)
- Code: https://github.com/nekhabose/atelier-mr
- Video: _YouTube or Vimeo link, public, under 3:00_. Upload `docs/video/atelier-demo.mp4` (1:32, 1080p; kept out of git). See Demo video below.
- No headset? Open the link on a desktop and press **Watch the tour (under 2 min)**: it plays the real app with captions.

## Name and tagline

**Atelier**

Tagline (124 of 128 characters):

> A fitting room in your own room: pinch your clothes to tailor them, and get dressed for your real weather and your real day.

## Description (paste this into Devpost: 494 words)

Devpost suggests 500 words or less. It leads with what only Atelier does;
the longer version further down is optional reading (README or judges).

**Pinch your own skirt at the knee, and the hem moves there.** Atelier stands a fitting studio in your real room on Meta Quest: a life-size dress form, rail and fabric board, placed around your furniture. You tailor with your hands, not menus, and a stylist agent dresses the form from the clothes you actually own, for your real weather and your real day.

**Inspiration.** Most mornings I reach into a full wardrobe for the same few things. Getting dressed is physical, yet wardrobe apps turn clothes into flat photos in a grid. I wanted a fitting room I could step into at 7:40 on a rainy morning, one that already knows I have an interview at ten.

**What it does.**

- **Tailor on yourself.** Pinch your own hem, wrist or collarbone, and the form's hem, sleeve or neckline moves there, scaled from your height. Or pull a pin while a tape measure reads the length.
- **A stylist that acts, not chats.** Say "Dress me for today", or ask in your own words: "dinner on Friday, something black". The agent checks your forecast and calendar, recalls what you liked, searches your closet, and dresses and tailors the form, ticking off each step on a card. Keep it, or Undo puts back exactly what you had.
- **A morning habit.** Lay out tomorrow at night, and it is waiting on the form in the morning. Wear today tracks cost per wear and styles the piece you never wear. Before you buy, the boutique counts the outfits a new piece would add.
- **For everyone.** Everything works with a pinch, near or far, without a controller. Seated mode brings the studio within reach of your chair; Access adds large text, high contrast, voice and tailoring by tap. A compact layout fits the narrower view of Meta VR Glasses, with gaze and pinch.

**How I built it.** From scratch during the competition, with Meta's Immersive Web SDK (WebXR, Three.js, ECS). The garments, form and 36 fabrics are procedural, so tailoring changes real geometry. Plane and mesh detection keeps the studio off your furniture, a persistent anchor brings it back, and the Quest 3 depth API shows your real hands in front of the form. The stylist is a tool-using Claude agent: it chooses among seven validated tools that act through the same studio actions as your hands. An on-device planner makes the same calls offline, so nothing breaks without the AI service, and your photo, calendar and closet stay on your device. A quality governor protects the frame rate, and 108 unit tests and a 300-action soak test back it.

**What's next.** Testing on Quest 3 and 3S hardware (so far it has run in the Immersive Web Emulator), live calendar sync, photographing garments with the passthrough camera, and a Meta Horizon Store release in February 2027. Try it at atelier-mr.vercel.app in the Quest Browser, or press Watch the tour on a desktop.

## Target launch date (form field)

Live today as a web app at atelier-mr.vercel.app (open it in the Meta Quest
Browser). Meta Horizon Store release, as a packaged web app, in February 2027.

## Longer description (optional: for the README, or judges who want more)

**Inspiration.** Most mornings I stand in front of a full wardrobe and wear
the same three things. Getting dressed is a physical decision (how long, how
warm, does it go together), but every wardrobe app I tried turns clothes into
flat photos in a grid. I wanted a fitting room I could step into at 7:40 on a
rainy morning, with the clothes I actually own, sized to me, that already
knows I have an interview at ten.

**What it does.** Atelier puts a fitting studio in your room on Meta Quest. It
reads the room, stands a life-size dress form, a clothes rail and a fabric
board on your real floor, backs them against a wall, keeps them clear of your
sofa and table, and remembers the spot for next time.

You dress the form by pinching a look on the rail, and tailor it with your
hands. Pull a pin and the hem is recut as you pull, while a tape measure reads
the length in centimetres. Or mark it on yourself: pinch your own skirt at the
knee and the form's hem moves there, scaled from your height; your wrist sets
a sleeve, your collarbone a neckline. Drop a swatch to change the fabric of one
piece.

The productivity loop is the morning. Recreate the clothes you own in the
Digital Closet, or photograph one. **Dress me for today** hands the morning
to the stylist agent: it checks today's forecast and your calendar (an .ics
file, read on the device), recalls what you kept and undid before, searches
your closet, dresses the form and tailors it, and each step ticks off on a
paper card beside the form. **Keep** it, or **Undo** puts back exactly what you
had; both teach it what you like. Or just say what you need, in your own
words: "a dinner date tonight, something red", "a wedding tomorrow, it's
freezing". The agent plans from your words, your weather, your calendar and
your closet, and quotes you at the top of its plan. At night, **Lay out
tomorrow** does the same for tomorrow, and the outfit is waiting on the form in
the morning. **Plan week** plans seven
days around your calendar and forecast; **Pack** finds the fewest pieces for a
trip.

It also helps you wear what you own. **Wear today** logs each piece you wear,
so the closet shows cost per wear and your least worn piece, and **Style it**
builds a look around that piece. The boutique turns shopping around: a new
piece is tried with your clothes and gets a count of the outfits it would add,
a cost per outfit and an honest buy, maybe or skip.

A full-length photo turns the form into you (checked on the device; partial
photos are refused). **Access** offers large text, high contrast, calm motion,
read aloud, voice commands, one-tap tailoring, and a seated layout that brings
the form, rail and panels within reach of your chair.

**How I built it.** From scratch with Meta's Immersive Web SDK (WebXR,
Three.js, ECS) during the competition. The garments, the form and 36
fabrics are procedural, so tailoring changes real geometry rather than
swapping meshes. Scene understanding (planes and meshes) places the studio and
keeps it off furniture, a persistent anchor brings it back, and the Quest 3
depth API lets your real hands show in front of the form, rail and board. The
panels are UIKitML. The stylist agent is a tool-using agent: Claude decides
which of seven tools to call, the tools run in the headset on your own data
through the same studio actions your hands use, and a Vercel Function only
relays each turn with fixed tool definitions. Every call is validated before
it runs, and an on-device planner makes the same calls when there is no
network or key. The other stylist features call Claude with validated,
structured output and have on-device fallbacks too. The photo check runs MediaPipe Pose on the device. The
forecast comes from Open-Meteo with your location rounded to about 10 km.

Reliability is engineered in, not hoped for. A quality governor watches the
frame rate in the headset and, below 85% of the refresh rate (61 fps at
72 Hz), first asks the headset for a lower refresh rate (90 to 80 to 72 Hz,
the rate Meta's own WebXR samples target), then steps quality down (depth
occlusion, shadow updates, garment detail) and back up when there is
headroom, so the studio stays above the 60 fps floor. One failing system cannot freeze the view: every system's frame update
is guarded, errors are recorded, and a graphics reset recovers on its own. A
placement search keeps the studio clear of furniture and inside the walls,
shifting, turning or switching to a compact layout; tested in the emulator's
eight rooms, it found a clear spot by itself in six, and in the other two it
says to face a clearer spot. 80 random interactions caused no errors. A soak test of 300 actions shows no GPU or
memory leaks. Typecheck, 108 unit tests and a production build run in CI on
every push, and a 46-step journey drives the app in the IWSDK emulator with
emulated controllers and hands. Details: `docs/ENGINEERING.md`.

**Challenges.** Staying above 60 fps on hardware I could not test on: the
answer was a governor that measures and adapts, rather than a guess. Telling a
mark from a point: a hand-ray pinch at a panel looks
like a pinch near your body, so marks only count within 30 cm in front of you.
Keeping procedural cloth fast while you drag: a light mesh is rebuilt about 20
times a second and the full garment on release, and shadows are redrawn only
when something moves. Placing the studio in rooms I have never seen: it reads
furniture from planes and meshes, slides until it is clear, and says why.

**Accomplishments.** Everything works with a pinch, near or far; nothing needs
a controller. The stylist acts on the form instead of chatting, and every
change can be undone. Your photo, calendar and closet stay on your device.

**What I learned.** Hands-first means designing for distance as much as for
touch: every target also works by ray from a seat, and every drag has a tap
alternative. And productivity apps earn a place in the day by being tied to a
moment. For clothes, that moment is the morning.

**What's next.** Testing on Quest 3 and 3S (frame rate, hand tracking near the
body, depth occlusion in real rooms) before the Store release. Then live
calendar sync (Google, Outlook) with consent, photographing garments with the
headset's passthrough camera, shared lookbooks, and tuning the compact layout
for Meta VR Glasses on the device.

**Target launch date.** Live today as a web app: open atelier-mr.vercel.app in
the Meta Quest Browser. Release on the Meta Horizon Store, as a packaged web
app, in **February 2027**.

**Performance (measured).** In the Immersive Web Emulator on a Mac, at full
quality, every rail look renders at 48-59 fps steady (the emulator caps at
60), with 158-184 draw calls and 156k-215k triangles per stereo frame, and no
shadow redraws while the studio is still. In the headset a quality governor
holds the frame rate: below 85% of the refresh rate for 1.5 seconds it first
asks for a lower refresh rate (never below 72 Hz), then steps down (depth
occlusion and shadow updates first, then lighter garments with simpler cloth
shading) and steps back up when there is headroom. With the CPU slowed 4x
in an emulated Quest 3 session, full quality ran 44-60 fps and the lightest
tier 54-60 fps while the agent, boutique and fabrics were in use; as Quest 3
Browser at home Wi-Fi speed, the studio is ready in 4.3-5.5 s
(`docs/ENGINEERING.md`, Quest-class checks). Not yet measured on a Quest
headset; `?check` runs a 30-second device benchmark that
anyone with a Quest can run from the link.

## How Atelier meets the judging criteria

**Innovation & Creativity.** Clothes are not photos in a grid: they are
procedural garments on a life-size form that you tailor with your hands, cut
by cut (hem, sleeve, neckline, waist), and you can mark a length on your own
body. A tool-using stylist agent acts on the form with its plan in view, and
you keep or undo the whole run. It uses what only a headset has: passthrough,
scene understanding (planes and meshes), a persistent anchor, hand tracking,
gaze, depth occlusion. Repeat use comes from the morning: your weather, your
calendar, your closet, every day.

**Experience Design.** Hands-first from start to finish, with no controller
needed. Seated mode brings the form, rail and panels within reach of a chair.
A three-step ghost-hand tour teaches pinch, pull and ask, and the form is
already dressed on the first visit. Passthrough is purposeful: your room
decides where and how big the studio is (walls, furniture, room size), and
your body sets the measurements. FoV-aware: narrow views and gaze switch to a
compact layout, and every panel button and the agent's plan card sit inside
the Meta VR Glasses' view (37 degrees each side, 25 up, 43 down), measured on
the glasses emulator profile. The habit: dress me for today, lay out
tomorrow, wear today.

**Technical Implementation.** IWSDK 1.1 with hand tracking (including pinches
on your own body), gaze and pinch, plane and mesh detection, a persistent
anchor and depth occlusion. A placement search keeps the studio clear of
furniture and inside the walls in rooms it never saw (6 of the emulator's 8
rooms clear on their own; the other 2 say why). A quality governor holds the
frame rate; every system's update is guarded so one failure cannot freeze the
view. Every agent tool call is validated on the server and in the headset.
108 unit tests, a 46-step end-to-end journey with emulated hands and
controllers, a 300-action soak test (no leaks) and 80 random interactions (no
errors) back it. Without a headset, Quest-class checks slow the CPU 4x: as
Quest 3 Browser on home Wi-Fi with no speech API, the studio is ready in
about 5 s with no errors; in an emulated Quest 3 session the lightest tier
holds 54-60 fps while the agent, boutique and fabrics run. Not yet run on a
physical Quest.

**Polish & Presentation.** One art direction throughout: paper-and-ink
panels, hang tags, pinned labels and the agent's card. Original music and UI
sounds. The video is the real app, recorded in the Quest emulator and
labelled as such, narrated in my own voice.

**The four tests.** Hands-first: the whole experience works with hands, and a
controller is optional. Airplane seat: Seated mode puts everything within
reach. One bus stop: a loading screen appears at once and the studio opens
dressed in about 5 s even on a Quest-class CPU; "Dress me for today" gives
a complete outfit in seconds; the system menu pauses sound and saves the
studio. Take it away: without the AI service, the on-device stylist and agent
plan with the same tools, so nothing stops working.

## Built with (Devpost tags)

iwsdk, webxr, meta-quest, mixed-reality, passthrough, hand-tracking,
eye-tracking, scene-understanding, three.js, typescript, vite, claude,
anthropic, ai-agents, vercel, mediapipe, open-meteo, pwa

## Hand interactions (optional field)

Every action works with a pinch, near or far, and nothing requires a
controller. Pinch a look to wear it; pinch and pull a tailoring pin (the cloth
rebuilds as you pull, and a tape measure reads it); pinch your own clothes to
mark a length on yourself; pinch a swatch and drop it on a garment; pinch the
form and twist to turn it; and tap the spatial panels. Everything is reachable
from a seat: hand rays work at a distance, Turn, Undo and Redo replace walking
around, and **Access > Seated** brings the studio to your chair. A ghost hand
demonstrates the core gestures on first launch instead of a wall of text. For
people who cannot pinch and drag, one-tap buttons tailor hem, waist and
sleeves, and voice commands cover the main actions where the browser supports
speech recognition.

## Judge instructions

1. On Quest 3/3S, open **https://atelier-mr.vercel.app** in the Meta Quest
   Browser. Put controllers down; allow hand tracking when asked.
2. Tap **Enter the studio**. The studio places itself on your floor, clear of
   furniture; a ghost hand starts a 3-step tour (skip it with **Tour**).
3. Pinch a look on the rail, pull a coloured pin (watch the tape measure), and
   drop a swatch on the form. **Undo** if you like.
4. Studio panel, **Mark on me**: pinch your own clothes at your knee. The hem
   moves to that height. Try your wrist for a sleeve.
5. Closet panel, **This morning**: **Dress me for today**. Watch the card on
   the left of the form tick off each step, then **Keep** (or **Undo**). Then
   **Lay out tomorrow**. With voice on (Access panel), say what you need:
   "a dinner date tonight, something red". On a desktop, type it in **Ask
   your stylist** on the start page.
6. Closet panel: **Wear today**, then **Style it** next to your least worn
   piece.
7. Studio panel, **Access > Seated**: the studio comes to your chair. Turn it
   off again the same way.
8. Leave and come back: the studio returns to the same spot in your room.

Before entering, on the start page: **Your mornings > Use my local weather**
and **Import a calendar (.ics)** set up the morning (both optional; without
them the stylist uses the weather you pick).

No headset at hand: open the link on a desktop and press **Watch the tour
(under 2 min)** for a captioned walk through the same story.

Optional: **https://atelier-mr.vercel.app/?perf** shows frame rate, draw calls
and triangles above the studio panel, and **?check** runs a 30-second device
check that ends with a results card. The stylist works without any API key
("on-device"); with the server key it shows "live AI".

## Works today vs. future

| Works today (verified in the IWSDK emulator and production URL) | Future |
|---|---|
| Room-aware placement on floor/wall planes, manual re-place, persistent anchor restore (emulator-verified) | Multi-anchor layouts (panels on separate surfaces) |
| Keeps clear of furniture and inside the walls: a placement search shifts, turns or switches to a compact or small layout until the form, rail and board are clear, and says what it did; tested in the emulator's eight rooms from a clean first visit: clear automatically in 6, an honest "face a clearer spot" in the 2 where a table surrounds the start spot (3 of 8 before the search) | Placement around room corners and doorways |
| Mark it on yourself: pinch at your knee, wrist or collarbone to set hem, sleeve or neckline, scaled to your height (emulated hand pinches) | Calibrating to a full body-tracking skeleton |
| Seated layout around your chair, everything within reach (Access > Seated) | Automatic seated detection |
| Gaze and pinch (Meta VR Glasses emulator profile): all 8 rail looks and the panel buttons select by looking and pinching with either hand; hand rays take over when gaze is off; every panel button sits inside the glasses' view, seated or standing | Tuning on real glasses |
| Quality governor (holds the 60 fps floor by stepping occlusion, shadow updates and garment detail down and back up), guarded frame loop, graphics-reset recovery, small-room layout, no leaks in a 300-action soak | Measured on a physical Quest |
| 8 current designer looks (satin halter and slip maxis, a lace midi, a blazer dress with gold buttons, a sequin fringe mini, double-breasted suiting); garments are built from their cut, including slip straps, halters, open backs, thigh slits, cowl, sweetheart and square necklines, corsets, tiered ruffles, drape, puff shoulders, buttons and fringe; live tailoring of 4 regions (ray or direct pinch), undo/redo/reset/turn | More garment types (coats, shoes, accessories) |
| Depth occlusion of form, garments, pins, the rail and the fabric board (Quest 3 depth API; emulator-verified that depth is granted and occlusion is live) | Occlusion quality tuning on device |
| Installable app (manifest, icons, offline service worker), shadows on demand, `?perf` meter, unit tests in CI | Horizon Store packaging (bubblewrap APK) |
| 36 fabrics including satins, sequins (each catches the light), sheer lace and tulle, velvet, leather-look, metallic lame and crepe; 12 on the swatch board, applied per garment | Fabric scans from real swatches |
| Digital Closet: create, edit, remove, persist (7 pieces) | Larger closet, categories, search |
| Ask the stylist in your own words, by voice or typed ("a dinner date tonight, something red"): the agent plans from your words with your weather, calendar and closet; colours you ask for are matched by family, and it says so when the closet has none; outfit requests go to the agent and clothing changes ("make it midi") to the tailor | Conversation across several turns |
| Stylist agent: chooses its own calls to 7 tools (weather, calendar, preferences, closet search, put on form, tailor, finish), each validated and run in the headset; live plan card; Keep or Undo the whole run; learns from both (on the device); on-device planner with the same tools; Keep and Undo by controller ray and by gaze and pinch (glasses emulator profile) | Multi-day plans in one run |
| Stylist: 3 ranked distinct options, preview, keep, next, undo, re-plan, refine (warmer / dressier / colour edits on the form), closet gaps, offline fallback | Voice constraints |
| Your mornings: local forecast (Open-Meteo, location rounded to about 10 km), calendar import (.ics, read on the device, only day and kind of event kept), Dress me for today, Lay out tomorrow, week plan by each day's forecast and calendar | Live calendar sync (Google, Outlook) with consent |
| Wear what you own: wear log per piece from Wear today, cost per wear, least worn piece with Style it | Wardrobe insights over months |
| Photo to closet (Claude vision; colour-only fallback on device), tailoring in plain words (on-device parser, live AI for the rest), week planner and packing list | Photo capture from the headset's passthrough camera |
| Lookbook (6) and Outfit of the Day streak; share a look by link or QR code | Shared lookbooks, friends' rails |
| Access panel: large text, high contrast, calm motion, read aloud, voice commands, tap-to-tailor | On-device check of speech features on Quest Browser |
| Boutique: 3 original labels, 15 pieces, try-on with your closet, buy / maybe / skip with new-outfit count and cost per outfit, add to closet | Official retailer feeds through partner programs |
| Full-length photo turns the form into you (on-device pose check refuses partial photos; your head, skin, hair, proportions and height) | Exact body measurements in cm, and 3D faces from more than one photo |
| Claude stylist live on the production URL (server-side key), offline fallback | Tuning for Meta VR Glasses on device |

Not yet verified: frame rate, hand tracking (including marking on your own
body), depth occlusion and haptics on a physical Quest, placement in real
rooms, and the live Open-Meteo request (tested with a stand-in response; the
test browsers block outside requests). Read aloud and voice commands are feature-detected;
whether Quest Browser provides speech synthesis and recognition is not yet
verified (the toggles say so when a feature is missing). All testing so far used the Immersive Web Emulator
Runtime and desktop browsers.

## Demo video (1:32)

`docs/video/atelier-story.mp4` is the picture: the real app recorded in the
Immersive Web Emulator's simulated living room, with the emulated headset
moving like a person's head while the guided tour drives the real systems.
Captions are burned in and show the narration word for word.
`docs/video/atelier-demo.mp4` adds the narration, an original music bed and UI
sounds. **The narration is my own voice**, recorded in one take and cut
into its 15 lines (one line I read twice; the clearer read is used); only the
pauses inside a line were shortened (to 0.25 s, keeping the room sound). The tour is timed to that recording: each line
starts when the last one ends, and each action lands on its spoken word (the
hem moves on "knee", the fabric on "satin" and "silk", and each of the
stylist agent's steps ticks off as it is named). The word times come from a
transcript of the recording made on this Mac (Whisper, offline), checked
against the finished mix: each action word lands within a few hundredths of a
second of its cue. In the video the agent runs on the device (its card says
"On-device agent"), so the tour is the same every time; with the server key,
the live Claude agent makes the same tool calls. On Devpost, describe it as
emulator footage of the real app, narrated by the creator. The video says so
on screen too: an opening note ("Recorded in the Meta Quest emulator's
simulated living room. On your headset, Atelier appears in your own room.")
and a small "Quest emulator" tag in the corner throughout.

It tells one story, a real morning, so the features arrive as reasons:

| Time | On screen | Narration |
|---|---|---|
| 0:00 | The empty living room, "7:40 am" | Seven forty. Rain later, an interview at ten, and a closet full of clothes I hardly wear. |
| 0:08 | The studio settles into the room, clear of the furniture | So I put on my headset, and my own room becomes a fitting studio. |
| 0:13 | The stylist agent's plan card beside the form ticks off each step: the weather (9°C, rain likely), the interview on the calendar, what you like, the closet; it dresses the form in the cocoa satin slip midi with a double-breasted black blazer, then offers Keep or Undo | Atelier checks today's forecast and my calendar, and dresses the form from my own closet. |
| 0:20 | "Dressier" recuts the blazer in black satin, tuxedo style; the card adds the step, then Keep | It's an interview, so I want it sharper. I say dressier, and the outfit changes. |
| 0:26 | Asked in my own words: the card opens with "Listened to you", says there is no forecast for Friday on this device, and dresses the form in the black lace midi slip dress ("dressed for Friday") | Or I just ask: dinner on Friday, something black. |
| 0:33 | A chocolate velvet slip maxi from the rail | For tonight, I take a dress from the rail. |
| 0:36 | Hem marked at the knee, tape measure | It's too long for me, so I pinch my own leg at the knee, and the hem moves there. |
| 0:43 | A pin pulls the hem up, the tape reads it | Or I pull a pin, and the tape measure reads the length as I go. |
| 0:48 | Satin, then silk | A different fabric? I drop a swatch on it: satin, then silk. |
| 0:54 | Tomorrow (a party) laid out: the silver sequin halter mini | Before bed, I lay out tomorrow's outfit, and in the morning it's waiting for me. |
| 1:00 | The never-worn burgundy corset mini (cost per wear), and a look built around it | It shows me what I never wear, and its cost per wear, and builds a look around it. |
| 1:06 | Boutique try-on: an emerald satin halter maxi, with a verdict | Before I buy something new, it counts the outfits it would add, and it gives me an honest verdict. |
| 1:12 | Seated: the studio comes to the chair | And when I sit down, the whole studio comes within reach. |
| 1:18 | The Access panel | Large text, high contrast, calm motion, voice, and tailoring by tap are all built in. |
| 1:25 | The form turns; end card with the URL and launch date | Atelier. Get dressed for your real day. Open it in your Quest browser today. |

Rebuild it:

```sh
python3 scripts/split-voice.py docs/video/voice-take.m4a   # your take -> one clip per line (automatic)
# or, with re-reads in the take: hand-checked line windows and a Whisper transcript
python3 scripts/cut-voice-lines.py docs/video/voice-take-2.m4a windows.json words.json
python3 scripts/tour-timing.py                              # time the tour to your lines
npx @iwsdk/cli dev restart --ai-mode agent --allow-browser-automation   # hides emulator controls
npx @iwsdk/cli browser run scripts/record-mr-frames.mjs --timeout 110000
node scripts/frames-to-mp4.mjs docs/video/frames-mr docs/video/atelier-story.mp4 --crop-toolbar
bash scripts/mix-video.sh docs/video/atelier-story.mp4 docs/video/atelier-mixed.mp4
python3 scripts/video-note.py docs/video/atelier-mixed.mp4 docs/video/atelier-demo.mp4   # emulator note and tag
npx @iwsdk/cli dev restart --ai-mode collaborate --allow-browser-automation
```

Lines and times live in `scripts/narration.txt`; the tour reads the same
times from `src/atelier/tour-timing.ts` (both written by tour-timing.py). If you get time on a real Quest, a 10-second clip
of your hands pinching a pin would be the strongest addition (Meta Quest
Developer Hub can record or cast).

## Screenshots

`docs/screenshots/`: put **00-thumbnail** first (Devpost uses the first image
as the project card), then the stills from the story cut (Immersive Web
Emulator, simulated living room) and the start page: 01-a-real-morning,
02-room-becomes-studio, 03-dressed-for-today, 03b-ask-in-your-own-words,
04-mark-on-yourself,
05-start-page, 06-tape-measure, 07-lay-out-tomorrow, 08-wear-what-you-own,
09-boutique-verdict, 10-seated, 11-accessibility, 12-get-dressed. The
emulator stills and the thumbnail carry the same small "Quest emulator ·
simulated room" tag as the video; the start page is the desktop browser.
Replace with on-device captures when a Quest is available. Use only your own
full-length photo if you show the photo feature.

## Special awards

Worth claiming: **Best Agentic Interaction** (a spatial agent with
voice-first, context-aware assistance: say what you need in your own words and
it chooses its own tool calls over your weather, calendar, closet and
preferences, acts on the form through the same actions as your hands, shows
every step on a card beside the form, and you keep or undo the whole run; it
learns from both), **Best Reason to Come Back** (the morning
routine, Lay out tomorrow, wear log and streak, the anchored studio), **Best
First Five Minutes** (ghost-hand tour, a dressed form on first visit),
**Best Accessibility Forward Experience** (Access panel, tap-to-tailor, voice,
read aloud, Seated).
