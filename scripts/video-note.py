"""Mark emulator footage honestly in the demo video.

Adds, in the paper-and-ink style of the app:
  - an opening note (first ~8 s): the footage is the Meta Quest emulator's
    simulated living room, and on a headset Atelier appears in your own room;
  - a small tag in the top-right corner for the rest of the video.

    python3 scripts/video-note.py docs/video/atelier-demo.mp4 docs/video/atelier-demo-noted.mp4

Needs ffmpeg and Pillow. The audio is copied unchanged.
"""
import os
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080
SERIF = '/System/Library/Fonts/Supplemental/Georgia.ttf'
SANS = '/System/Library/Fonts/Helvetica.ttc'
INK = (42, 35, 28)
PAPER = (244, 237, 225)
THREAD = (168, 68, 44)
NOTE_FROM, NOTE_TO = 0.4, 8.2


def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except OSError:
        return ImageFont.load_default()


def note_png(path):
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    title = font(SERIF, 40)
    body = font(SANS, 30)
    lines = [('Recorded in the Meta Quest emulator’s simulated living room.', title),
             ('On your headset, Atelier appears in your own room.', body)]
    widths = [d.textlength(t, font=f) for t, f in lines]
    bw = int(max(widths)) + 96
    bh = 150
    x0 = (W - bw) // 2
    y0 = 70
    d.rounded_rectangle([x0, y0, x0 + bw, y0 + bh], radius=22, fill=PAPER + (240,), outline=(216, 204, 182, 255), width=3)
    d.rectangle([x0 + 48, y0 + 30, x0 + 48 + 70, y0 + 34], fill=THREAD + (255,))
    d.text((x0 + 48, y0 + 44), lines[0][0], font=title, fill=INK + (255,))
    d.text((x0 + 48, y0 + 98), lines[1][0], font=body, fill=(74, 64, 54, 255))
    im.save(path)


def tag_png(path):
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    f = font(SANS, 24)
    text = 'Quest emulator · simulated room'
    tw = int(d.textlength(text, font=f))
    x1 = W - 36
    x0 = x1 - tw - 40
    y0 = 30
    d.rounded_rectangle([x0, y0, x1, y0 + 46], radius=23, fill=(42, 35, 28, 170))
    d.text((x0 + 20, y0 + 10), text, font=f, fill=(247, 241, 230, 235))
    im.save(path)


def main():
    src, dst = sys.argv[1], sys.argv[2]
    tmp = tempfile.mkdtemp()
    note = os.path.join(tmp, 'note.png')
    tag = os.path.join(tmp, 'tag.png')
    note_png(note)
    tag_png(tag)
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src],
                               capture_output=True, text=True, check=True).stdout)
    f = (
        f'[1:v]format=rgba,fade=t=in:st={NOTE_FROM}:d=0.4:alpha=1,fade=t=out:st={NOTE_TO - 0.5}:d=0.5:alpha=1[n];'
        f'[2:v]format=rgba,fade=t=in:st={NOTE_TO - 0.3}:d=0.6:alpha=1[t];'
        f'[0:v][n]overlay=0:0:enable=\'between(t,{NOTE_FROM},{NOTE_TO})\'[a];'
        f'[a][t]overlay=0:0:enable=\'gte(t,{NOTE_TO - 0.3})\',format=yuv420p[v]'
    )
    subprocess.run([
        'ffmpeg', '-y', '-loglevel', 'error', '-i', src,
        '-loop', '1', '-t', f'{dur:.3f}', '-i', note,
        '-loop', '1', '-t', f'{dur:.3f}', '-i', tag,
        '-filter_complex', f, '-map', '[v]', '-map', '0:a?',
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-c:a', 'copy', '-movflags', '+faststart', dst,
    ], check=True)
    print(f'wrote {dst}')


if __name__ == '__main__':
    main()
