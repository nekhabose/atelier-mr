# Atelier: competition scorecard (self-assessment)

Scores are honest estimates against the official rules and award
descriptions (Devpost, Meta VR Start Developer Competition 2026), not
judges' scores. "Before" is the state at the start of the Nov 13 improvement
round; "Now" is after it. Nothing has been verified on a physical Quest yet.

## Judging criteria (25% each)

| Criterion | Before | Now | Biggest remaining gaps |
|---|---|---|---|
| Innovation & Creativity | 72 | 74 | Mannequin stand-in rather than the user's body; procedural art |
| Experience Design | 66 | 71 | No real-device comfort pass; closet panel is busy |
| Technical Implementation | 60 | 67 | 60 fps on Quest unproven; UIKit panels are ~100 draw calls |
| Polish & Presentation | 52 | 58 | No video yet; emulator-only screenshots; stylised garments |
| **Weighted total** | **62.5** | **67.5** | |

## Prizes Atelier is eligible for (Productivity track, New Experience)

| Prize | Before | Now | What would raise it |
|---|---|---|---|
| Best New Productivity Experience ($70k) | 60 | 66 | Device-verified performance, a strong video, richer art |
| Best New Productivity Runner-up ($35k) | 60 | 66 | Same |
| Best Agentic Interaction ($25k) | 74 | 78 | Show plan -> act -> refine -> undo in the first 30 s of the video |
| Best Reason to Come Back ($25k) | 68 | 69 | Weekly recap or "closet growth" stats between sessions |
| Best First Five Minutes ($25k) | 62 | 66 | Shorter tour copy, payoff in under 60 s, tested by a newcomer |
| Boldest Original Concept ($25k) | 58 | 60 | Lean on "shop against your closet" and live tailoring in the pitch |
| Best Accessibility Forward Experience ($25k) | 35 | 38 | Large-text / high-contrast mode, one-hand and voice options |
| Best Social & Multiplayer Experience ($25k) | 10 | 10 | No social features (sharing a look by link would be the cheapest step) |
| Judge's Choice ($20k x2) | 55 | 60 | Overall polish and the video |
| Gaming / Entertainment tracks; Adapted division | n/a | n/a | Not eligible (different track or division) |

## What changed in this round

- Garments: soft drape folds deepening toward the hem, a wavy hem, relaxed
  bodice folds, sleeve wrinkles, pressed trouser creases; woven relief
  (normal maps) per fabric type; clearcoat only on satin.
- Performance: draw calls 390 -> 255 (garments, mannequin, hangers and swatch
  captions merged); cheap materials for rail miniatures and swatches; light,
  rate-limited rebuilds while a pin is dragged.
- Behaviour: the stylist acts instantly on-device and upgrades to the live AI
  if it answers in time (8 s cap); Undo during a preview closes it cleanly;
  the lookbook highlight follows the outfit; touching a pin no longer adds an
  empty undo step.
- Readability: large hover labels for rack items and swatches; larger swatch
  captions.

## Quest-like simulation (no headset)

`scripts/quest-sim.mjs` slows the emulator's CPU 4x and measures frame
times; `scripts/cpu-profile.mjs` shows where CPU time goes. Under 4x
slowdown Atelier's own code is about 0.2% of CPU time; dragging a pin costs
no more than idling. The rest is the engine, WebGL submission and the
emulator itself (which renders a simulated room a real Quest does not), so
the remaining lever is draw calls and material cost. The GPU cannot be
simulated; only a headset proves 60 fps.
