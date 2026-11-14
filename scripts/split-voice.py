"""Split one narration take into the story's lines.

Record all the lines of scripts/narration.txt in order, in one take, with a
clear pause (about two seconds) between lines. This finds the pauses, cuts the
take into one clip per line, cleans each clip (low rumble off, light noise
reduction, even loudness) and writes docs/video/vo/l0.wav, l1.wav, ...

    python3 scripts/split-voice.py docs/video/voice-take.m4a

If it finds a different number of lines than the script has, it lists what it
found (start and length of each piece) and writes nothing; try --noise -40 for
a noisy room, or --gap 0.7 for shorter pauses. A fluffed line you re-read
right away counts as an extra piece: drop it with --skip 3 (0-based, can repeat).
"""
import argparse
import os
import re
import subprocess
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')


def lines():
    path = os.path.join(ROOT, 'scripts', 'narration.txt')
    with open(path, encoding='utf-8') as f:
        return [l.split('|', 1)[1].strip() for l in f if l.strip() and not l.startswith('#')]


def duration(path):
    out = subprocess.run(
        ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
        capture_output=True, text=True, check=True,
    )
    return float(out.stdout.strip())


def speech_spans(path, noise_db, gap):
    out = subprocess.run(
        ['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', f'highpass=f=80,silencedetect=noise={noise_db}dB:d={gap}', '-f', 'null', '-'],
        capture_output=True, text=True,
    ).stderr
    starts = [float(x) for x in re.findall(r'silence_start: ([0-9.]+)', out)]
    ends = [float(x) for x in re.findall(r'silence_end: ([0-9.]+)', out)]
    total = duration(path)
    # Speech is what lies between silences.
    edges = [0.0]
    for s, e in zip(starts, ends + [total] * (len(starts) - len(ends))):
        edges += [s, e]
    edges.append(total)
    spans = []
    for a, b in zip(edges[0::2], edges[1::2]):
        if b - a > 0.35:  # ignore clicks and breaths
            spans.append((a, b))
    return spans


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('take')
    ap.add_argument('--noise', type=float, default=-35, help='silence threshold in dB (default -35)')
    ap.add_argument('--gap', type=float, default=0.9, help='shortest pause between lines, seconds')
    ap.add_argument('--skip', type=int, action='append', default=[], help='piece index to drop (a fluffed line)')
    args = ap.parse_args()
    want = lines()
    spans = [s for i, s in enumerate(speech_spans(args.take, args.noise, args.gap)) if i not in args.skip]
    if len(spans) != len(want):
        print(f'Found {len(spans)} spoken pieces, the script has {len(want)} lines. Nothing written.')
        for i, (a, b) in enumerate(spans):
            print(f'  piece {i}: starts {a:6.2f} s, {b - a:4.1f} s long')
        sys.exit(1)
    out_dir = os.path.join(ROOT, 'docs', 'video', 'vo')
    os.makedirs(out_dir, exist_ok=True)
    for i, ((a, b), text) in enumerate(zip(spans, want)):
        a = max(0.0, a - 0.08)
        b = b + 0.12
        dst = os.path.join(out_dir, f'l{i}.wav')
        subprocess.run(
            ['ffmpeg', '-y', '-loglevel', 'error', '-ss', f'{a:.3f}', '-to', f'{b:.3f}', '-i', args.take,
             '-af', 'highpass=f=80,afftdn=nf=-25,loudnorm=I=-18:TP=-2:LRA=7,afade=t=in:d=0.03,areverse,afade=t=in:d=0.06,areverse',
             '-ar', '48000', '-ac', '1', dst],
            check=True,
        )
        print(f'l{i}.wav  {b - a:4.1f} s  {text}')


if __name__ == '__main__':
    main()
