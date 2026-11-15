import { describe, expect, it } from 'vitest';
import { buildPieceGeometries, cannotTailor, HERO_DETAIL, paramFromPin, pinPosition, RANGES, TailorParam } from '../src/atelier/garments';
import { LOOKS, cloneLook } from '../src/atelier/looks';

describe('tailoring maths', () => {
  it('a pin placed where a measurement is reads back that measurement', () => {
    for (const look of LOOKS) {
      for (const piece of cloneLook(look)) {
        for (const param of ['hem', 'neck', 'sleeve'] as TailorParam[]) {
          const r = RANGES[piece.kind][param];
          if (!r || cannotTailor(piece, param)) continue;
          const [x, y] = pinPosition(piece, param);
          expect(paramFromPin(piece, param, x, y)).toBeCloseTo(piece[param], 2);
        }
      }
    }
  });

  it('dragging a pin far away clamps to the legal range', () => {
    const piece = cloneLook(LOOKS[0])[0];
    const r = RANGES[piece.kind].hem!;
    expect(paramFromPin(piece, 'hem', 0, 50)).toBe(r.max);
    expect(paramFromPin(piece, 'hem', 0, -50)).toBe(r.min);
  });

  it('builds finite, non-empty geometry for every look at hero detail', () => {
    for (const look of LOOKS) {
      for (const piece of cloneLook(look)) {
        for (const g of buildPieceGeometries(piece, HERO_DETAIL)) {
          const pos = g.attributes.position.array as Float32Array;
          expect(pos.length).toBeGreaterThan(0);
          expect(pos.every(Number.isFinite)).toBe(true);
        }
      }
    }
  });
});

import { buildPieceParts, GarmentPiece } from '../src/atelier/garments';
import { decodeLook, encodeLook } from '../src/atelier/share';
import { pieceName } from '../src/atelier/closet';

describe('modern details', () => {
  const base: GarmentPiece = { kind: 'dress', fabric: 'garnet-satin', hem: 0.3, neck: 0.05, sleeve: 0, fit: 0.9, flare: 0.08 };
  const finite = (gs: { getAttribute(n: string): { array: ArrayLike<number> } }[]) =>
    gs.every((g) => Array.from(g.getAttribute('position').array).every(Number.isFinite));

  it('builds slip straps, a halter band, buttons and fringe as their own parts', () => {
    const slip = buildPieceParts({ ...base, straps: 'slip', neckline: 'cowl', back: 0.12 }, HERO_DETAIL);
    const plain = buildPieceParts(base, HERO_DETAIL);
    expect(slip.main.length).toBe(plain.main.length + 2);
    const halter = buildPieceParts({ ...base, straps: 'halter', back: 0.2, slit: 0.3 }, HERO_DETAIL);
    expect(halter.main.length).toBe(plain.main.length + 1);
    const blazer = buildPieceParts({ ...base, hem: 0.6, sleeve: 0.56, neckline: 'v', neck: 0.15, buttons: 6, shoulders: 0.8 }, HERO_DETAIL);
    expect(blazer.trim).toHaveLength(6);
    const fringe = buildPieceParts({ ...base, hem: 0.66, fringe: 0.1 }, HERO_DETAIL);
    expect(fringe.fringe).toHaveLength(1);
    const tiers = buildPieceParts({ ...base, kind: 'skirt', hem: 0.64, tiers: 3, drape: 0.5 }, HERO_DETAIL);
    for (const parts of [slip, halter, blazer, fringe, tiers]) expect(finite([...parts.main, ...parts.trim, ...parts.fringe])).toBe(true);
  });

  it('a slip or halter has no sleeves to add; a slip keeps its straight top edge', () => {
    const slip = { ...base, straps: 'slip' as const, sleeve: 0.5 };
    expect(buildPieceParts(slip, HERO_DETAIL).main.length).toBe(buildPieceParts({ ...slip, sleeve: 0 }, HERO_DETAIL).main.length);
    expect(cannotTailor(slip, 'sleeve')).toBe(true);
    expect(cannotTailor(slip, 'neck')).toBe(true);
    expect(cannotTailor({ ...base, straps: 'halter' }, 'neck')).toBe(false);
  });

  it('shared links carry the modern details, and drop unknown ones', () => {
    const piece: GarmentPiece = { ...base, straps: 'halter', neckline: 'sweetheart', back: 0.2, slit: 0.3, tiers: 3, buttons: 6, fringe: 0.1, corset: true };
    const back = decodeLook(encodeLook('Gala', [piece]))!.pieces[0];
    expect(back).toMatchObject({ straps: 'halter', neckline: 'sweetheart', back: 0.2, slit: 0.3, tiers: 3, buttons: 6, fringe: 0.1, corset: true });
  });

  it('names pieces by their cut', () => {
    expect(pieceName({ ...base, fabric: 'c:satin:brown', straps: 'slip' })).toBe('Brown satin midi slip dress');
    expect(pieceName({ ...base, fabric: 'c:sequin:silver', hem: 0.66, straps: 'halter', fringe: 0.1 })).toBe('Silver sequin mini fringe dress');
    expect(pieceName({ kind: 'skirt', fabric: 'c:tulle:black', hem: 0.64, neck: 0, sleeve: 0, fit: 0.6, flare: 0.1, tiers: 3 })).toBe('Black tulle mini ruffle skirt');
  });
});
