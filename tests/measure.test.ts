import { describe, expect, it } from 'vitest';
import { measureCm, measureText, TailorParam } from '../src/atelier/garments';
import { cloneLook, LOOKS } from '../src/atelier/looks';

describe('tape measure readout', () => {
  const pieces = LOOKS.flatMap((l) => cloneLook(l));

  it('gives plausible centimetres for every measurement of every look', () => {
    for (const p of pieces) {
      expect(measureCm(p, 'hem')).toBeGreaterThan(0);
      expect(measureCm(p, 'hem')).toBeLessThan(172);
      expect(measureCm(p, 'neck')).toBeGreaterThanOrEqual(0);
      expect(measureCm(p, 'neck')).toBeLessThan(45);
      expect(measureCm(p, 'sleeve')).toBeLessThan(70);
      // A waist round on the standard form: roughly 60-110 cm with ease.
      expect(measureCm(p, 'fit')).toBeGreaterThan(55);
      expect(measureCm(p, 'fit')).toBeLessThan(115);
    }
  });

  it('a longer hem reads lower, and a taller or wider body reads larger', () => {
    const p = { ...pieces.find((x) => (x.kind === 'skirt' || x.kind === 'dress') && x.hem > 0.3)! };
    const before = measureCm(p, 'hem');
    p.hem -= 0.1;
    expect(Math.abs(measureCm(p, 'hem') - (before - 10))).toBeLessThanOrEqual(1);
    expect(measureCm(p, 'hem', 1, 1.1)).toBeGreaterThan(measureCm(p, 'hem'));
    expect(measureCm(p, 'fit', 1.1, 1)).toBeGreaterThan(measureCm(p, 'fit'));
  });

  it('reads in plain words', () => {
    const p = pieces[0];
    for (const param of ['hem', 'neck', 'sleeve', 'fit'] as TailorParam[]) {
      expect(measureText(p, param)).toMatch(/^(Hem|Neckline|Sleeve|Sleeveless|Waist)/);
    }
    expect(measureText({ ...p, sleeve: 0 }, 'sleeve')).toBe('Sleeveless');
  });
});
