/**
 * The eight original designer looks hanging on the rack. All names and
 * designs are original to Atelier (no real-world brands).
 */
import type { GarmentPiece, PieceKind } from './garments.js';

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
  return { ...defaults[init.kind], ...init };
}

export const LOOKS: Look[] = [
  {
    id: 'midnight-gala',
    name: 'Midnight Gala',
    note: 'Strapless satin column with a sweeping hem.',
    pieces: [
      piece({ kind: 'dress', fabric: 'navy-satin', hem: 0.05, fit: 0.9, flare: 0.22, strapless: true }),
    ],
  },
  {
    id: 'riviera-sundress',
    name: 'Riviera Sundress',
    note: 'Knee-length floral cotton, made for long lunches.',
    pieces: [
      piece({ kind: 'dress', fabric: 'garden-floral', hem: 0.5, neck: 0.08, sleeve: 0.06, fit: 0.65, flare: 0.2 }),
    ],
  },
  {
    id: 'studio-monday',
    name: 'Studio Monday',
    note: 'A crisp tee and straight indigo denim.',
    pieces: [
      piece({ kind: 'trousers', fabric: 'indigo-denim', hem: 0.06, fit: 0.55 }),
      piece({ kind: 'top', fabric: 'cloud-cotton', hem: 0.92, sleeve: 0.13, fit: 0.35 }),
    ],
  },
  {
    id: 'gallery-opening',
    name: 'Gallery Opening',
    note: 'Sharp noir blazer over silk, wide-leg trousers.',
    pieces: [
      piece({ kind: 'trousers', fabric: 'charcoal-wool', hem: 0.04, fit: 0.4, flare: 0.06 }),
      piece({ kind: 'top', fabric: 'ivory-silk', hem: 0.98, neck: 0.06, sleeve: 0, fit: 0.6 }),
      piece({ kind: 'jacket', fabric: 'noir-wool', hem: 0.84, neck: 0.2, sleeve: 0.57, fit: 0.75 }),
    ],
  },
  {
    id: 'weekend-market',
    name: 'Weekend Market',
    note: 'Breton stripes with an easy olive midi skirt.',
    pieces: [
      piece({ kind: 'skirt', fabric: 'olive-linen', hem: 0.36, fit: 0.3, flare: 0.14 }),
      piece({ kind: 'top', fabric: 'breton-stripe', hem: 1.0, sleeve: 0.34, fit: 0.3 }),
    ],
  },
  {
    id: 'velvet-hour',
    name: 'Velvet Hour',
    note: 'Long-sleeve bordeaux velvet, cut to the calf.',
    pieces: [
      piece({ kind: 'dress', fabric: 'bordeaux-velvet', hem: 0.36, neck: 0.1, sleeve: 0.58, fit: 0.85, flare: 0.08 }),
    ],
  },
  {
    id: 'boardroom',
    name: 'Boardroom',
    note: 'Chalk pinstripe suiting, tailored close.',
    pieces: [
      piece({ kind: 'trousers', fabric: 'chalk-pinstripe', hem: 0.05, fit: 0.75 }),
      piece({ kind: 'top', fabric: 'cloud-cotton', hem: 0.97, neck: 0.02, sleeve: 0.5, fit: 0.7 }),
      piece({ kind: 'jacket', fabric: 'chalk-pinstripe', hem: 0.86, neck: 0.16, sleeve: 0.57, fit: 0.85 }),
    ],
  },
  {
    id: 'golden-hour',
    name: 'Golden Hour',
    note: 'Mustard plaid mini over a fine black knit.',
    pieces: [
      piece({ kind: 'skirt', fabric: 'mustard-plaid', hem: 0.68, fit: 0.6, flare: 0.16 }),
      piece({ kind: 'top', fabric: 'onyx-knit', hem: 1.0, neck: 0.02, sleeve: 0.56, fit: 0.8 }),
    ],
  },
];

export function cloneLook(look: Look): GarmentPiece[] {
  return look.pieces.map((p) => ({ ...p }));
}
