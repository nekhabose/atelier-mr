"""Cut a narration take into its lines from hand-checked windows, with word
times from a transcript (Whisper, run on this Mac).

Each line is everything inside its window (take seconds), so soft first words
are kept. Pauses inside a line longer than --max-pause are shortened to it,
keeping the room sound (the head and tail of the pause, crossfaded). Each clip
is cleaned like split-voice.py does. Word times are mapped into each clip, so
the tour can act on the words it names.

    python3 scripts/cut-voice-lines.py docs/video/voice-take-2.m4a windows.json words.json

windows.json: [[start, end], ...] one per line of scripts/narration.txt.
words.json:   {"words": [{"w": "forecast", "s": 17.3}, ...]} (take seconds)
              and optional "targets": {"2": {"forecast": "forecast",
              "dresses": ["addresses", 0.18]}} (word -> transcript word, or
              [transcript word, seconds to add]).
"""
import argparse
import importlib.util
import json
import os
import subprocess

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('split_voice', os.path.join(HERE, 'split-voice.py'))
sv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sv)
SR = sv.SR


def speech_spans(x, thr_db, min_gap):
    """(start, end) samples of speech in x: frames above thr_db, joined across gaps shorter than min_gap."""
    hop = int(0.01 * SR)
    n = len(x) // hop
    e = 20 * np.log10(np.sqrt((x[: n * hop].reshape(n, hop) ** 2).mean(1)) + 1e-9)
    on = e > thr_db
    spans, i = [], 0
    while i < n:
        if on[i]:
            j = i
            while j < n and on[j]:
                j += 1
            spans.append([i * hop, j * hop])
            i = j
        else:
            i += 1
    merged = []
    for s in spans:
        if merged and s[0] - merged[-1][1] < min_gap * SR:
            merged[-1][1] = s[1]
        else:
            merged.append(s)
    return merged


def cut(audio, a, b, max_pause, thr_db):
    """One line from take seconds [a, b]: trimmed, long pauses shortened.
    Returns the samples and a function mapping take seconds to clip seconds."""
    x = audio[int(a * SR):int(b * SR)]
    spans = speech_spans(x, thr_db, max_pause)
    pre, post = int(0.08 * SR), int(0.12 * SR)
    s0 = max(0, spans[0][0] - pre)
    s1 = min(len(x), spans[-1][1] + post)
    keep = int(max_pause * SR)
    half = keep // 2
    fade = int(0.01 * SR)
    out, marks, pos = [], [], 0  # marks: (take sample, clip sample) at each kept piece start
    cur = s0
    for k in range(len(spans) - 1):
        g0, g1 = spans[k][1], spans[k + 1][0]
        if g1 - g0 <= keep:
            continue
        seg = x[cur:g0 + half].copy()
        marks.append((cur, pos))
        out.append(seg)
        pos += len(seg)
        cur = g1 - half
        # Crossfade the two halves of the pause.
        tail = x[cur:cur + fade].copy()
        n = min(fade, len(out[-1]), len(tail))
        if n:
            out[-1][-n:] = out[-1][-n:] * np.linspace(1, 0, n) + tail[:n] * np.linspace(0, 1, n)
            cur += n
    seg = x[cur:s1].copy()
    marks.append((cur, pos))
    out.append(seg)
    clip = np.concatenate(out).astype(np.float32)
    f = int(0.012 * SR)
    clip[:f] *= np.linspace(0, 1, f)
    clip[-f:] *= np.linspace(1, 0, f)

    def to_clip(t):
        s = int((t - a) * SR)
        best = marks[0]
        for m in marks:
            if m[0] <= s:
                best = m
        return round((best[1] + s - best[0]) / SR, 2)

    return clip, to_clip


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('take')
    ap.add_argument('windows')
    ap.add_argument('words')
    ap.add_argument('--max-pause', type=float, default=0.25)
    ap.add_argument('--thr', type=float, default=-48, help='speech threshold in dB (soft words count)')
    args = ap.parse_args()
    lines = sv.script_lines()
    windows = json.load(open(args.windows))
    meta_words = json.load(open(args.words))
    assert len(windows) == len(lines), f'{len(windows)} windows for {len(lines)} lines'
    audio = sv.decode(args.take)
    out_dir = os.path.join(sv.ROOT, 'docs', 'video', 'vo')
    lengths, speech, word_at = [], [], {}
    for i, ((a, b), text) in enumerate(zip(windows, lines)):
        clip, to_clip = cut(audio, a, b, args.max_pause, args.thr)
        tmp = os.path.join(out_dir, f'_raw{i}.f32')
        clip.tofile(tmp)
        subprocess.run(
            ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', tmp,
             '-af', 'highpass=f=80,afftdn=nf=-25,loudnorm=I=-18:TP=-2:LRA=7', '-ar', str(SR), '-ac', '1',
             os.path.join(out_dir, f'l{i}.wav')],
            check=True,
        )
        os.remove(tmp)
        length = round(len(clip) / SR, 2)
        lengths.append(length)
        speech.append([[0.08, round(length - 0.12, 3)]])
        for word, src in meta_words.get('targets', {}).get(str(i), {}).items():
            name, add = (src, 0.0) if isinstance(src, str) else src
            hits = [w for w in meta_words['words'] if a <= w['s'] < b and w['w'].lower().strip('.,?!') == name.lower()]
            if hits:
                word_at[f'{i}:{word.lower()}'] = to_clip(hits[0]['s'] + add)
            else:
                print(f'  line {i}: no "{name}" in the transcript for "{word}"')
        print(f'l{i:<2} {a:6.2f}-{b:6.2f} s -> {length:4.1f} s  {text}')
    with open(os.path.join(out_dir, 'lengths.json'), 'w') as f:
        json.dump({'found_by': 'own', 'lengths': lengths, 'speech': speech, 'words': word_at}, f)
    print(json.dumps(word_at))


if __name__ == '__main__':
    main()
