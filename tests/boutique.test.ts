import { describe, expect, it } from 'vitest';
import { analyse, bestPick, BOUTIQUES } from '../src/atelier/boutique';
import { loadCloset } from '../src/atelier/closet';
import { VERDICTS } from '../src/atelier/stylist-contract';

const closet = loadCloset();

describe('boutique analysis', () => {
  it('gives every piece a verdict, consistent numbers and pairings that include it', () => {
    for (const b of BOUTIQUES) {
      for (const p of b.pieces) {
        const a = analyse(p, closet, b.occasion);
        expect(VERDICTS).toContain(a.verdict);
        expect(a.newOutfits).toBeGreaterThanOrEqual(0);
        if (a.newOutfits > 0) expect(a.costPerOutfit).toBe(Math.round(p.price / a.newOutfits));
        for (const pairing of a.pairings) expect(pairing).toContain('new');
      }
    }
  });

  it('a piece that unlocks nothing is never a buy', () => {
    for (const b of BOUTIQUES) {
      for (const p of b.pieces) {
        const a = analyse(p, [], b.occasion);
        if (a.newOutfits === 0) expect(a.verdict).not.toBe('buy');
      }
    }
  });

  it('best pick unlocks at least as many outfits as any other piece in the shop', () => {
    for (const b of BOUTIQUES) {
      const best = bestPick(b, closet);
      const max = Math.max(...b.pieces.map((p) => analyse(p, closet, b.occasion).newOutfits));
      expect(best.analysis.newOutfits).toBe(max);
    }
  });
});
