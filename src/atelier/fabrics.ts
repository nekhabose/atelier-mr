/**
 * Fabric library: procedural pattern textures + physically based finishes.
 * Runtime-only (uses a DOM canvas) – never import from src/assets.ts.
 */
import {
  CanvasTexture,
  Color,
  DoubleSide,
  FrontSide,
  Material,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  Vector2,
} from '@iwsdk/core';

export type Finish =
  | 'satin'
  | 'silk'
  | 'cotton'
  | 'denim'
  | 'wool'
  | 'velvet'
  | 'linen'
  | 'knit'
  | 'sequin'
  | 'lace'
  | 'tulle'
  | 'leather'
  | 'metallic'
  | 'crepe';
export type PatternKind =
  | 'solid'
  | 'stripe'
  | 'pinstripe'
  | 'gingham'
  | 'plaid'
  | 'polka'
  | 'floral'
  | 'denim'
  | 'herringbone'
  | 'sequin'
  | 'lace'
  | 'net'
  | 'grain'
  | 'lame';

export interface Fabric {
  id: string;
  name: string;
  finish: Finish;
  pattern: PatternKind;
  /** [base, accent, accent2] hex colours. */
  colors: [string, string?, string?];
  /** Physical size of one pattern repeat (m). */
  tile: number;
}

export const FABRICS: Fabric[] = [
  { id: 'navy-satin', name: 'Navy Satin', finish: 'satin', pattern: 'solid', colors: ['#1b2a52'], tile: 0.2 },
  { id: 'ivory-silk', name: 'Ivory Silk', finish: 'silk', pattern: 'solid', colors: ['#efe6d6'], tile: 0.2 },
  { id: 'indigo-denim', name: 'Indigo Denim', finish: 'denim', pattern: 'denim', colors: ['#2f4a73', '#5d77a0', '#1f3354'], tile: 0.06 },
  { id: 'noir-wool', name: 'Noir Wool', finish: 'wool', pattern: 'herringbone', colors: ['#1d1d20', '#2c2c31'], tile: 0.05 },
  { id: 'bordeaux-velvet', name: 'Bordeaux Velvet', finish: 'velvet', pattern: 'solid', colors: ['#5c1024'], tile: 0.2 },
  { id: 'garden-floral', name: 'Garden Floral', finish: 'cotton', pattern: 'floral', colors: ['#f4ead8', '#d4567a', '#5c8a5a'], tile: 0.14 },
  { id: 'breton-stripe', name: 'Breton Stripe', finish: 'knit', pattern: 'stripe', colors: ['#f6f3ec', '#20325e'], tile: 0.05 },
  { id: 'chalk-pinstripe', name: 'Chalk Pinstripe', finish: 'wool', pattern: 'pinstripe', colors: ['#4a4d55', '#c9cbd1'], tile: 0.03 },
  { id: 'rose-gingham', name: 'Rose Gingham', finish: 'cotton', pattern: 'gingham', colors: ['#fbf3f1', '#d98a96'], tile: 0.04 },
  { id: 'mustard-plaid', name: 'Mustard Plaid', finish: 'wool', pattern: 'plaid', colors: ['#c9962c', '#3b2f2a', '#e9d6a3'], tile: 0.12 },
  { id: 'olive-linen', name: 'Olive Linen', finish: 'linen', pattern: 'solid', colors: ['#6f7650'], tile: 0.08 },
  { id: 'noir-polka', name: 'Noir Polka', finish: 'silk', pattern: 'polka', colors: ['#141418', '#f2efe9'], tile: 0.05 },
  { id: 'cloud-cotton', name: 'Cloud Cotton', finish: 'cotton', pattern: 'solid', colors: ['#f7f7f4'], tile: 0.2 },
  { id: 'charcoal-wool', name: 'Charcoal Wool', finish: 'wool', pattern: 'herringbone', colors: ['#3d3f45', '#4b4e55'], tile: 0.05 },
  { id: 'onyx-knit', name: 'Onyx Knit', finish: 'knit', pattern: 'solid', colors: ['#18181b'], tile: 0.2 },
  { id: 'blush-satin', name: 'Blush Satin', finish: 'satin', pattern: 'solid', colors: ['#e8b4b0'], tile: 0.2 },
  // Modern evening and occasion fabrics.
  { id: 'cocoa-satin', name: 'Cocoa Satin', finish: 'satin', pattern: 'solid', colors: ['#5a3a2a'], tile: 0.2 },
  { id: 'garnet-satin', name: 'Garnet Satin', finish: 'satin', pattern: 'solid', colors: ['#7a1422'], tile: 0.2 },
  { id: 'onyx-satin', name: 'Onyx Satin', finish: 'satin', pattern: 'solid', colors: ['#17171b'], tile: 0.2 },
  { id: 'ivory-satin', name: 'Ivory Satin', finish: 'satin', pattern: 'solid', colors: ['#efe6d4'], tile: 0.2 },
  { id: 'plum-satin', name: 'Plum Satin', finish: 'satin', pattern: 'solid', colors: ['#4a1f3a'], tile: 0.2 },
  { id: 'emerald-satin', name: 'Emerald Satin', finish: 'satin', pattern: 'solid', colors: ['#1f5a44'], tile: 0.2 },
  { id: 'gilded-satin', name: 'Gilded Satin', finish: 'satin', pattern: 'solid', colors: ['#a8823a'], tile: 0.2 },
  { id: 'silver-sequin', name: 'Silver Sequin', finish: 'sequin', pattern: 'sequin', colors: ['#bfc3cb', '#f6f8fc', '#7f848e'], tile: 0.03 },
  { id: 'noir-sequin', name: 'Noir Sequin', finish: 'sequin', pattern: 'sequin', colors: ['#1b1b20', '#6a6d78', '#0a0a0c'], tile: 0.03 },
  { id: 'champagne-sequin', name: 'Champagne Sequin', finish: 'sequin', pattern: 'sequin', colors: ['#d6bf95', '#fff2d2', '#957c50'], tile: 0.03 },
  { id: 'noir-lace', name: 'Noir Lace', finish: 'lace', pattern: 'lace', colors: ['#141416', '#2b2b30'], tile: 0.09 },
  { id: 'ivory-lace', name: 'Ivory Lace', finish: 'lace', pattern: 'lace', colors: ['#f1eadb', '#ffffff'], tile: 0.09 },
  { id: 'noir-tulle', name: 'Noir Tulle', finish: 'tulle', pattern: 'net', colors: ['#18181c'], tile: 0.02 },
  { id: 'blush-tulle', name: 'Blush Tulle', finish: 'tulle', pattern: 'net', colors: ['#e6b9b4'], tile: 0.02 },
  { id: 'chocolate-velvet', name: 'Chocolate Velvet', finish: 'velvet', pattern: 'solid', colors: ['#3b2219'], tile: 0.2 },
  { id: 'cocoa-leather', name: 'Cocoa Leather', finish: 'leather', pattern: 'grain', colors: ['#4c2f23', '#5c3b2c'], tile: 0.08 },
  { id: 'noir-leather', name: 'Noir Leather', finish: 'leather', pattern: 'grain', colors: ['#151517', '#232327'], tile: 0.08 },
  { id: 'silver-lame', name: 'Silver Lame', finish: 'metallic', pattern: 'lame', colors: ['#bcc0c8', '#eef1f6', '#868b95'], tile: 0.06 },
  { id: 'noir-crepe', name: 'Noir Crepe', finish: 'crepe', pattern: 'solid', colors: ['#151518'], tile: 0.2 },
  { id: 'ivory-crepe', name: 'Ivory Crepe', finish: 'crepe', pattern: 'solid', colors: ['#ece5d8'], tile: 0.2 },
];

/** The 12 fabrics pinned to the swatch wall (the rest are used by looks). */
export const SWATCH_WALL: string[] = [
  'navy-satin',
  'garnet-satin',
  'cocoa-satin',
  'ivory-silk',
  'emerald-satin',
  'silver-sequin',
  'noir-lace',
  'blush-tulle',
  'chocolate-velvet',
  'bordeaux-velvet',
  'cocoa-leather',
  'noir-crepe',
];

// ------------------------------------------------------------ closet fabrics

/** Colours offered by the closet builder. */
export const CLOSET_COLORS = [
  { key: 'white', name: 'White', hex: '#f4f2ec' },
  { key: 'cream', name: 'Cream', hex: '#e9dcc0' },
  { key: 'camel', name: 'Camel', hex: '#b98a5a' },
  { key: 'pink', name: 'Pink', hex: '#e7a6b0' },
  { key: 'red', name: 'Red', hex: '#a8262f' },
  { key: 'green', name: 'Green', hex: '#4f6b45' },
  { key: 'blue', name: 'Blue', hex: '#4a77b4' },
  { key: 'navy', name: 'Navy', hex: '#1f2d52' },
  { key: 'grey', name: 'Grey', hex: '#8b8d93' },
  { key: 'black', name: 'Black', hex: '#1a1a1d' },
  { key: 'brown', name: 'Brown', hex: '#4e3226' },
  { key: 'burgundy', name: 'Burgundy', hex: '#6e1626' },
  { key: 'gold', name: 'Gold', hex: '#b08a3e' },
  { key: 'silver', name: 'Silver', hex: '#b9bdc5' },
] as const;
export type ClosetColor = (typeof CLOSET_COLORS)[number]['key'];

/** Fabric types offered by the closet builder (`adj` is used in item names). */
export const CLOSET_MATERIALS = [
  { key: 'cotton', name: 'Cotton', adj: 'cotton' },
  { key: 'satin', name: 'Satin', adj: 'satin' },
  { key: 'knit', name: 'Knit', adj: 'knit' },
  { key: 'wool', name: 'Wool', adj: 'wool' },
  { key: 'denim', name: 'Denim', adj: 'denim' },
  { key: 'stripe', name: 'Stripe', adj: 'striped' },
  { key: 'check', name: 'Check', adj: 'check' },
  { key: 'plaid', name: 'Plaid', adj: 'plaid' },
  { key: 'dots', name: 'Dots', adj: 'polka-dot' },
  { key: 'floral', name: 'Floral', adj: 'floral' },
  { key: 'sequin', name: 'Sequin', adj: 'sequin' },
  { key: 'lace', name: 'Lace', adj: 'lace' },
  { key: 'velvet', name: 'Velvet', adj: 'velvet' },
  { key: 'leather', name: 'Leather', adj: 'leather-look' },
  { key: 'tulle', name: 'Tulle', adj: 'tulle' },
] as const;
export type ClosetMaterial = (typeof CLOSET_MATERIALS)[number]['key'];

/** Fabric id for a closet colour + material, e.g. `c:stripe:navy`. */
export function closetFabricId(material: ClosetMaterial, color: ClosetColor): string {
  return `c:${material}:${color}`;
}

/** Parse a closet fabric id; undefined for library fabrics. */
export function parseClosetFabric(
  id: string,
): { material: ClosetMaterial; color: ClosetColor } | undefined {
  const [prefix, material, color] = id.split(':');
  if (prefix !== 'c') return undefined;
  if (!CLOSET_MATERIALS.some((m) => m.key === material)) return undefined;
  if (!CLOSET_COLORS.some((c) => c.key === color)) return undefined;
  return { material: material as ClosetMaterial, color: color as ClosetColor };
}

function shade(hex: string, amount: number): string {
  const c = new Color(hex);
  return '#' + (amount >= 0 ? c.lerp(new Color('#ffffff'), amount) : c.lerp(new Color('#000000'), -amount)).getHexString();
}

function isLight(hex: string): boolean {
  const c = new Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b > 0.45;
}

const closetCache = new Map<string, Fabric>();

function synthesizeClosetFabric(id: string): Fabric | undefined {
  const parsed = parseClosetFabric(id);
  if (!parsed) return undefined;
  let fabric = closetCache.get(id);
  if (fabric) return fabric;
  const color = CLOSET_COLORS.find((c) => c.key === parsed.color)!;
  const material = CLOSET_MATERIALS.find((m) => m.key === parsed.material)!;
  const c = color.hex;
  const contrast = isLight(c) ? '#20325e' : '#f2efe9';
  const name = `${color.name} ${material.name}`;
  const base = { id, name, tile: 0.2 } as const;
  switch (parsed.material) {
    case 'cotton':
    case 'satin':
    case 'knit':
      fabric = { ...base, finish: parsed.material, pattern: 'solid', colors: [c] };
      break;
    case 'wool':
      fabric = { ...base, finish: 'wool', pattern: 'herringbone', colors: [c, shade(c, isLight(c) ? -0.08 : 0.08)], tile: 0.05 };
      break;
    case 'denim':
      fabric = { ...base, finish: 'denim', pattern: 'denim', colors: [c, shade(c, 0.25), shade(c, -0.25)], tile: 0.06 };
      break;
    case 'stripe':
      fabric = { ...base, finish: 'knit', pattern: 'stripe', colors: [c, contrast], tile: 0.05 };
      break;
    case 'check':
      fabric = { ...base, finish: 'cotton', pattern: 'gingham', colors: [isLight(c) ? '#f8f5ef' : shade(c, 0.85), isLight(c) ? '#20325e' : c], tile: 0.04 };
      break;
    case 'plaid':
      fabric = { ...base, finish: 'wool', pattern: 'plaid', colors: [c, '#2b2622', '#e9d6a3'], tile: 0.12 };
      break;
    case 'dots':
      fabric = { ...base, finish: 'silk', pattern: 'polka', colors: [c, contrast], tile: 0.05 };
      break;
    case 'floral':
      fabric = { ...base, finish: 'cotton', pattern: 'floral', colors: [c, isLight(c) ? '#d4567a' : '#f4ead8', '#5c8a5a'], tile: 0.14 };
      break;
    case 'sequin':
      fabric = { ...base, finish: 'sequin', pattern: 'sequin', colors: [c, shade(c, 0.6), shade(c, -0.45)], tile: 0.03 };
      break;
    case 'lace':
      fabric = { ...base, finish: 'lace', pattern: 'lace', colors: [c, shade(c, isLight(c) ? 0.3 : 0.12)], tile: 0.09 };
      break;
    case 'velvet':
      fabric = { ...base, finish: 'velvet', pattern: 'solid', colors: [shade(c, -0.12)] };
      break;
    case 'leather':
      fabric = { ...base, finish: 'leather', pattern: 'grain', colors: [shade(c, -0.08), shade(c, 0.06)], tile: 0.08 };
      break;
    case 'tulle':
      fabric = { ...base, finish: 'tulle', pattern: 'net', colors: [c], tile: 0.02 };
      break;
  }
  closetCache.set(id, fabric);
  return fabric;
}

export function fabricById(id: string): Fabric {
  return FABRICS.find((f) => f.id === id) ?? synthesizeClosetFabric(id) ?? FABRICS[0];
}

const FINISH: Record<
  Finish,
  {
    roughness: number;
    sheen: number;
    sheenRoughness: number;
    clearcoat: number;
    bump: number;
    metalness?: number;
    /** 'cut': lace holes (alpha test); 'sheer': see-through tulle. */
    alpha?: 'cut' | 'sheer';
  }
> = {
  satin: { roughness: 0.32, sheen: 0.6, sheenRoughness: 0.25, clearcoat: 0.15, bump: 0 },
  silk: { roughness: 0.4, sheen: 0.55, sheenRoughness: 0.3, clearcoat: 0.05, bump: 0 },
  cotton: { roughness: 0.88, sheen: 0.2, sheenRoughness: 0.8, clearcoat: 0, bump: 0.08 },
  denim: { roughness: 0.92, sheen: 0.1, sheenRoughness: 0.9, clearcoat: 0, bump: 0.25 },
  wool: { roughness: 0.95, sheen: 0.35, sheenRoughness: 0.85, clearcoat: 0, bump: 0.15 },
  velvet: { roughness: 0.8, sheen: 1.0, sheenRoughness: 0.45, clearcoat: 0, bump: 0 },
  linen: { roughness: 0.9, sheen: 0.15, sheenRoughness: 0.85, clearcoat: 0, bump: 0.2 },
  knit: { roughness: 0.9, sheen: 0.3, sheenRoughness: 0.75, clearcoat: 0, bump: 0.12 },
  sequin: { roughness: 0.26, sheen: 0.3, sheenRoughness: 0.3, clearcoat: 0.3, bump: 0, metalness: 0.6 },
  lace: { roughness: 0.78, sheen: 0.45, sheenRoughness: 0.6, clearcoat: 0, bump: 0, alpha: 'sheer' },
  tulle: { roughness: 0.72, sheen: 0.35, sheenRoughness: 0.6, clearcoat: 0, bump: 0, alpha: 'sheer' },
  leather: { roughness: 0.4, sheen: 0.1, sheenRoughness: 0.5, clearcoat: 0.45, bump: 0 },
  metallic: { roughness: 0.3, sheen: 0.2, sheenRoughness: 0.4, clearcoat: 0.2, bump: 0, metalness: 0.8 },
  crepe: { roughness: 0.86, sheen: 0.25, sheenRoughness: 0.7, clearcoat: 0, bump: 0.04 },
};

const SIZE = 256;

function makeCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  return { canvas, ctx };
}

/** Deterministic pseudo random so textures look the same every load. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function drawPattern(ctx: CanvasRenderingContext2D, fabric: Fabric): void {
  const [base, a = base, b = a] = fabric.colors;
  const S = SIZE;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  const rand = rng(fabric.id.length * 7919 + fabric.id.charCodeAt(0));

  switch (fabric.pattern) {
    case 'solid':
      break;
    case 'stripe': {
      ctx.fillStyle = a;
      ctx.fillRect(0, S * 0.5, S, S * 0.32);
      break;
    }
    case 'pinstripe': {
      ctx.fillStyle = a;
      ctx.globalAlpha = 0.7;
      ctx.fillRect(S * 0.48, 0, S * 0.035, S);
      ctx.globalAlpha = 1;
      break;
    }
    case 'gingham': {
      ctx.fillStyle = a;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(0, 0, S / 2, S);
      ctx.fillRect(0, 0, S, S / 2);
      ctx.globalAlpha = 1;
      break;
    }
    case 'plaid': {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = a;
      ctx.fillRect(S * 0.1, 0, S * 0.12, S);
      ctx.fillRect(0, S * 0.1, S, S * 0.12);
      ctx.fillStyle = b;
      ctx.fillRect(S * 0.55, 0, S * 0.03, S);
      ctx.fillRect(0, S * 0.55, S, S * 0.03);
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = a;
      ctx.fillRect(S * 0.7, 0, S * 0.05, S);
      ctx.fillRect(0, S * 0.7, S, S * 0.05);
      ctx.globalAlpha = 1;
      break;
    }
    case 'polka': {
      ctx.fillStyle = a;
      const r = S * 0.11;
      for (const [x, y] of [
        [0.25, 0.25],
        [0.75, 0.75],
        [0.75, -0.25],
        [-0.25, 0.75],
        [1.25, 0.25],
        [0.25, 1.25],
      ]) {
        ctx.beginPath();
        ctx.arc(x * S, y * S, r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'floral': {
      const blossoms: Array<[number, number, number]> = [
        [0.22, 0.28, 1],
        [0.72, 0.18, 0.8],
        [0.55, 0.68, 1.1],
        [0.12, 0.8, 0.7],
        [0.9, 0.62, 0.75],
      ];
      for (const [bx, by, sc] of blossoms) {
        for (const ox of [-1, 0, 1]) {
          for (const oy of [-1, 0, 1]) {
            const cx = (bx + ox) * S;
            const cy = (by + oy) * S;
            if (cx < -60 || cx > S + 60 || cy < -60 || cy > S + 60) continue;
            // leaves
            ctx.fillStyle = b;
            for (let k = 0; k < 2; k++) {
              ctx.beginPath();
              const ang = k * Math.PI + 0.6;
              ctx.ellipse(
                cx + Math.cos(ang) * 22 * sc,
                cy + Math.sin(ang) * 22 * sc,
                14 * sc,
                6 * sc,
                ang,
                0,
                Math.PI * 2,
              );
              ctx.fill();
            }
            // petals
            ctx.fillStyle = a;
            for (let p = 0; p < 5; p++) {
              const ang = (p / 5) * Math.PI * 2;
              ctx.beginPath();
              ctx.ellipse(
                cx + Math.cos(ang) * 10 * sc,
                cy + Math.sin(ang) * 10 * sc,
                9 * sc,
                6 * sc,
                ang,
                0,
                Math.PI * 2,
              );
              ctx.fill();
            }
            ctx.fillStyle = '#f2c94c';
            ctx.beginPath();
            ctx.arc(cx, cy, 4.5 * sc, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      break;
    }
    case 'denim': {
      // diagonal twill lines + speckle
      ctx.lineWidth = 3;
      for (let i = -S; i < S * 2; i += 9) {
        ctx.strokeStyle = rand() > 0.5 ? a : b;
        ctx.globalAlpha = 0.35 + rand() * 0.25;
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + S, S);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 600; i++) {
        ctx.fillRect(rand() * S, rand() * S, 1.5, 1.5);
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'herringbone': {
      ctx.strokeStyle = a;
      ctx.lineWidth = 6;
      const band = S / 4;
      for (let col = 0; col < 4; col++) {
        const dir = col % 2 === 0 ? 1 : -1;
        ctx.save();
        ctx.beginPath();
        ctx.rect(col * band, 0, band, S);
        ctx.clip();
        for (let y = -S; y < S * 2; y += 14) {
          ctx.beginPath();
          ctx.moveTo(col * band, y);
          ctx.lineTo(col * band + band, y + dir * band);
          ctx.stroke();
        }
        ctx.restore();
      }
      break;
    }
  }

  switch (fabric.pattern) {
    case 'sequin': {
      // Overlapping round sequins in offset rows, each catching light a little differently.
      const R = 9;
      for (let row = -1; row * R * 1.5 < S + R; row++) {
        for (let x = -R; x < S + R; x += R * 1.8) {
          const cx = x + (row % 2 ? R * 0.9 : 0);
          const cy = row * R * 1.5;
          const v = rand();
          ctx.fillStyle = v > 0.82 ? a : v < 0.2 ? b : base;
          for (const dx of [0, S, -S]) {
            for (const dy of [0, S, -S]) {
              ctx.beginPath();
              ctx.arc(cx + dx, cy + dy, R, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }
      break;
    }
    case 'lace': {
      // A sheer ground (skin or lining shows through, darkened), a fine net,
      // then opaque flowers and scallops.
      ctx.clearRect(0, 0, S, S);
      ctx.fillStyle = base;
      ctx.globalAlpha = 0.62;
      ctx.fillRect(0, 0, S, S);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = base;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.9;
      for (let k = -S; k < S * 2; k += 16) {
        ctx.beginPath();
        ctx.moveTo(k, 0);
        ctx.lineTo(k + S, S);
        ctx.moveTo(k, S);
        ctx.lineTo(k + S, 0);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = base;
      const flower = (fx: number, fy: number, r: number) => {
        for (let k = 0; k < 6; k++) {
          const ang = (k / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.ellipse(fx + Math.cos(ang) * r, fy + Math.sin(ang) * r, r * 0.75, r * 0.45, ang, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = a;
        ctx.beginPath();
        ctx.arc(fx, fy, r * 0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = base;
      };
      for (const [fx, fy, r] of [
        [64, 64, 22],
        [192, 192, 22],
        [192, 60, 13],
        [60, 196, 13],
        [128, 128, 9],
      ] as const) {
        for (const dx of [0, S, -S]) for (const dy of [0, S, -S]) flower(fx + dx, fy + dy, r);
      }
      ctx.lineWidth = 3;
      ctx.strokeStyle = base;
      for (let x = 0; x < S; x += 32) {
        ctx.beginPath();
        ctx.arc(x + 16, S * 0.5, 16, 0, Math.PI);
        ctx.stroke();
      }
      break;
    }
    case 'net': {
      // Tulle: a fine hexagonal net, mostly air.
      ctx.clearRect(0, 0, S, S);
      ctx.fillStyle = base;
      ctx.globalAlpha = 0.32;
      ctx.fillRect(0, 0, S, S);
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = base;
      ctx.lineWidth = 2;
      for (let y = 0; y <= S; y += 16) {
        for (let x = 0; x <= S; x += 16) {
          ctx.beginPath();
          ctx.arc(x + (y % 32 ? 8 : 0), y, 8, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'grain': {
      // Leather: pebbled grain, mottled light and dark.
      for (let k = 0; k < 900; k++) {
        ctx.fillStyle = rand() > 0.5 ? a : shade(base, -0.12);
        ctx.globalAlpha = 0.25 + rand() * 0.25;
        ctx.beginPath();
        ctx.arc(rand() * S, rand() * S, 2 + rand() * 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'lame': {
      // Metallic lame: crinkled light streaks.
      for (let k = 0; k < 140; k++) {
        ctx.strokeStyle = rand() > 0.55 ? a : b;
        ctx.globalAlpha = 0.25 + rand() * 0.45;
        ctx.lineWidth = 1 + rand() * 3;
        const x = rand() * S;
        const y = rand() * S;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 18 - rand() * 36, y + 20, x + 10 - rand() * 20, y + 40 + rand() * 30);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }
    default:
      break;
  }

  // Woven micro texture on everything for a fabric feel.
  const finish = FINISH[fabric.finish];
  if (finish.bump > 0) {
    ctx.globalAlpha = finish.bump * 0.35;
    for (let y = 0; y < S; y += 3) {
      ctx.fillStyle = y % 6 === 0 ? '#000000' : '#ffffff';
      ctx.fillRect(0, y, S, 1);
    }
    ctx.globalAlpha = 1;
  }
}

const textureCache = new Map<string, CanvasTexture>();
const materialCache = new Map<string, MeshPhysicalMaterial>();
const standardCache = new Map<string, MeshStandardMaterial>();
const weaveCache = new Map<Finish, CanvasTexture | null>();

/**
 * Weave relief per finish, as a tangent-space normal map: plain weave for
 * cotton, slubby linen, diagonal twill for denim, herringbone for wool, ribs
 * for knit and a fine pile for velvet. Satin and silk stay smooth (their look
 * comes from sheen). Built once per finish and shared.
 */
const WEAVE: Partial<Record<Finish, { tile: number; strength: number; normalScale: number }>> = {
  cotton: { tile: 0.03, strength: 2.2, normalScale: 0.35 },
  linen: { tile: 0.035, strength: 2.6, normalScale: 0.5 },
  denim: { tile: 0.025, strength: 2.8, normalScale: 0.6 },
  wool: { tile: 0.04, strength: 2.4, normalScale: 0.5 },
  knit: { tile: 0.04, strength: 3.0, normalScale: 0.7 },
  velvet: { tile: 0.02, strength: 1.4, normalScale: 0.22 },
  sequin: { tile: 0.03, strength: 4.0, normalScale: 1.0 },
  leather: { tile: 0.06, strength: 1.8, normalScale: 0.35 },
  metallic: { tile: 0.06, strength: 2.2, normalScale: 0.55 },
  crepe: { tile: 0.02, strength: 1.6, normalScale: 0.28 },
};

function weaveHeight(finish: Finish, x: number, y: number, rnd: number): number {
  const TAU = Math.PI * 2;
  switch (finish) {
    case 'cotton':
      return 0.5 + 0.5 * Math.sin((TAU * x) / 8) * Math.sin((TAU * y) / 8);
    case 'linen':
      return 0.5 + 0.35 * Math.sin((TAU * x) / 8) * Math.sin((TAU * y) / 8) + 0.3 * rnd;
    case 'denim':
      return 0.5 + 0.5 * Math.sin((TAU * (x + y)) / 6) + 0.15 * rnd;
    case 'wool': {
      const band = Math.floor(y / 16) % 2 === 0 ? 1 : -1;
      return 0.5 + 0.5 * Math.sin((TAU * (x + band * y)) / 10) + 0.2 * rnd;
    }
    case 'knit': {
      const rib = Math.abs(Math.sin((Math.PI * x) / 8));
      const v = Math.abs(Math.sin((Math.PI * (y + Math.abs((x % 16) - 8))) / 8));
      return 0.6 * rib + 0.4 * v;
    }
    case 'velvet':
      return rnd;
    case 'sequin': {
      // Each sequin a small disc tilted its own way, so they glint one by one.
      const row = Math.floor(y / 6);
      const cx = Math.floor((x + (row % 2) * 3) / 6);
      const h = Math.abs(Math.sin(cx * 12.9898 + row * 78.233) * 43758.5453) % 1;
      const lx = ((x + (row % 2) * 3) % 6) / 6 - 0.5;
      const ly = (y % 6) / 6 - 0.5;
      return 0.5 + (h - 0.5) * 1.6 * lx + (0.5 - h) * 1.2 * ly - 0.6 * (lx * lx + ly * ly);
    }
    case 'leather':
      return 0.5 + 0.35 * Math.sin(x * 0.9 + Math.sin(y * 0.7) * 2) * Math.sin(y * 0.8 + Math.sin(x * 0.6) * 2) + 0.2 * rnd;
    case 'metallic':
      return 0.5 + 0.4 * Math.sin(x * 0.25 + Math.sin(y * 0.18) * 3) + 0.15 * rnd;
    case 'crepe':
      return 0.5 + 0.5 * rnd;
    default:
      return 0.5;
  }
}

export function weaveNormalMap(finish: Finish): CanvasTexture | null {
  if (weaveCache.has(finish)) return weaveCache.get(finish) ?? null;
  const spec = WEAVE[finish];
  if (!spec) {
    weaveCache.set(finish, null);
    return null;
  }
  const S = 128;
  // Seeded noise so the texture is the same every session.
  let seed = finish.length * 9301 + 49297;
  const noise = new Float32Array(S * S);
  for (let i = 0; i < noise.length; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    noise[i] = seed / 233280;
  }
  const h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) h[y * S + x] = weaveHeight(finish, x, y, noise[y * S + x]);
  }
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const img = ctx.createImageData(S, S);
  const at = (x: number, y: number) => h[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const nx = (at(x - 1, y) - at(x + 1, y)) * spec.strength;
      const ny = (at(x, y - 1) - at(x, y + 1)) * spec.strength;
      const len = Math.hypot(nx, ny, 1);
      const o = (y * S + x) * 4;
      img.data[o] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[o + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[o + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = NoColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.anisotropy = 4;
  tex.repeat.set(1 / spec.tile, 1 / spec.tile);
  weaveCache.set(finish, tex);
  return tex;
}

/** How much natural irregularity each kind of cloth shows in its colour. */
const YARN: Record<Finish, number> = {
  cotton: 0.03,
  linen: 0.07,
  denim: 0.08,
  wool: 0.06,
  knit: 0.05,
  velvet: 0.08,
  satin: 0.025,
  silk: 0.03,
  sequin: 0.05,
  lace: 0.02,
  tulle: 0.02,
  leather: 0.05,
  metallic: 0.06,
  crepe: 0.03,
};

/**
 * Real cloth is never one flat colour: linen has slubs across the weft, denim
 * fades in vertical streaks, wool is heathered, knit shows its ribs and velvet
 * crushes into soft light and dark patches. A seeded, tileable pass over the
 * pattern so printed fabrics look woven, not drawn.
 */
function addYarn(ctx: CanvasRenderingContext2D, fabric: Fabric): void {
  const S = SIZE;
  const img = ctx.getImageData(0, 0, S, S);
  const d = img.data;
  const r = rng(fabric.id.length * 131 + fabric.id.charCodeAt(fabric.id.length - 1) * 17);
  const row = new Float32Array(S).map(() => r() - 0.5);
  const col = new Float32Array(S).map(() => r() - 0.5);
  // Tileable low-frequency noise from a 4x4 grid.
  const G = 4;
  const grid = new Float32Array(G * G).map(() => r() - 0.5);
  const sm = (t: number) => t * t * (3 - 2 * t);
  const low = (x: number, y: number) => {
    const gx = (x / S) * G;
    const gy = (y / S) * G;
    const x0 = Math.floor(gx) % G;
    const y0 = Math.floor(gy) % G;
    const fx = sm(gx - Math.floor(gx));
    const fy = sm(gy - Math.floor(gy));
    const at = (i: number, j: number) => grid[(j % G) * G + (i % G)];
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
    return a + (b - a) * fy;
  };
  const amp = YARN[fabric.finish] * 2;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const grain = r() - 0.5;
      let k: number;
      switch (fabric.finish) {
        case 'linen':
          k = row[y] * 1.1 + grain * 0.35 + low(x, y) * 0.4;
          break;
        case 'denim':
          k = col[x] * 0.9 + grain * 0.4 + low(x, y) * 0.7;
          break;
        case 'wool':
          k = grain * 1.0 + low(x, y) * 0.5;
          break;
        case 'knit':
          k = (Math.floor(x / 4) % 2 ? 0.25 : -0.25) + grain * 0.35 + low(x, y) * 0.3;
          break;
        case 'velvet':
          k = low(x, y) * 1.5 + grain * 0.15;
          break;
        default:
          k = low(x, y) * 0.7 + grain * 0.25;
      }
      const m = 1 + k * amp;
      const i = (y * S + x) * 4;
      d[i] = Math.min(255, d[i] * m);
      d[i + 1] = Math.min(255, d[i + 1] * m);
      d[i + 2] = Math.min(255, d[i + 2] * m);
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function fabricTexture(fabric: Fabric): CanvasTexture {
  let tex = textureCache.get(fabric.id);
  if (!tex) {
    const { canvas, ctx } = makeCanvas();
    drawPattern(ctx, fabric);
    addYarn(ctx, fabric);
    tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.wrapS = RepeatWrapping;
    tex.wrapT = RepeatWrapping;
    tex.anisotropy = 4;
    tex.repeat.set(1 / fabric.tile, 1 / fabric.tile);
    textureCache.set(fabric.id, tex);
  }
  return tex;
}

/** Shared material per fabric (garments never mutate it). */
export function fabricMaterial(fabricId: string): MeshPhysicalMaterial {
  let mat = materialCache.get(fabricId);
  if (mat) return mat;
  const fabric = fabricById(fabricId);
  const f = FINISH[fabric.finish];
  const base = new Color(fabric.colors[0]);
  const weave = weaveNormalMap(fabric.finish);
  mat = new MeshPhysicalMaterial({
    map: fabricTexture(fabric),
    roughness: f.roughness,
    metalness: f.metalness ?? 0,
    sheen: f.sheen,
    sheenRoughness: f.sheenRoughness,
    sheenColor: base.clone().lerp(new Color('#ffffff'), 0.35),
    // Clearcoat is the costliest layer: keep it for the glossy satins only.
    clearcoat: f.clearcoat >= 0.1 ? f.clearcoat : 0,
    clearcoatRoughness: 0.4,
    normalMap: weave,
    normalScale: new Vector2(1, 1).multiplyScalar(WEAVE[fabric.finish]?.normalScale ?? 0),
    side: DoubleSide,
  });
  applyAlpha(mat, f.alpha);
  mat.name = `fabric-${fabric.id}`;
  materialCache.set(fabricId, mat);
  return mat;
}

/** Lace keeps its holes (alpha test); tulle is see-through and sorts after the form. */
function applyAlpha(mat: MeshPhysicalMaterial | MeshStandardMaterial, alpha?: 'cut' | 'sheer'): void {
  if (alpha === 'cut') {
    mat.alphaTest = 0.45;
  } else if (alpha === 'sheer') {
    mat.transparent = true;
    mat.depthWrite = false;
    mat.alphaTest = 0.05;
  }
}

let trim: MeshStandardMaterial | undefined;
/** Polished gold for buttons and jewelled trims. */
export function trimMaterial(): Material {
  trim ??= new MeshStandardMaterial({ color: '#c9a35a', metalness: 1, roughness: 0.28 });
  return trim;
}

const fringeCache = new Map<string, MeshPhysicalMaterial>();
/** Fringe: the fabric's colour and finish, cut into fine hanging strands. */
export function fringeMaterial(fabricId: string): Material {
  let mat = fringeCache.get(fabricId);
  if (mat) return mat;
  const fabric = fabricById(fabricId);
  const f = FINISH[fabric.finish];
  const { canvas, ctx } = makeCanvas();
  ctx.clearRect(0, 0, SIZE, SIZE);
  const rand = rng(fabricId.length * 31 + 7);
  const [base, a = base] = fabric.colors;
  for (let x = 0; x < SIZE; x += 6) {
    ctx.fillStyle = rand() > 0.7 ? a : base;
    ctx.fillRect(x + rand() * 2, 0, 2.5, SIZE);
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.repeat.set(1 / 0.03, 1);
  mat = new MeshPhysicalMaterial({
    map: tex,
    roughness: f.roughness,
    metalness: f.metalness ?? 0,
    sheen: f.sheen,
    alphaTest: 0.5,
    side: DoubleSide,
  });
  mat.name = `fringe-${fabricId}`;
  fringeCache.set(fabricId, mat);
  return mat;
}

/**
 * A flat swatch material (pattern scaled to fit a ~16 cm square). Standard
 * shading, front faces only: twelve of these sit on the board at once.
 */
export function swatchMaterial(fabricId: string): MeshStandardMaterial {
  const key = `swatch-${fabricId}`;
  let mat = standardCache.get(key);
  if (mat) return mat;
  const fabric = fabricById(fabricId);
  const tex = fabricTexture(fabric).clone();
  tex.needsUpdate = true;
  tex.repeat.set(0.16 / fabric.tile, 0.16 / fabric.tile);
  const f = FINISH[fabric.finish];
  mat = new MeshStandardMaterial({
    map: tex,
    roughness: Math.min(1, f.roughness + (f.sheen > 0.5 ? -0.12 : 0)),
    metalness: f.metalness ?? 0,
    normalMap: weaveNormalMap(fabric.finish),
    normalScale: new Vector2(1, 1).multiplyScalar(WEAVE[fabric.finish]?.normalScale ?? 0),
    side: FrontSide,
  });
  applyAlpha(mat, f.alpha);
  standardCache.set(key, mat);
  return mat;
}

/**
 * Cheap material for the miniature garments on the rail (a dozen or more on
 * screen): the same pattern, standard shading, no sheen or clearcoat.
 */
export function miniMaterial(fabricId: string): MeshStandardMaterial {
  const key = `mini-${fabricId}`;
  let mat = standardCache.get(key);
  if (mat) return mat;
  const fabric = fabricById(fabricId);
  const f = FINISH[fabric.finish];
  mat = new MeshStandardMaterial({
    map: fabricTexture(fabric),
    roughness: f.roughness,
    metalness: f.metalness ?? 0,
    side: DoubleSide,
  });
  applyAlpha(mat, f.alpha);
  standardCache.set(key, mat);
  return mat;
}
