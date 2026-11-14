import { describe, expect, it } from 'vitest';
import { loadCloset } from '../src/atelier/closet';
import { describeItem } from '../src/atelier/stylist-engine';
import { isWearable } from '../src/atelier/stylist-contract';
import { planPacking, planWeek, WEEK } from '../src/atelier/planner';

const items = loadCloset().map(describeItem);
const kindOf = (id: string) => items.find((i) => i.id === id)!.kind;

describe('week planner', () => {
  it('plans a wearable outfit for every day of the week', () => {
    const plan = planWeek(items, 'mild', 'classic');
    expect(plan.days).toHaveLength(WEEK.length);
    for (const d of plan.days) expect(isWearable(d.itemIds.map(kindOf))).toBe(true);
  });

  it('varies the week: several outfits, never the same outfit two days running', () => {
    const plan = planWeek(items, 'cold', 'classic');
    expect(plan.outfits).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < plan.days.length; i++) {
      expect([...plan.days[i].itemIds].sort()).not.toEqual([...plan.days[i - 1].itemIds].sort());
    }
  });

  it('copes with an empty closet', () => {
    expect(planWeek([], 'mild', 'classic').days).toEqual([]);
  });
});

describe('packing list', () => {
  it('covers every day with packed pieces only, and packs fewer pieces than outfits need', () => {
    const plan = planPacking(items, 'mild', 'relaxed', 5);
    expect(plan.days).toHaveLength(5);
    const packed = new Set(plan.pack);
    for (const d of plan.days) {
      expect(d.itemIds.every((id) => packed.has(id))).toBe(true);
      expect(isWearable(d.itemIds.map(kindOf))).toBe(true);
    }
    const slots = plan.days.reduce((n, d) => n + d.itemIds.length, 0);
    expect(plan.pack.length).toBeLessThan(slots);
  });
});
