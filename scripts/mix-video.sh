#!/bin/bash
# Mix the narration, the music bed (ducked under the voice) and UI sounds onto
# the recorded story cut.
#   bash scripts/mix-video.sh docs/video/atelier-story.mp4 docs/video/atelier-demo.mp4
#
# Narration: docs/video/vo/l0.wav ... one clip per line of scripts/narration.txt
# (your own recording, split with scripts/split-voice.py; the tour is timed to
# it with scripts/tour-timing.py). Each line starts at its time in the
# recording (docs/video/frames-mr/cues.json gives when the tour started); if a
# line runs long, the next one waits until it ends. Sound effects follow the
# tour's recorded cues.
# With no clips yet, the cut gets music and sound effects only.
# (Written for the bash 3.2 that ships with macOS.)
set -euo pipefail
cd "$(dirname "$0")/.."
IN=${1:-docs/video/atelier-story.mp4}
OUT=${2:-docs/video/atelier-demo.mp4}
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$IN")
CUES=docs/video/frames-mr/cues.json
python3 scripts/soundtrack.py docs/video/music.wav docs/video/sfx.wav "$DUR" "$CUES" >/dev/null

# "<clip> <start ms>" for each clip that exists: its scene time, or later if
# the line before is still being spoken.
PLAN_FILE=$(mktemp)
python3 -c '
import json, os, subprocess
times = [float(l.split("|")[0]) for l in open("scripts/narration.txt") if l.strip() and not l.startswith("#")]
# Video seconds when the tour started (the recording begins a moment earlier).
offset = json.load(open("docs/video/frames-mr/cues.json")).get("offset", 0.0) if os.path.exists("docs/video/frames-mr/cues.json") else 0.0
times = [offset + t for t in times]
end = 0.0
for i, t in enumerate(times):
    f = "docs/video/vo/l%d.wav" % i
    if not os.path.exists(f):
        continue
    d = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f],
                             capture_output=True, text=True).stdout)
    start = max(t, end + 0.3)
    end = start + d
    print(f, int(start * 1000))
' > "$PLAN_FILE"
N=$(wc -l < "$PLAN_FILE" | tr -d ' ')

inputs=(-i "$IN" -i docs/video/music.wav -i docs/video/sfx.wav)
if [ "$N" -eq 0 ]; then
  echo "No narration clips in docs/video/vo: music and sound effects only."
  filter="[1:a]aecho=0.8:0.6:70|140:0.18|0.1,volume=0.75[m];[m][2:a]amix=inputs=2:normalize=0:duration=first,loudnorm=I=-16:TP=-1.5:LRA=11[aout]"
else
  chain=""
  labels=""
  i=0
  while read -r f ms; do
    inputs+=(-i "$f")
    chain+="[$((i + 3)):a]aresample=44100,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[v$i];"
    labels+="[v$i]"
    i=$((i + 1))
  done < "$PLAN_FILE"
  filter="${chain}${labels}amix=inputs=${N}:normalize=0,apad=whole_dur=${DUR},highpass=f=90,acompressor=threshold=0.1:ratio=3:attack=5:release=120,loudnorm=I=-17:TP=-2:LRA=7,asplit=2[vo][key];"
  filter+="[1:a]aecho=0.8:0.6:70|140:0.18|0.1,volume=0.75[m];[m][key]sidechaincompress=threshold=0.02:ratio=8:attack=30:release=500[duck];"
  filter+="[vo][duck][2:a]amix=inputs=3:normalize=0:duration=first,loudnorm=I=-16:TP=-1.5:LRA=11[aout]"
fi
rm -f "$PLAN_FILE"
ffmpeg -y -loglevel error "${inputs[@]}" -filter_complex "$filter" -map 0:v -map "[aout]" \
  -c:v copy -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart "$OUT"
echo "wrote $OUT"
