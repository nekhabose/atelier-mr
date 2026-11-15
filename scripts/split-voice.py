"""Split one narration take into the story's lines.

Record all the lines of scripts/narration.txt in order, in one take, with a
pause between lines. This finds the lines, cuts the take into one clip per
line, shortens long pauses inside a line (to --max-pause), cleans each clip
(low rumble off, light noise reduction, even loudness) and writes
docs/video/vo/l0.wav, l1.wav, ... plus docs/video/vo/lengths.json.

    python3 scripts/split-voice.py docs/video/voice-take.m4a

Finding the lines: first by pauses alone. A relaxed read often pauses inside a
line as long as between lines; then the pauses are matched to the script
instead (each line's length follows its word count, and lines break at the
longer pauses). The table it prints shows where each line was cut. A fluffed
line you re-read counts as extra speech: drop a piece with --skip (0-based
index from the first table, can repeat), or re-record.
"""
import argparse
import json
import os
import re
import subprocess
import sys

import numpy as np

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SR = 48000


def script_lines():
    path = os.path.join(ROOT, 'scripts', 'narration.txt')
    with open(path, encoding='utf-8') as f:
        return [l.split('|', 1)[1].strip() for l in f if l.strip() and not l.startswith('#')]


def pieces(path, noise_db, gap):
    """Speech pieces (start, end) between silences of at least `gap` seconds."""
    out = subprocess.run(
        ['ffmpeg', '-hide_banner', '-nostats', '-i', path, '-af', f'highpass=f=80,silencedetect=noise={noise_db}dB:d={gap}', '-f', 'null', '-'],
        capture_output=True, text=True,
    ).stderr
    starts = [float(x) for x in re.findall(r'silence_start: ([0-9.]+)', out)]
    ends = [float(x) for x in re.findall(r'silence_end: ([0-9.]+)', out)]
    total = float(re.search(r'Duration: (\d+):(\d+):([0-9.]+)', out).group(3)) + 60 * float(
        re.search(r'Duration: (\d+):(\d+)', out).group(2)) + 3600 * float(re.search(r'Duration: (\d+)', out).group(1))
    edges = [0.0]
    for s, e in zip(starts, ends + [total] * (len(starts) - len(ends))):
        edges += [s, e]
    edges.append(total)
    return [(a, b) for a, b in zip(edges[0::2], edges[1::2]) if b - a > 0.12]


def fit(parts, words, pause_weight=0.8):
    """Group speech pieces into len(words) lines: lengths follow word counts,
    breaks prefer long pauses. Dynamic programming over break positions."""
    n, lines = len(parts), len(words)
    gaps = [parts[k + 1][0] - parts[k][1] for k in range(n - 1)]

    def solve(rate):
        inf = float('inf')
        cost = [[inf] * (n + 1) for _ in range(lines + 1)]
        back = [[0] * (n + 1) for _ in range(lines + 1)]
        cost[0][0] = 0.0
        for i in range(1, lines + 1):
            for j in range(i, n + 1):
                for k in range(i - 1, j):
                    if cost[i - 1][k] == inf:
                        continue
                    want = rate * words[i - 1]
                    c = ((parts[j - 1][1] - parts[k][0] - want) / want) ** 2
                    if k > 0:
                        c -= pause_weight * min(gaps[k - 1], 2.0)
                    if cost[i - 1][k] + c < cost[i][j]:
                        cost[i][j] = cost[i - 1][k] + c
                        back[i][j] = k
        out, j = [], n
        for i in range(lines, 0, -1):
            k = back[i][j]
            out.append((k, j))
            j = k
        return out[::-1]

    rate = sum(b - a for a, b in parts) / sum(words)
    groups = solve(rate)
    for _ in range(3):
        rate = sum(parts[j - 1][1] - parts[k][0] for k, j in groups) / sum(words)
        groups = solve(rate)
    return [parts[k:j] for k, j in groups]


def decode(path):
    raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def assemble(audio, group, max_pause):
    """One line: its pieces, with pauses inside it shortened to max_pause.
    Also returns where each piece's speech sits in the clip (seconds)."""
    fade = int(0.012 * SR)
    out = []
    spans = []
    pos = 0
    for i, (s0, s1) in enumerate(group):
        a = max(0.0, s0 - (0.08 if i == 0 else 0.03))
        b = s1 + (0.12 if i == len(group) - 1 else 0.03)
        seg = audio[int(a * SR):int(b * SR)].copy()
        if len(seg) > 2 * fade:
            seg[:fade] *= np.linspace(0, 1, fade)
            seg[-fade:] *= np.linspace(1, 0, fade)
        if i > 0:
            gap = group[i][0] - group[i - 1][1]
            silence = np.zeros(int(min(gap, max_pause) * SR), dtype=np.float32)
            out.append(silence)
            pos += len(silence)
        spans.append([round((pos / SR) + (s0 - a), 3), round((pos / SR) + (s1 - a), 3)])
        out.append(seg)
        pos += len(seg)
    return np.concatenate(out), spans


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('take')
    ap.add_argument('--noise', type=float, default=-35, help='silence threshold in dB (default -35)')
    ap.add_argument('--gap', type=float, default=0.9, help='pause between lines for the first, pauses-only pass')
    ap.add_argument('--max-pause', type=float, default=0.35, help='longest pause kept inside a line, seconds')
    ap.add_argument('--skip', type=int, action='append', default=[], help='piece index to drop (a fluffed line)')
    args = ap.parse_args()
    lines = script_lines()
    words = [len(l.split()) for l in lines]

    coarse = [s for i, s in enumerate(pieces(args.take, args.noise, args.gap)) if i not in args.skip]
    fine = pieces(args.take, args.noise, 0.3)
    if len(coarse) == len(lines):
        groups = [[p for p in fine if p[0] >= a - 0.01 and p[1] <= b + 0.01] or [(a, b)] for a, b in coarse]
        how = 'pauses'
    else:
        print(f'Pauses alone give {len(coarse)} pieces for {len(lines)} lines; matching to the script instead.')
        groups = fit(fine, words)
        how = 'script'

    audio = decode(args.take)
    out_dir = os.path.join(ROOT, 'docs', 'video', 'vo')
    os.makedirs(out_dir, exist_ok=True)
    lengths = []
    speech = []
    for i, (group, text) in enumerate(zip(groups, lines)):
        line, spans = assemble(audio, group, args.max_pause)
        speech.append(spans)
        tmp = os.path.join(out_dir, f'_raw{i}.f32')
        line.astype(np.float32).tofile(tmp)
        dst = os.path.join(out_dir, f'l{i}.wav')
        subprocess.run(
            ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', tmp,
             '-af', 'highpass=f=80,afftdn=nf=-25,loudnorm=I=-18:TP=-2:LRA=7', '-ar', str(SR), '-ac', '1', dst],
            check=True,
        )
        os.remove(tmp)
        length = len(line) / SR
        lengths.append(round(length, 2))
        print(f'l{i:<2} {group[0][0]:6.2f}-{group[-1][1]:6.2f} s in the take -> {length:4.1f} s  {text}')
    with open(os.path.join(out_dir, 'lengths.json'), 'w') as f:
        json.dump({'found_by': how, 'lengths': lengths, 'speech': speech}, f)


if __name__ == '__main__':
    main()
