# Atelier: Devpost submission kit

Deadline: **Nov 18, 2026, 12:00 PM PT**. Track: **Productivity**. Division: **New Experience**.

## Links

- Play: https://atelier-mr.vercel.app (mirror: https://nekhabose.github.io/atelier-mr/)
- Code: https://github.com/nekhabose/atelier-mr
- Video: _YouTube or Vimeo link, public, under 3:00_. Upload `docs/video/atelier-demo.mp4` (1:28, 1080p; kept out of git). See Demo video below.
- No headset? Open the link on a desktop and press **Watch the tour (under 2 min)**: it plays the real app with captions.

## Name and tagline

**Atelier**

Tagline (124 of 128 characters):

> A fitting room in your own room: pinch your clothes to tailor them, and get dressed for your real weather and your real day.

## Description

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
Digital Closet, or photograph one. Atelier reads today's forecast and your
calendar (an .ics file, read on the device), and the stylist dresses the form
from your closet for that day. Keep it, see the next idea, or say "dressier"
and it edits the garments. At night, **Lay out tomorrow** picks tomorrow's
outfit, and it is waiting on the form in the morning. **Plan week** plans seven
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
Three.js, ECS) during the competition. The garments, the form and twelve
fabrics are procedural, so tailoring changes real geometry rather than
swapping meshes. Scene understanding (planes and meshes) places the studio and
keeps it off furniture, a persistent anchor brings it back, and the Quest 3
depth API lets your real hands show in front of the form, rail and board. The
panels are UIKitML. The stylist calls Claude through a Vercel Function with
validated, structured output, and a deterministic on-device planner gives the
same flow offline. The photo check runs MediaPipe Pose on the device. The
forecast comes from Open-Meteo with your location rounded to about 10 km.

Reliability is engineered in, not hoped for. A quality governor watches the
frame rate in the headset and, below 85% of the refresh rate (61 fps at
72 Hz), steps quality down (depth occlusion, shadow updates, garment detail)
and back up when there is headroom, so the studio stays above the 60 fps
floor. One failing system cannot freeze the view: every system's frame update
is guarded, errors are recorded, and a graphics reset recovers on its own. A
placement search keeps the studio clear of furniture and inside the walls,
shifting, turning or switching to a compact layout; tested in the emulator's
eight rooms, it found a clear spot by itself in six, and in the other two it
says to face a clearer spot. 80 random interactions caused no errors. A soak test of 300 actions shows no GPU or
memory leaks. Typecheck, 81 unit tests and a production build run in CI on
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

**Performance (measured).** In the Immersive Web Emulator on a Mac: 58-60 fps
(the emulator's 60 Hz cap), 192 draw calls and 185k triangles per stereo
frame, and no shadow redraws while the studio is still. The quality governor
keeps the headset above 60 fps by trading detail for frame time when needed.
Not yet measured on a Quest headset.

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
5. Closet panel, **This morning**: **Dress me for today**, then **Keep**. Then
   **Lay out tomorrow**.
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
| 8 looks, live tailoring of 4 regions (ray or direct pinch), undo/redo/reset/turn | More garment types (coats, shoes, accessories) |
| Depth occlusion of form, garments, pins, the rail and the fabric board (Quest 3 depth API; emulator-verified that depth is granted and occlusion is live) | Occlusion quality tuning on device |
| Installable app (manifest, icons, offline service worker), shadows on demand, `?perf` meter, unit tests in CI | Horizon Store packaging (bubblewrap APK) |
| 12 fabrics applied per garment | Photo-to-garment closet entry |
| Digital Closet: create, edit, remove, persist (7 pieces) | Larger closet, categories, search |
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

## Demo video (1:28)

`docs/video/atelier-story.mp4` is the picture: the real app recorded in the
Immersive Web Emulator's simulated living room, with the emulated headset
moving like a person's head while the guided tour drives the real systems.
Captions are burned in and show the narration word for word.
`docs/video/atelier-demo.mp4` adds the narration, an original music bed and UI
sounds. **The narration is an AI clone of my own voice**: I recorded the lines,
then a voice model (Chatterbox by Resemble AI, MIT licence) running on my Mac
read the script in that voice, so every line is word-perfect and each phrase's
timing is exact. Its output carries Resemble's imperceptible watermark. My own
recording is kept (`docs/video/vo-own/`) and can be mixed back in with
`scripts/split-voice.py`. Each action lands on its word (the hem moves on
"knee", the fabric on "satin" and "silk"). On Devpost, describe it as emulator
footage of the real app, narrated by an AI clone of the creator's voice. The
video says so on screen too: an opening note ("Recorded in the Meta Quest
emulator's simulated living room. On your headset, Atelier appears in your own
room.") and a small "Quest emulator" tag in the corner throughout.

It tells one story, a real morning, so the features arrive as reasons:

| Time | On screen | Narration |
|---|---|---|
| 0:00 | The empty living room, "7:40 am" | Seven forty. Rain later, an interview at ten, and a closet full of clothes I hardly wear. |
| 0:08 | The studio settles into the room, clear of the furniture | So I put on my headset, and my own room becomes a fitting studio. |
| 0:13 | "This morning: 9°C, rain likely. An interview", the stylist dresses the form | Atelier checks today's forecast and my calendar, and dresses the form from my own closet. |
| 0:20 | "Dressier" recuts the outfit in satin | It's an interview, so I want it sharper. I say dressier, and the outfit changes. |
| 0:27 | A dress from the rail | For tonight, I take a dress from the rail. |
| 0:30 | Hem marked at the knee, tape measure | It's too long for me, so I pinch my own leg at the knee, and the hem moves there. |
| 0:36 | A pin pulls the hem up, the tape reads it | Or I pull a pin, and the tape measure reads the length as I go. |
| 0:42 | Satin, then silk | A different fabric? I drop a swatch on it: satin, then silk. |
| 0:48 | Tomorrow laid out | Before bed, I lay out tomorrow's outfit, and in the morning it's waiting for me. |
| 0:53 | Least worn piece, a look built around it | It shows me what I never wear, what it costs per wear, and builds a look around it. |
| 1:00 | Boutique try-on with a verdict | Before I buy something new, it counts the outfits it would add, and gives me an honest verdict. |
| 1:07 | Seated: the studio comes to the chair | And when I sit down, the whole studio comes within reach. |
| 1:12 | The Access panel | Large text, high contrast, calm motion, voice, and tailoring by tap are all built in. |
| 1:19 | The form turns; end card with the URL and launch date | Atelier. Get dressed for your real day. Open it in your Quest browser today. |

Rebuild it:

```sh
python3 scripts/split-voice.py docs/video/voice-take.m4a   # your take -> one clip per line
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
02-room-becomes-studio, 03-dressed-for-today, 04-mark-on-yourself,
05-start-page, 06-tape-measure, 07-lay-out-tomorrow, 08-wear-what-you-own,
09-boutique-verdict, 10-seated, 11-accessibility, 12-get-dressed. Replace
with on-device captures when a Quest is available. Use only your own
full-length photo if you show the photo feature.

## Special awards

Worth claiming: **Best Agentic Interaction** (the stylist plans, acts on the
form, and you keep, refine or undo), **Best Reason to Come Back** (the morning
routine, Lay out tomorrow, wear log and streak, the anchored studio), **Best
First Five Minutes** (ghost-hand tour, a dressed form on first visit),
**Best Accessibility Forward Experience** (Access panel, tap-to-tailor, voice,
read aloud, Seated).
