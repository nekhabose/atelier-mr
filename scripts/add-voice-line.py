"""Add (or redo) one narration line from its own recording.

Record just that line (Voice Memos is fine; re-reading it a few times in the
same file is fine too). This finds each read, keeps the last one (or the one
you pick with --read), cleans it exactly as split-voice.py cleans the others,
writes docs/video/vo/l<N>.wav and updates its length in lengths.json. Then run
scripts/tour-timing.py so the tour is timed to it.

    python3 scripts/add-voice-line.py ~/Downloads/ask.m4a --line 4
"""
import argparse
import importlib.util
import json
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('split_voice', os.path.join(HERE, 'split-voice.py'))
sv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sv)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('take')
    ap.add_argument('--line', type=int, required=True, help='0-based line of scripts/narration.txt')
    ap.add_argument('--read', type=int, default=-1, help='which read to keep (0-based; default the last)')
    ap.add_argument('--noise', type=float, default=-35, help='silence threshold in dB (default -35)')
    ap.add_argument('--gap', type=float, default=1.2, help='a pause at least this long separates two reads')
    ap.add_argument('--max-pause', type=float, default=0.35, help='longest pause kept inside the line, seconds')
    args = ap.parse_args()
    text = sv.script_lines()[args.line]

    reads = sv.pieces(args.take, args.noise, args.gap)
    fine = sv.pieces(args.take, args.noise, 0.3)
    for k, (a, b) in enumerate(reads):
        print(f'read {k}: {a:6.2f}-{b:6.2f} s ({b - a:4.1f} s)')
    a, b = reads[args.read]
    group = [p for p in fine if p[0] >= a - 0.01 and p[1] <= b + 0.01] or [(a, b)]

    audio = sv.decode(args.take)
    line, spans = sv.assemble(audio, group, args.max_pause)
    out_dir = os.path.join(sv.ROOT, 'docs', 'video', 'vo')
    tmp = os.path.join(out_dir, f'_raw{args.line}.f32')
    line.astype('float32').tofile(tmp)
    dst = os.path.join(out_dir, f'l{args.line}.wav')
    subprocess.run(
        ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'f32le', '-ar', str(sv.SR), '-ac', '1', '-i', tmp,
         '-af', 'highpass=f=80,afftdn=nf=-25,loudnorm=I=-18:TP=-2:LRA=7', '-ar', str(sv.SR), '-ac', '1', dst],
        check=True,
    )
    os.remove(tmp)
    length = round(len(line) / sv.SR, 2)

    meta_path = os.path.join(out_dir, 'lengths.json')
    with open(meta_path) as f:
        meta = json.load(f)
    meta['lengths'][args.line] = length
    meta['speech'][args.line] = spans
    # Word times for this line are found again from the new clip.
    meta['words'] = {k: v for k, v in meta.get('words', {}).items() if not k.startswith(f'{args.line}:')}
    meta['placeholder'] = [i for i in meta.get('placeholder', []) if i != args.line]
    with open(meta_path, 'w') as f:
        json.dump(meta, f)
    print(f'l{args.line} <- read {args.read % len(reads)}: {length:.2f} s  {text}')


if __name__ == '__main__':
    main()
