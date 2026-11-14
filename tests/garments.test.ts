import { describe, expect, it } from 'vitest';
import { buildPieceGeometries, HERO_DETAIL, paramFromPin, pinPosition, RANGES, TailorParam } from '../src/atelier/garments';
import { LOOKS, cloneLook } from '../src/atelier/looks';

describe('tailoring maths', () => {
  it('a pin placed where a measurement is reads back that measurement', () => {
    for (const look of LOOKS) {
      for (const piece of cloneLook(look)) {
        for (const param of ['hem', 'neck', 'sleeve'] as TailorParam[]) {
          const r = RANGES[piece.kind][param];
          if (!r || (param !== 'hem' && piece.strapless)) continue;
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
