"""Original music bed and UI sound effects for the demo video (no samples,
no third-party audio): a soft chord pad, a plucked arpeggio, a bass line, and
the app's own kinds of sounds (sparkle, swish, tick, settle) at the moments
the tour acts.

    python3 scripts/soundtrack.py docs/video/music.wav docs/video/sfx.wav 56
"""
import sys
import wave

import numpy as np

SR = 44100


def note(name):
    names = {'C': -9, 'D': -7, 'E': -5, 'F': -4, 'G': -2, 'A': 0, 'B': 2}
    n = names[name[0]] + (int(name[-1]) - 4) * 12
    return 440.0 * 2 ** (n / 12)


CHORDS = [
    ['F3', 'A3', 'C4', 'E4'],
    ['A3', 'C4', 'E4', 'G4'],
    ['D3', 'F3', 'A3', 'C4', 'E4'],
    ['C3', 'E3', 'G3', 'B3', 'D4'],
]
BASS = ['F2', 'A2', 'D2', 'C2']
BAR = 8.0


def write(path, stereo):
    data = np.clip(stereo, -1, 1)
    pcm = (data * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def music(total):
    t = np.arange(int(total * SR)) / SR
    left = np.zeros_like(t)
    right = np.zeros_like(t)
    n_bars = int(np.ceil(total / BAR)) + 1
    for b in range(n_bars):
        chord = CHORDS[b % len(CHORDS)]
        start = b * BAR - 1.0
        # Raised-cosine window: 2 s crossfades between chords.
        x = (t - start) / (BAR + 2.0)
        win = np.where((x > 0) & (x < 1), np.sin(np.pi * np.clip(x, 0, 1)) ** 2, 0.0)
        if not win.any():
            continue
        for i, nm in enumerate(chord):
            f = note(nm)
            for det, pan in ((0.9985, 0.3), (1.0015, 0.7)):
                ph = 2 * np.pi * f * det * t + i
                v = (np.sin(ph) + 0.18 * np.sin(2 * ph)) * win * 0.045
                left += v * (1 - pan)
                right += v * pan
        fb = note(BASS[b % len(BASS)])
        bass = np.sin(2 * np.pi * fb * t) * win * 0.09
        left += bass
        right += bass
    # Plucked arpeggio from the first caption to the end card.
    step = 60 / 96 / 2
    k = 0
    tt = 5.0
    while tt < total - 5.5:
        bar = int(tt // BAR)
        chord = CHORDS[bar % len(CHORDS)]
        nm = chord[[0, 2, 1, 3, 2, 1][k % 6] % len(chord)]
        f = note(nm) * 2
        i0 = int(tt * SR)
        n = int(0.9 * SR)
        seg = np.arange(n) / SR
        env = np.exp(-seg / 0.32) * (1 - np.exp(-seg / 0.004))
        tone = (np.sin(2 * np.pi * f * seg) + 0.25 * np.sin(4 * np.pi * f * seg)) * env * 0.05
        pan = 0.35 + 0.3 * ((k % 4) / 3)
        end = min(len(t), i0 + n)
        left[i0:end] += tone[: end - i0] * (1 - pan)
        right[i0:end] += tone[: end - i0] * pan
        tt += step
        k += 1
    # Gentle tremolo, fade in and out.
    trem = 1 + 0.08 * np.sin(2 * np.pi * 0.11 * t)
    fade = np.clip(t / 2.5, 0, 1) * np.clip((total - t) / 4.0, 0, 1)
    return np.stack([left * trem * fade, right * trem * fade], axis=1)


def sfx(total):
    out = np.zeros((int(total * SR), 2))
    rng = np.random.default_rng(7)

    def add(at, sig, pan=0.5, gain=1.0):
        i0 = int(at * SR)
        end = min(len(out), i0 + len(sig))
        if end <= i0:
            return
        out[i0:end, 0] += sig[: end - i0] * (1 - pan) * gain
        out[i0:end, 1] += sig[: end - i0] * pan * gain

    def sparkle(at):
        for j, f in enumerate([1318.5, 1568.0, 1975.5, 2637.0]):
            n = int(0.6 * SR)
            s = np.arange(n) / SR
            add(at + j * 0.06, np.sin(2 * np.pi * f * s) * np.exp(-s / 0.18) * 0.09, 0.3 + 0.15 * j)

    def swish(at):
        n = int(0.42 * SR)
        s = np.arange(n) / SR
        noise = rng.standard_normal(n)
        # Moving one-pole low-pass for a sweep.
        y = np.zeros(n)
        acc = 0.0
        for i in range(n):
            a = 0.04 + 0.5 * (i / n)
            acc += a * (noise[i] - acc)
            y[i] = acc
        env = np.sin(np.pi * s / s[-1]) ** 2
        add(at, y * env * 0.16, 0.6)

    def tick(at):
        n = int(0.03 * SR)
        s = np.arange(n) / SR
        add(at, np.sin(2 * np.pi * 2300 * s) * np.exp(-s / 0.006) * 0.08, 0.55)

    def settle(at):
        n = int(0.4 * SR)
        s = np.arange(n) / SR
        add(at, np.sin(2 * np.pi * (150 - 60 * s) * s) * np.exp(-s / 0.12) * 0.22, 0.5)

    # Cues for the story cut (the tour's own times; see showcase-system.ts).
    settle(8.6)                   # the studio lands in the room
    sparkle(9.8)                  # title card
    sparkle(16.6)                 # dressed for today
    sparkle(23.6)                 # refined: dressier
    swish(29.9)                   # a dress from the rail
    sparkle(35.1)                 # marked at the knee
    for j in range(16):           # pulling the hem pin
        tick(40.4 + j * 0.15)
    settle(46.4)                  # satin
    settle(48.4)                  # silk
    swish(52.1)                   # tomorrow laid out
    sparkle(58.6)                 # a look around the least worn piece
    swish(66.1)                   # boutique try-on
    settle(72.3)                  # seated layout
    settle(78.7)                  # standing again
    settle(85.1)                  # turn
    settle(87.6)                  # turn
    sparkle(90.6)                 # end card
    return out


if __name__ == '__main__':
    music_path, sfx_path, total = sys.argv[1], sys.argv[2], float(sys.argv[3])
    write(music_path, music(total))
    write(sfx_path, sfx(total))
    print('ok')
