/**
 * The eight original designer looks hanging on the rack. All names and
 * designs are original to Atelier (no real-world brands).
 */
import { RANGES, type GarmentPiece, type PieceKind } from './garments.js';

export interface Look {
  id: string;
  name: string;
  note: string;
  pieces: GarmentPiece[];
}

type PieceInit = Partial<GarmentPiece> & { kind: PieceKind; fabric: string };

export function piece(init: PieceInit): GarmentPiece {
  const defaults: Record<PieceKind, Omit<GarmentPiece, 'kind' | 'fabric'>> = {
    dress: { hem: 0.5, neck: 0.05, sleeve: 0, fit: 0.7, flare: 0.12 },
    top: { hem: 0.95, neck: 0.03, sleeve: 0.14, fit: 0.5, flare: 0 },
    jacket: { hem: 0.86, neck: 0.18, sleeve: 0.56, fit: 0.6, flare: 0 },
    skirt: { hem: 0.5, neck: 0, sleeve: 0, fit: 0.5, flare: 0.1 },
    trousers: { hem: 0.06, neck: 0, sleeve: 0, fit: 0.5, flare: 0 },
  };
  const p: GarmentPiece = { ...defaults[init.kind], ...init };
  // Keep authored values inside the tailoring range, so the first touch of a
  // pin never makes the garment jump.
  const ranges = RANGES[p.kind];
  for (const key of ['hem', 'neck', 'sleeve', 'fit', 'flare'] as const) {
    const r = ranges[key];
    if (r) p[key] = Math.min(r.max, Math.max(r.min, p[key]));
  }
  return p;
}

export const LOOKS: Look[] = [
  {
    id: 'midnight-gala',
    name: 'Midnight Gala',
    note: 'Garnet satin halter, a bare back and a slit to the thigh.',
    pieces: [
      piece({ kind: 'dress', fabric: 'garnet-satin', hem: 0.06, neck: 0.03, fit: 0.92, flare: 0.1, straps: 'halter', back: 0.2, slit: 0.34 }),
    ],
  },
  {
    id: 'riviera-sundress',
    name: 'Riviera Slip',
    note: 'Cocoa satin slip with a soft cowl, cut to mid-calf.',
    pieces: [
      piece({ kind: 'dress', fabric: 'cocoa-satin', hem: 0.26, neck: 0.07, fit: 0.82, flare: 0.08, straps: 'slip', neckline: 'cowl', back: 0.12 }),
    ],
  },
  {
    id: 'studio-monday',
    name: 'Studio Monday',
    note: 'A black blazer dress: strong shoulders, gold buttons.',
    pieces: [
      piece({ kind: 'dress', fabric: 'noir-crepe', hem: 0.62, neck: 0.15, neckline: 'v', sleeve: 0.56, fit: 0.92, flare: 0.05, buttons: 6, shoulders: 0.8 }),
    ],
  },
  {
    id: 'gallery-opening',
    name: 'Gallery Opening',
    note: 'Black lace midi on fine straps, with a square neck.',
    pieces: [
      piece({ kind: 'dress', fabric: 'noir-lace', hem: 0.22, neck: 0.04, neckline: 'square', fit: 0.88, flare: 0.06, straps: 'slip' }),
    ],
  },
  {
    id: 'weekend-market',
    name: 'Weekend Market',
    note: 'A draped satin halter top over wide indigo denim.',
    pieces: [
      piece({ kind: 'trousers', fabric: 'indigo-denim', hem: 0.04, fit: 0.45, flare: 0.08 }),
      piece({ kind: 'top', fabric: 'onyx-satin', hem: 0.86, fit: 0.6, straps: 'halter', drape: 0.6 }),
    ],
  },
  {
    id: 'velvet-hour',
    name: 'Velvet Hour',
    note: 'Chocolate velvet slip to the floor, with a low back.',
    pieces: [
      piece({ kind: 'dress', fabric: 'chocolate-velvet', hem: 0.08, neck: 0.06, neckline: 'v', fit: 0.9, flare: 0.1, straps: 'slip', back: 0.16 }),
    ],
  },
  {
    id: 'boardroom',
    name: 'Boardroom',
    note: 'Double-breasted pinstripe, a satin cami, wide crepe trousers.',
    pieces: [
      piece({ kind: 'trousers', fabric: 'noir-crepe', hem: 0.05, fit: 0.5, flare: 0.08 }),
      piece({ kind: 'top', fabric: 'ivory-satin', hem: 0.95, neck: 0.05, neckline: 'v', fit: 0.6, straps: 'slip' }),
      piece({ kind: 'jacket', fabric: 'chalk-pinstripe', hem: 0.84, neck: 0.2, sleeve: 0.57, fit: 0.78, buttons: 6, shoulders: 0.7 }),
    ],
  },
  {
    id: 'golden-hour',
    name: 'Golden Hour',
    note: 'Champagne sequin halter mini, fringed to swing.',
    pieces: [
      piece({ kind: 'dress', fabric: 'champagne-sequin', hem: 0.66, neck: 0.03, fit: 0.92, flare: 0.05, straps: 'halter', back: 0.14, fringe: 0.1 }),
    ],
  },
];

export function cloneLook(look: Look): GarmentPiece[] {
  return look.pieces.map((p) => ({ ...p }));
}
