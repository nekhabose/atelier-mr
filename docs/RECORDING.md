# Recording the narration

The demo video tells one story, a real morning, in 14 short lines. Your own
voice makes it yours (and Devpost asks entries not to lean on AI-generated
media). It takes about five minutes.

## How to record

1. Somewhere quiet, with soft things around you (a bedroom is better than a
   kitchen). Phone or Mac, about a hand's length from your mouth.
2. Mac: QuickTime Player, **File > New Audio Recording**. iPhone: Voice Memos.
3. Read all 14 lines **in order, in one take**, with a clear pause (count two
   seconds) between lines. Speak the way you would tell a friend about your
   morning, not like an advert.
4. Fluffed a line? Pause, and read that line again. Tell me which piece to
   drop, or just re-record the whole take.
5. Save it as `docs/video/voice-take.m4a` in the project (that folder is kept
   out of git, so your voice is not published with the code). Then tell me,
   and I split, clean and place the lines, or run:

```sh
python3 scripts/split-voice.py docs/video/voice-take.m4a
python3 scripts/tour-timing.py
```

then record the picture again and mix (the steps are under Demo video in
`docs/SUBMISSION.md`).

Each line has a rough time budget. Going over is fine: the tour is timed to
your recording (`scripts/tour-timing.py`), so the picture waits for your voice.

## The lines

1. Seven forty. Rain later, an interview at ten, and a closet full of clothes I hardly wear.  _(up to 8 s)_
2. So I put on my headset, and my own room becomes a fitting studio.  _(up to 6 s)_
3. Atelier checks today's forecast and my calendar, and dresses the form from my own closet.  _(up to 7 s)_
4. It's an interview, so I want it sharper. I say dressier, and the outfit changes.  _(up to 6 s)_
5. For tonight, I take a dress from the rail.  _(up to 4 s)_
6. It's too long for me, so I pinch my own leg at the knee, and the hem moves there.  _(up to 7 s)_
7. Or I pull a pin, and the tape measure reads the length as I go.  _(up to 5 s)_
8. A different fabric? I drop a swatch on it: satin, then silk.  _(up to 6 s)_
9. Before bed, I lay out tomorrow's outfit, and in the morning it's waiting for me.  _(up to 6 s)_
10. It shows me what I never wear, what it costs per wear, and builds a look around it.  _(up to 7 s)_
11. Before I buy something new, it counts the outfits it would add, and gives me an honest verdict.  _(up to 8 s)_
12. And when I sit down, the whole studio comes within reach.  _(up to 6 s)_
13. Large text, high contrast, calm motion, voice, and tailoring by tap are all built in.  _(up to 6 s)_
14. Atelier. Get dressed for your real day. Open it in your Quest browser today.  _(up to 7 s)_
