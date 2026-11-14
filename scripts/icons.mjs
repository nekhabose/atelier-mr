// App icons for the installable PWA: a brass hanger on espresso, full-bleed
// (the maskable icon is opaque with the glyph inside the 80% safe zone).
//   node scripts/icons.mjs
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const glyph = (scale) => {
  const s = scale;
  const t = (x, y) => `${256 + (x - 256) * s},${256 + (y - 256) * s}`;
  return `
  <g fill="none" stroke="url(#brass)" stroke-width="${22 * s}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M ${t(226, 150)} C ${t(226, 110)} ${t(286, 110)} ${t(286, 150)} C ${t(286, 176)} ${t(256, 182)} ${t(256, 214)}"/>
    <path d="M ${t(256, 214)} L ${t(110, 330)} Q ${t(96, 346)} ${t(122, 350)} L ${t(390, 350)} Q ${t(416, 346)} ${t(402, 330)} Z"/>
  </g>
  <text x="256" y="${256 + 150 * s}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif"
    font-size="${46 * s}" letter-spacing="${12 * s}" fill="#e9d3a0">ATELIER</text>`;
};

const svg = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="75%">
      <stop offset="0%" stop-color="#4a3826"/>
      <stop offset="100%" stop-color="#140f0a"/>
    </radialGradient>
    <linearGradient id="brass" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f3dda6"/>
      <stop offset="55%" stop-color="#d6ac5c"/>
      <stop offset="100%" stop-color="#a77a34"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  ${glyph(scale)}
</svg>`;

await mkdir('public/icons', { recursive: true });
const png = (size, scale, out) => sharp(Buffer.from(svg(scale))).resize(size, size).png().toFile(out);
await png(512, 1, 'public/icons/icon-512.png');
await png(192, 1, 'public/icons/icon-192.png');
await png(180, 1, 'public/icons/apple-touch-icon.png');
await png(512, 0.78, 'public/icons/icon-512-maskable.png');
console.log('icons written');
