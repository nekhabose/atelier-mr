#!/bin/bash
# Generate the narration lines (docs/video/vo/l<i>.wav) from scripts/narration.txt
# with Piper neural TTS. Point PIPER_PY at a Python with `piper-tts`, PIPER_VOICE
# at a voice .onnx (we use en_GB-cori-high) and PIPER_DATA at a copy of its
# espeak-ng-data directory on a short path. Or record your own lines with the
# same file names instead.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p docs/video/vo
i=0
grep -v '^#' scripts/narration.txt | while IFS='|' read -r _ line; do
  echo "$line" | "$PIPER_PY" scripts/tts_piper.py "$PIPER_VOICE" "$PIPER_DATA" 1.0 "docs/video/vo/l$i.wav"
  printf '%2d %5.2fs  %s\n' "$i" "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "docs/video/vo/l$i.wav")" "$line"
  i=$((i + 1))
done
