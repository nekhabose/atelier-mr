# Atelier: Devpost submission kit

Deadline: **Nov 18, 2026, 12:00 PM PT**. Track: **Productivity**. Division: **New Experience**.

## Links

- Play: https://atelier-mr.vercel.app (mirror: https://nekhabose.github.io/atelier-mr/)
- Code: https://github.com/nekhabose/atelier-mr
- Video: _YouTube or Vimeo link, public, under 3:00_

## Name and tagline

**Atelier**

Tagline (128 characters):

> Your personal AI fashion studio in mixed reality: dress, tailor and style your own clothes with your hands, right in your room.

## Description (about 450 words)

**Inspiration.** Getting dressed is a daily, physical decision, but every
wardrobe app treats clothes as flat photos in a grid. You can't feel how a
hem change moves a silhouette, or hold a fabric against a garment, on a phone.
Atelier is a fashion studio in your real room: a life-size dress form you can
dress, tailor and style with your hands, built around a moment you have every
morning.

**What it does.** When you enter, Atelier reads your room and stands the
studio on your real floor: the rack, form and fabric library snap against a
nearby wall when one is detected, or face you when none is. Pinch any of eight
designer looks to dress the form. Pull the coloured pins to change hem,
neckline, sleeves and waist; the garment is regenerated from measurements every
frame while you drag. Drop a swatch onto one layer of the outfit (satin, velvet,
silk, denim, linen, plaid, pinstripe and more) and only that piece changes.
Undo, redo, reset and turn the form without leaving your seat.

The Digital Closet lets you recreate the clothes you actually own: pick a
template, colour and fabric, then pull the pins until the length and fit match.
The stylist then works for you, not as a chat window. Choose occasion, weather
and mood; it weighs every wearable combination in your closet, puts its best
idea on the form as a preview, and waits for you to Keep it, see the Next idea,
or Undo. Change the weather and it re-plans. It also tells you which piece your
closet is missing for that kind of day. Save the looks you love to a lookbook
and log an Outfit of the Day to keep a streak, a reason to come back each
morning.

**How we built it.** Atelier is built from scratch with Meta's Immersive Web SDK
(WebXR, Three.js, ECS) during the competition window. Garments, the mannequin
and 12 fabrics are procedural, with no downloaded models, so tailoring is real
geometry, not a swapped mesh. Scene understanding (detected planes) drives
placement. Spatial panels use UIKitML. The stylist runs as a Vercel Function
that calls Claude with structured, validated output and a server-side key; a
deterministic offline planner gives the same preview, keep and undo flow when the
network or the key is unavailable, so the studio never depends on a third-party
service.

**What's next.** Persistent spatial anchors so the studio returns to the same
corner of your room; a photo-to-garment flow to recreate clothes faster; voice
for choosing occasions; sharing lookbooks with friends; and tuning on the Meta
VR Glasses' narrower view.

## Hand interactions (optional field)

Every action works with a pinch, near or far, and nothing requires a
controller. Tap to wear a look; pinch-and-pull a tailoring pin (the cloth
rebuilds live); pinch a swatch and drop it on a garment; pinch the form and
twist to turn it; and tap the spatial panels. Everything is reachable from a
seat: the form, rack and board work at a distance with hand rays, and Turn,
Undo and Redo replace any need to stand up and walk around. A ghost hand
demonstrates the three core gestures on first launch instead of a wall of text.

## Judge instructions

1. On Quest 3/3S, open **https://atelier-mr.vercel.app** in the Meta Quest
   Browser. Allow passthrough and hand tracking when asked; put controllers down.
2. Tap **Enter Atelier** (or accept the immersive prompt). The studio places
   itself on your floor; a ghost hand starts a 3-step tour (skip any time with
   **Tour**). Tap **Move studio** to re-place it in front of you.
3. Try: pinch a look on the rail, pull the coloured pins, drop a swatch on the
   jacket, tap **Turn**, then **Undo**.
4. On the left panel: **Ask stylist**, choose Interview / Cold / Classic,
   **Style me**, then **Next idea**, change the weather, then **Keep**.
5. **Save look** and **Wear today**; reload the page and your look, lookbook and
   streak are still there.

Works without any API key (the stylist shows "OFFLINE"). With the key
configured it shows "CLAUDE".

## Works today vs. future

| Works today (verified in the IWSDK emulator and production URL) | Future |
|---|---|
| Room-aware placement on floor/wall planes, manual re-place | Persistent spatial anchors across sessions |
| 8 looks, live tailoring of 4 regions, undo/redo/reset/turn | More garment types (coats, shoes, accessories) |
| 12 fabrics applied per garment | Photo-to-garment closet entry |
| Digital Closet: create, edit, remove, persist (7 pieces) | Larger closet, categories, search |
| Stylist: 3 ranked distinct options, preview, keep, next, undo, re-plan, closet gaps, offline fallback | Voice constraints, calendar and weather context |
| Lookbook (6) and Outfit of the Day streak | Sharing, social lookbooks |
| Claude stylist endpoint deployed, guarded, awaiting key | Tuning for Meta VR Glasses field of view |

Not yet verified: frame rate and hand tracking on a physical Quest, and
placement in real rooms. All testing so far used the Immersive Web Emulator
Runtime and desktop browsers.

## Demo video storyboard (2:40)

Capture on Quest (Meta Quest Developer Hub casting or on-device recording) or
the IWSDK emulator. Show only real footage; no AI-generated video.

| Time | Shot | Voice-over / caption |
|---|---|---|
| 0:00-0:12 | Enter Atelier in passthrough; studio lands on the real floor with the gold ring | "Your room is now a fashion studio." |
| 0:12-0:30 | Pinch Velvet Hour; outfit drops on; pull the hem pin, the dress shortens live | "Dress it, then tailor it, with your hands." |
| 0:30-0:45 | Drag a satin swatch onto only the jacket; tap Turn to see the back | "Fabric per garment. Turn without standing up." |
| 0:45-1:00 | Undo, Redo, Reset look | "Experiment freely; every change is undoable." |
| 1:00-1:25 | Closet: New piece, Dress, green, satin, pull pins to match, Save | "Recreate the clothes you actually own." |
| 1:25-2:05 | Ask stylist: Interview, Cold, Classic, Style me; preview badge; Next idea; switch to Warm, it re-plans; Keep | "It plans from your closet, shows you, and waits for your call." |
| 2:05-2:25 | Save look, Wear today, streak badge turns gold; reload, look restored | "Save the looks you love; come back tomorrow." |
| 2:25-2:40 | Wide shot of the studio; title card with URL | "Atelier. Open it in your Quest browser." |

## Screenshots

`docs/screenshots/` (IWSDK emulator, Quest 3 profile, simulated living room):
01-studio, 02-stylist-preview, 03-turned, 04-closet-builder. Replace with
on-device captures when a Quest is available.

## Readiness scorecard (self-assessment)

| Criterion (25% each) | Strengths | Gaps to close |
|---|---|---|
| Innovation & Creativity | Life-size tailoring with real generated geometry; room-aware studio; stylist that acts on a 3D form | Anchors not yet used |
| Experience Design | Seated, ray and pinch at distance; ghost-hand tour; undo everywhere; daily loop | Needs a real-device comfort pass; panels sit low for very tall standing users |
| Technical Implementation | ECS systems, procedural assets, scene understanding, validated serverless AI with offline fallback, typecheck + regression script | 60 fps on Quest unmeasured (emulator: p50 16.7 ms display-capped, p95 33.9 ms on desktop) |
| Polish & Presentation | Cohesive brass and walnut studio, chime, wear animation, editorial panel copy | Video and on-device screenshots still to capture |

Special awards worth claiming: **Best Agentic Interaction** (plan, act on the
form, confirm or undo, re-plan), **Best Reason to Come Back** (closet, lookbook,
streak), **Best First Five Minutes** (ghost-hand tour, instant payoff).
