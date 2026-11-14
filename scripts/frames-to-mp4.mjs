// Turns captured screencast frames (frames.txt: "<file> <timestamp>" lines)
// into a 30 fps H.264 MP4, keeping each frame's real duration.
//   node scripts/frames-to-mp4.mjs docs/video/frames-mr docs/video/atelier-mr.mp4 [--crop-toolbar]
// --crop-toolbar trims the managed window's Runtime/Editor toolbar (top 40 px)
// and scales back to 1080p (about a 4% zoom).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const crop = process.argv.includes('--crop-toolbar') ? 'crop=1849:1040:35:40,' : '';
const dir = resolve(args[0] ?? 'docs/video/frames-mr');
const out = resolve(args[1] ?? 'docs/video/atelier-mr.mp4');
const rows = readFileSync(join(dir, 'frames.txt'), 'utf8').trim().split('\n').map((l) => {
  const i = l.lastIndexOf(' ');
  return { file: l.slice(0, i), t: Number(l.slice(i + 1)) };
});
const lines = [];
rows.forEach((r, i) => {
  const next = rows[i + 1]?.t ?? r.t + 1 / 30;
  lines.push(`file '${r.file}'`, `duration ${Math.max(0.001, next - r.t).toFixed(4)}`);
});
lines.push(`file '${rows[rows.length - 1].file}'`);
const list = join(dir, 'list.txt');
writeFileSync(list, lines.join('\n'));
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
  '-vf', `fps=30,${crop}scale=1920:1080:flags=lanczos,format=yuv420p`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-movflags', '+faststart', out,
]);
console.log(`wrote ${out} from ${rows.length} frames`);
