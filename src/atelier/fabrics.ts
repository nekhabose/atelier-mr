/**
 * Fabric library: procedural pattern textures + physically based finishes.
 * Runtime-only (uses a DOM canvas) – never import from src/assets.ts.
 */
import {
  CanvasTexture,
  Color,
  DoubleSide,
  MeshPhysicalMaterial,
  RepeatWrapping,
  SRGBColorSpace,
} from '@iwsdk/core';

export type Finish = 'satin' | 'silk' | 'cotton' | 'denim' | 'wool' | 'velvet' | 'linen' | 'knit';
export type PatternKind =
  | 'solid'
  | 'stripe'
  | 'pinstripe'
  | 'gingham'
  | 'plaid'
  | 'polka'
  | 'floral'
  | 'denim'
  | 'herringbone';

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
];

/** The 12 fabrics pinned to the swatch wall (the rest are used by looks). */
export const SWATCH_WALL: string[] = [
  'navy-satin',
  'bordeaux-velvet',
  'blush-satin',
  'ivory-silk',
  'garden-floral',
  'rose-gingham',
  'breton-stripe',
  'noir-polka',
  'indigo-denim',
  'mustard-plaid',
  'chalk-pinstripe',
  'olive-linen',
];

export function fabricById(id: string): Fabric {
  return FABRICS.find((f) => f.id === id) ?? FABRICS[0];
}

const FINISH: Record<
  Finish,
  { roughness: number; sheen: number; sheenRoughness: number; clearcoat: number; bump: number }
> = {
  satin: { roughness: 0.32, sheen: 0.6, sheenRoughness: 0.25, clearcoat: 0.15, bump: 0 },
  silk: { roughness: 0.4, sheen: 0.55, sheenRoughness: 0.3, clearcoat: 0.05, bump: 0 },
  cotton: { roughness: 0.88, sheen: 0.2, sheenRoughness: 0.8, clearcoat: 0, bump: 0.08 },
  denim: { roughness: 0.92, sheen: 0.1, sheenRoughness: 0.9, clearcoat: 0, bump: 0.25 },
  wool: { roughness: 0.95, sheen: 0.35, sheenRoughness: 0.85, clearcoat: 0, bump: 0.15 },
  velvet: { roughness: 0.8, sheen: 1.0, sheenRoughness: 0.45, clearcoat: 0, bump: 0 },
  linen: { roughness: 0.9, sheen: 0.15, sheenRoughness: 0.85, clearcoat: 0, bump: 0.2 },
  knit: { roughness: 0.9, sheen: 0.3, sheenRoughness: 0.75, clearcoat: 0, bump: 0.12 },
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

export function fabricTexture(fabric: Fabric): CanvasTexture {
  let tex = textureCache.get(fabric.id);
  if (!tex) {
    const { canvas, ctx } = makeCanvas();
    drawPattern(ctx, fabric);
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
  mat = new MeshPhysicalMaterial({
    map: fabricTexture(fabric),
    roughness: f.roughness,
    metalness: 0,
    sheen: f.sheen,
    sheenRoughness: f.sheenRoughness,
    sheenColor: base.clone().lerp(new Color('#ffffff'), 0.35),
    clearcoat: f.clearcoat,
    clearcoatRoughness: 0.4,
    side: DoubleSide,
  });
  mat.name = `fabric-${fabric.id}`;
  materialCache.set(fabricId, mat);
  return mat;
}

/** A flat swatch material (pattern scaled to fit a ~16 cm square). */
export function swatchMaterial(fabricId: string): MeshPhysicalMaterial {
  const key = `swatch-${fabricId}`;
  let mat = materialCache.get(key);
  if (mat) return mat;
  const fabric = fabricById(fabricId);
  const tex = fabricTexture(fabric).clone();
  tex.needsUpdate = true;
  tex.repeat.set(0.16 / fabric.tile, 0.16 / fabric.tile);
  const f = FINISH[fabric.finish];
  mat = new MeshPhysicalMaterial({
    map: tex,
    roughness: f.roughness,
    sheen: f.sheen,
    sheenRoughness: f.sheenRoughness,
    sheenColor: new Color(fabric.colors[0]).lerp(new Color('#ffffff'), 0.35),
    clearcoat: f.clearcoat,
    side: DoubleSide,
  });
  materialCache.set(key, mat);
  return mat;
}
