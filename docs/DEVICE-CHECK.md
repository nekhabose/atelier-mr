# Device check: Quest numbers in 5 minutes, no setup

Judging asks for at least 60 fps on Meta Quest hardware. Atelier is a web link,
so any Quest can measure it: no install, no developer mode, no cable.

## On any Quest

1. Open the Meta Quest Browser and go to **atelier-mr.vercel.app/?check**
2. Tap **Enter the studio**; allow hand tracking if asked.
3. Wait 30 seconds without touching anything. The check wears looks, tailors,
   changes fabrics, turns the form, runs the stylist and the boutique on its
   own, and records every frame.
4. A results card appears above the form: average and 1%-low frame rate, the
   worst frame, the share of frames slower than 60 fps, draw calls and
   triangles, the quality tier, the refresh rate, and what the headset granted
   (hands, planes, meshes, anchors, depth).
5. Take a screenshot: press the **Meta button**, then the **trigger** (or
   pinch on the camera icon). Leaving the studio shows the same results on the
   start page with **Copy the results**.

## What the numbers mean

- **avg fps** should be at or above 60 (Quest 3 runs at 72 Hz, so 70-72 is the
  goal); **1% low** shows the worst moments.
- **quality** "full" means the governor never needed to step down; "reduced"
  or "light" means it traded detail to hold the frame rate.
- Emulator runs (on a computer) are not device numbers: the check reports the
  device it ran on.
