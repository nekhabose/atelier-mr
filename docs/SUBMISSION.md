# Atelier: Devpost submission kit

Deadline: **Nov 18, 2026, 12:00 PM PT**. Track: **Productivity**. Division: **New Experience**.

## Links

- Play: https://atelier-mr.vercel.app (mirror: https://nekhabose.github.io/atelier-mr/)
- Code: https://github.com/nekhabose/atelier-mr
- Video: _YouTube or Vimeo link, public, under 3:00_. Upload `docs/video/atelier-demo.mp4` (55 s, 1080p, narrated, music; kept out of git). How it is made: see Demo video below.
- No headset? Open the link on a desktop and press **Watch the 50-second tour**: it plays the real journey with captions.

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
Undo, redo, reset and turn the form without leaving your seat. The studio is
saved against a persistent world anchor, so next time it is waiting in the same
corner of your room.

The Digital Closet lets you recreate the clothes you actually own: pick a
template, colour and fabric, then pull the pins until the length and fit match.
The stylist then works for you, not as a chat window. Choose occasion, weather
and mood; it weighs every wearable combination in your closet, puts its best
idea on the form as a preview, and waits for you to Keep it, see the Next idea,
or Undo. Change the weather and it re-plans. Ask it to make the look warmer,
dressier or more colourful and it edits the garments on the form - lets a hem
down, adds sleeves, switches to knit or satin, layers your jacket - and tells
you what it changed. It also tells you which piece your closet is missing. The boutique turns shopping around: three original labels hang their pieces
on your rail, each tagged with how many new outfits it unlocks with what you
already own. Try one on and the boutique stylist tries it with your clothes and
says buy, maybe or skip, with the cost per new outfit. Add your photo and skin
tone on the start page (kept on your device) and the form becomes you.
Save the looks you love to a lookbook
and log an Outfit of the Day to keep a streak, a reason to come back each
morning. Share any look as a link or QR code: the outfit travels inside the
link, so nothing is uploaded, and opening it dresses your friend's form.

**Accessible by design.** An Access panel in the studio offers large text,
high contrast, calm motion (no bouncing, sliding or spinning), read aloud
(the panel speaks each change), voice commands ("style me", "undo",
"shorter", "turn", "share"), and tailoring without dragging: one-tap buttons
for hem, waist and sleeves, so every edit works with one hand and no grip.
Calm motion and high contrast follow the system's preferences by default.

**How we built it.** Atelier is built from scratch with Meta's Immersive Web SDK
(WebXR, Three.js, ECS) during the competition window. Garments, the mannequin
and 12 fabrics are procedural, with no downloaded models, so tailoring is real
geometry, not a swapped mesh. Scene understanding (detected planes) drives
placement. Spatial panels use UIKitML. The stylist runs as a Vercel Function
that calls Claude with structured, validated output and a server-side key; a
deterministic offline planner gives the same preview, keep and undo flow when the
network or the key is unavailable, so the studio never depends on a third-party
service.

**What's next.** A photo-to-garment flow to recreate clothes faster; voice
for choosing occasions; shared lookbooks; and on-device tuning for the Meta
VR Glasses' narrower view (the compact layout is emulator-tested).

## Hand interactions (optional field)

Every action works with a pinch, near or far, and nothing requires a
controller. Tap to wear a look; pinch-and-pull a tailoring pin (the cloth
rebuilds live); pinch a swatch and drop it on a garment; pinch the form and
twist to turn it; and tap the spatial panels. Everything is reachable from a
seat: the form, rack and board work at a distance with hand rays, and Turn,
Undo and Redo replace any need to stand up and walk around. A ghost hand
demonstrates the core gestures on first launch instead of a wall of text.
For people who cannot pinch-and-drag, the Access panel's tap buttons tailor
hem, waist and sleeves, and voice commands cover the main actions where the
browser supports speech recognition.

## Judge instructions

1. On Quest 3/3S, open **https://atelier-mr.vercel.app** in the Meta Quest
   Browser. Allow passthrough and hand tracking when asked; put controllers down.
2. Tap **Enter Atelier** (or accept the immersive prompt). The studio places
   itself on your floor; a ghost hand starts a 3-step tour (skip any time with
   **Tour**). Tap **Move studio** to re-place it in front of you.
3. Try: pinch a look on the rail, pull the coloured pins, drop a swatch on the
   jacket, tap **Turn**, then **Undo**.
4. On the left panel: **Ask stylist**, choose Interview / Cold / Classic,
   **Style me**, then **Next idea**, tap **Warmer** and watch the outfit change,
   then **Keep**.
5. Leave and come back: the studio returns to the same spot in your room.
6. **Save look** and **Wear today**; reload the page and your look, lookbook and
   streak are still there.
7. Tap **Access** on the right panel: try Large text, High contrast, and the
   Shorter / Waist in buttons. Tap **Share**, exit, and the start page shows
   the look's link and QR code.

No headset at hand: open the link on a desktop and press **Watch the 50-second
tour** (top right) for a captioned walk through the same journey.

Works without any API key (the stylist header shows "ON-DEVICE"). With the
server key configured it shows "LIVE AI".

## Works today vs. future

| Works today (verified in the IWSDK emulator and production URL) | Future |
|---|---|
| Room-aware placement on floor/wall planes, manual re-place, persistent anchor restore (emulator-verified) | Multi-anchor layouts (panels on separate surfaces) |
| 8 looks, live tailoring of 4 regions, undo/redo/reset/turn | More garment types (coats, shoes, accessories) |
| 12 fabrics applied per garment | Photo-to-garment closet entry |
| Digital Closet: create, edit, remove, persist (7 pieces) | Larger closet, categories, search |
| Stylist: 3 ranked distinct options, preview, keep, next, undo, re-plan, refine (warmer / dressier / colour edits on the form), closet gaps, offline fallback | Voice constraints, calendar and weather context |
| Lookbook (6) and Outfit of the Day streak; share a look by link or QR code | Shared lookbooks, friends' rails |
| Access panel: large text, high contrast, calm motion, read aloud, voice commands, tap-to-tailor | On-device check of speech features on Quest Browser |
| Boutique: 3 original labels, 15 pieces, try-on with your closet, buy / maybe / skip with new-outfit count and cost per outfit, add to closet | Official retailer feeds through partner programs |
| Face photo (device-only) and 6 skin tones on the form | Body measurements to size the form to you |
| Claude stylist live on the production URL (server-side key), offline fallback | Tuning for Meta VR Glasses on device |

Not yet verified: frame rate and hand tracking on a physical Quest, and
placement in real rooms. Read aloud and voice commands are feature-detected;
whether Quest Browser provides speech synthesis and recognition is not yet
verified (the toggles say so when a feature is missing). All testing so far used the Immersive Web Emulator
Runtime and desktop browsers.

## Demo video (55 s, ready to upload)

`docs/video/atelier-demo.mp4` is a mixed-reality cut recorded from the real
app in the Immersive Web Emulator's simulated living room: the studio is
placed on the room's floor by scene understanding, the opening reveal plays,
and the emulated headset moves through the studio like a person's head while
the tour drives the real systems. Captions are burned in; the soundtrack is an
original synthesised music bed, the app's kinds of UI sounds, and narration
from Piper neural text-to-speech (voice "Cori", trained on public-domain
LibriVox recordings), run locally. Describe it on Devpost as emulator footage
with a synthetic voice. Recording your own voice over the same lines
sounds better: save them as `docs/video/vo/l0.wav` ... `l10.wav` and run the mix
again.

Rebuild it:

```sh
npx @iwsdk/cli dev restart --ai-mode agent --allow-browser-automation   # hides emulator controls
npx @iwsdk/cli browser run scripts/record-mr-frames.mjs --timeout 110000
node scripts/frames-to-mp4.mjs docs/video/frames-mr docs/video/atelier-mr.mp4 --crop-toolbar
bash scripts/mix-video.sh docs/video/atelier-mr.mp4 docs/video/atelier-demo.mp4
npx @iwsdk/cli dev restart --ai-mode collaborate --allow-browser-automation
```

| Time | On screen | Narration |
|---|---|---|
| 0:00 | Studio settles into the living room, ATELIER title card | This is Atelier. A fashion studio, in your own room. |
| 0:05 | Wide view of the placed studio | It stands on your real floor, and remembers where you left it. |
| 0:09 | Head turns to the rail; Riviera Sundress drops onto the form | Tap a look on the rail. The form wears it, life size. |
| 0:14 | Close on the hem as the pin pulls it up | Pinch a pin and pull. The hem is real geometry, recut as you move. |
| 0:18 | Fabric library; velvet, then satin, on the dress | Drop a swatch to change the fabric: satin, velvet, denim, wool. |
| 0:24 | Stylist panel; preview badge over the form | Ask the stylist. It plans from your own closet, and puts its idea on the form. |
| 0:29 | Dressier refinement lands on the form | Say warmer, or dressier, and it edits the outfit for you. |
| 0:34 | Boutique rail; silk blouse tried on with a BUY verdict | The boutique shows what each piece adds to your closet, with an honest verdict. |
| 0:40 | Access panel open: large text, contrast, motion, voice, tap tailoring | Large text, high contrast, calm motion, voice, and tailoring by tap. |
| 0:46 | Head steps back; the form turns | Share a look with a link. Come back tomorrow; your studio is waiting. |
| 0:50 | End card with the URL | Atelier. Open it in your Quest browser. |

A flat-page version without sound (`docs/video/atelier-showcase.mp4`) comes
from `node scripts/record-showcase.mjs`. If you get time on a real Quest, a
10-second on-device clip of hands pinching a pin would be the strongest
addition (Meta Quest Developer Hub can record or cast).

## Screenshots

`docs/screenshots/` (Immersive Web Emulator, simulated living room):
01-studio (opening reveal), 02-stylist-preview (after "Warmer"), 03-turned,
04-closet-builder, 05-start-page (make the form you), 06-boutique-verdict,
07-glasses-compact-layout (Meta VR Glasses profile, area outside the glasses'
view masked black), 08-accessibility-panel (Large text and High contrast on). Replace with on-device captures when a Quest is available.
Use only your own face if you show the photo feature.

## Special awards

Worth claiming: **Best Agentic Interaction** (plan, act on the form, confirm or
undo, re-plan), **Best Reason to Come Back** (closet, lookbook, streak,
anchored studio), **Best First Five Minutes** (ghost-hand tour, instant
payoff), **Best Accessibility Forward Experience** (Access panel, tap-to-tailor,
voice, read aloud).
