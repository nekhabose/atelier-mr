import { describe, expect, it } from 'vitest';
import { planTailorOffline } from '../src/atelier/tailor';
import { applyRefine, describeOutfit } from '../src/atelier/refine';
import { LOOKS, cloneLook } from '../src/atelier/looks';
import { parseClosetFabric } from '../src/atelier/fabrics';

const dressLook = LOOKS.find((l) => l.pieces.length === 1 && l.pieces[0].kind === 'dress')!;
const layered = LOOKS.find((l) => l.pieces.some((p) => p.kind === 'jacket'))!;

describe('tailor in plain words (on device)', () => {
  it('midi with long sleeves edits the dress', () => {
    const pieces = cloneLook(dressLook);
    const reply = planTailorOffline('Make the dress midi with long sleeves', describeOutfit(pieces))!;
    expect(reply.edits).toHaveLength(1);
    expect(reply.edits[0]).toMatchObject({ piece: 'p0', length: 'midi', sleeves: 'long' });
    const { pieces: next, changed } = applyRefine(pieces, reply, []);
    expect(changed).toBe(true);
    expect(next[0].hem).toBeCloseTo(0.3, 2);
  });

  it('colour and fabric words become a closet fabric', () => {
    const pieces = cloneLook(dressLook);
    const reply = planTailorOffline('red silk please', describeOutfit(pieces))!;
    const { pieces: next } = applyRefine(pieces, reply, []);
    expect(parseClosetFabric(next[0].fabric)).toMatchObject({ color: 'red', material: 'satin' });
  });

  it('a named piece is the one changed; sleeves go to the outer layer', () => {
    const pieces = cloneLook(layered);
    const outfit = describeOutfit(pieces);
    const jacket = outfit.find((i) => i.kind === 'jacket')!;
    const reply = planTailorOffline('navy jacket with short sleeves', outfit)!;
    expect(reply.edits.map((e) => e.piece)).toEqual([jacket.id]);
    expect(reply.edits[0]).toMatchObject({ color: 'navy', sleeves: 'short' });
  });

  it('asking for a piece that is not worn changes nothing', () => {
    const reply = planTailorOffline('make the skirt red', describeOutfit(cloneLook(dressLook)))!;
    expect(reply.edits).toEqual([]);
  });

  it('returns null for requests it cannot read (they go to the live AI)', () => {
    expect(planTailorOffline('something more elegant for a gallery', describeOutfit(cloneLook(dressLook)))).toBeNull();
    expect(planTailorOffline('', describeOutfit(cloneLook(dressLook)))).toBeNull();
  });
});
