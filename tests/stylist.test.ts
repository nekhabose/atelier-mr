import { describe, expect, it } from 'vitest';
import { loadCloset } from '../src/atelier/closet';
import { candidates, describeItem, planOffline } from '../src/atelier/stylist-engine';
import { isWearable, MAX_OPTIONS, OCCASIONS, MOODS, WEATHERS } from '../src/atelier/stylist-contract';
import { applyRefine, describeOutfit, planRefineOffline } from '../src/atelier/refine';

const closet = loadCloset();
const items = closet.map(describeItem);

describe('offline stylist planner', () => {
  it('only proposes wearable outfits made from closet items', () => {
    const ids = new Set(items.map((i) => i.id));
    for (const o of OCCASIONS) {
      for (const w of WEATHERS) {
        for (const m of MOODS) {
          const plan = planOffline(items, o, w, m, MAX_OPTIONS, 42);
          expect(plan.options.length).toBeGreaterThan(0);
          expect(plan.options.length).toBeLessThanOrEqual(MAX_OPTIONS);
          for (const opt of plan.options) {
            expect(opt.itemIds.every((id) => ids.has(id))).toBe(true);
            const kinds = opt.itemIds.map((id) => items.find((i) => i.id === id)!.kind);
            expect(isWearable(kinds)).toBe(true);
          }
        }
      }
    }
  });

  it('returns distinct options and reports how many it weighed', () => {
    const plan = planOffline(items, 'work', 'cold', 'classic', 3, 7);
    const keys = plan.options.map((o) => [...o.itemIds].sort().join('+'));
    expect(new Set(keys).size).toBe(keys.length);
    expect(plan.considered).toBe(candidates(items).length);
  });

  it('is deterministic for a given seed', () => {
    const a = planOffline(items, 'date', 'mild', 'bold', 3, 123);
    const b = planOffline(items, 'date', 'mild', 'bold', 3, 123);
    expect(a.options.map((o) => o.itemIds)).toEqual(b.options.map((o) => o.itemIds));
  });

  it('answers an empty closet without throwing', () => {
    expect(planOffline([], 'work', 'mild', 'classic').options).toEqual([]);
  });
});

describe('refine', () => {
  const plan = planOffline(items, 'weekend', 'warm', 'relaxed', 1, 1);
  const pieces = plan.options[0].itemIds.map((id) => ({ ...closet.find((c) => c.id === id)!.piece }));

  it('warmer makes the outfit cover more (lower hems or longer sleeves) or adds a layer', () => {
    const reply = planRefineOffline('warmer', describeOutfit(pieces), items, 'weekend', 'warm', 'relaxed');
    const { pieces: next, changed } = applyRefine(pieces, reply, closet);
    expect(changed).toBe(true);
    const cover = (ps: typeof pieces) => ps.reduce((s, p) => s + p.sleeve - p.hem, 0) + ps.length;
    expect(cover(next)).toBeGreaterThan(cover(pieces));
  });

  it('never edits pieces that are not on the form', () => {
    const reply = {
      summary: 'x',
      addItemId: '',
      edits: [{ piece: 'p9', length: 'floor', sleeves: 'long', material: 'satin', color: 'red' }],
    } as Parameters<typeof applyRefine>[1];
    const { pieces: next, changed } = applyRefine(pieces, reply, closet);
    expect(changed).toBe(false);
    expect(next).toEqual(pieces);
  });
});
