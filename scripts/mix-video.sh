#!/bin/bash
# Mix narration, the music bed (ducked under the voice) and UI sounds onto a
# recorded cut. Narration lines are docs/video/vo/l0.aiff ... l10.wav (Piper neural
# TTS; .aiff from macOS `say` is the fallback), or replace them with your own recordings of the same
# lines, keeping the file names), placed at the times below.
#   bash scripts/mix-video.sh docs/video/atelier-mr.mp4 docs/video/atelier-demo.mp4
set -euo pipefail
cd "$(dirname "$0")/.."
IN=${1:-docs/video/atelier-mr.mp4}
OUT=${2:-docs/video/atelier-demo.mp4}
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$IN")
python3 scripts/soundtrack.py docs/video/music.wav docs/video/sfx.wav "$DUR" >/dev/null
TIMES=(0.7 5.4 9.4 13.9 18.7 23.9 29.4 34.4 40.6 46.1 50.3)
inputs=(-i "$IN" -i docs/video/music.wav -i docs/video/sfx.wav)
chain=""
labels=""
for i in "${!TIMES[@]}"; do
  # Prefer l<i>.wav (neural voice or your own recording), else l<i>.aiff (macOS say).
  f="docs/video/vo/l$i.wav"; [ -f "$f" ] || f="docs/video/vo/l$i.aiff"
  inputs+=(-i "$f")
  ms=$(python3 -c "print(int(${TIMES[$i]}*1000))")
  chain+="[$((i + 3)):a]aresample=44100,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[v$i];"
  labels+="[v$i]"
done
n=${#TIMES[@]}
filter="${chain}${labels}amix=inputs=${n}:normalize=0,apad=whole_dur=${DUR},highpass=f=90,acompressor=threshold=0.1:ratio=3:attack=5:release=120,aecho=0.8:0.4:35:0.1,loudnorm=I=-17:TP=-2:LRA=7,asplit=2[vo][key];"
filter+="[1:a]aecho=0.8:0.6:70|140:0.18|0.1,volume=0.75[m];[m][key]sidechaincompress=threshold=0.02:ratio=8:attack=30:release=500[duck];"
filter+="[vo][duck][2:a]amix=inputs=3:normalize=0:duration=first,loudnorm=I=-16:TP=-1.5:LRA=11[aout]"
ffmpeg -y -loglevel error "${inputs[@]}" -filter_complex "$filter" -map 0:v -map "[aout]" \
  -c:v copy -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart "$OUT"
echo "wrote $OUT"
