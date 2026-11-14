/**
 * Plan ahead from the closet: a week of outfits (one per day, varied, fitted
 * to each day's occasion) and a packing list (the fewest pieces that make an
 * outfit for every day of a trip). Pure functions over the stylist's scoring.
 */
import { candidates, score } from './stylist-engine.js';
import type { Mood, Occasion, StylistItem, Weather } from './stylist-contract.js';

export interface DayPlan {
  day: string;
  occasion: Occasion;
  itemIds: string[];
}

export const WEEK: { day: string; occasion: Occasion }[] = [
  { day: 'Mon', occasion: 'work' },
  { day: 'Tue', occasion: 'work' },
  { day: 'Wed', occasion: 'work' },
  { day: 'Thu', occasion: 'work' },
  { day: 'Fri', occasion: 'date' },
  { day: 'Sat', occasion: 'weekend' },
  { day: 'Sun', occasion: 'weekend' },
];

export interface WeekPlan {
  days: DayPlan[];
  /** Different outfits in the plan. */
  outfits: number;
  /** Closet pieces the plan uses. */
  pieces: number;
}

const key = (ids: string[]) => [...ids].sort().join('+');

/**
 * One outfit per day: the best-scoring outfit for the day's occasion, with a
 * penalty for pieces already worn this week (and a bigger one for repeating a
 * whole outfit), so the week is varied without dropping the fit.
 */
export function planWeek(
  items: StylistItem[],
  weather: Weather,
  mood: Mood,
  days: { day: string; occasion: Occasion }[] = WEEK,
): WeekPlan {
  const all = candidates(items);
  const uses = new Map<string, number>();
  const worn = new Set<string>();
  const out: DayPlan[] = [];
  for (const d of days) {
    let best: StylistItem[] | undefined;
    let bestScore = -Infinity;
    for (const o of all) {
      let s = score(o, d.occasion, weather, mood);
      for (const i of o) s -= 0.6 * (uses.get(i.id) ?? 0);
      if (worn.has(key(o.map((i) => i.id)))) s -= 2;
      if (s > bestScore) {
        bestScore = s;
        best = o;
      }
    }
    if (!best) break;
    const ids = best.map((i) => i.id);
    for (const id of ids) uses.set(id, (uses.get(id) ?? 0) + 1);
    worn.add(key(ids));
    out.push({ day: d.day, occasion: d.occasion, itemIds: ids });
  }
  return { days: out, outfits: worn.size, pieces: uses.size };
}

export interface PackingPlan {
  days: DayPlan[];
  /** The pieces to pack (closet item ids). */
  pack: string[];
  outfits: number;
}

/**
 * A trip of `nights + 1` days: prefers outfits made from pieces already
 * packed, so the suitcase stays small, while still wanting a different
 * outfit each day where the closet allows it.
 */
export function planPacking(items: StylistItem[], weather: Weather, mood: Mood, days: number): PackingPlan {
  const all = candidates(items);
  const packed = new Set<string>();
  const worn = new Set<string>();
  const plan: DayPlan[] = [];
  for (let n = 0; n < days; n++) {
    let best: StylistItem[] | undefined;
    let bestScore = -Infinity;
    for (const o of all) {
      let s = score(o, 'travel', weather, mood);
      for (const i of o) s += packed.has(i.id) ? 0.7 : -0.9;
      if (worn.has(key(o.map((i) => i.id)))) s -= 1.2;
      if (s > bestScore) {
        bestScore = s;
        best = o;
      }
    }
    if (!best) break;
    const ids = best.map((i) => i.id);
    ids.forEach((id) => packed.add(id));
    worn.add(key(ids));
    plan.push({ day: `Day ${n + 1}`, occasion: 'travel', itemIds: ids });
  }
  return { days: plan, pack: [...packed], outfits: worn.size };
}
