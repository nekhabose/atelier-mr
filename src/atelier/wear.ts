/**
 * What you actually wear: each closet piece keeps the days it was worn
 * (logged with "Wear today") and, optionally, what it cost. From that:
 * cost per wear, and the piece you have worn least, so the stylist can build
 * a look around it. Pure functions over closet items.
 */
import type { GarmentPiece } from './garments.js';

export interface WearInfo {
  id: string;
  name: string;
  piece: GarmentPiece;
  /** What it cost, in dollars (rough is fine). */
  price?: number;
  /** Local dates it was worn (YYYY-MM-DD), oldest first. */
  worn?: string[];
  /** Local date it was added to the closet. */
  added?: string;
}

/** Price choices on the closet panel. */
export const PRICES = [25, 50, 100, 200, 400] as const;

/**
 * The closet pieces on the form: the same kind and fabric (tailoring may have
 * changed the cut since). Each item is matched at most once.
 */
export function itemsOnForm(items: WearInfo[], pieces: GarmentPiece[]): string[] {
  const used = new Set<string>();
  for (const p of pieces) {
    const exact = items.find((i) => !used.has(i.id) && JSON.stringify(i.piece) === JSON.stringify(p));
    const close = exact ?? items.find((i) => !used.has(i.id) && i.piece.kind === p.kind && i.piece.fabric === p.fabric);
    if (close) used.add(close.id);
  }
  return [...used];
}

/** Log a wear for the day (once per day). Returns whether it was new. */
export function recordWear(item: WearInfo, date: string): boolean {
  const worn = (item.worn ??= []);
  if (worn.includes(date)) return false;
  worn.push(date);
  worn.sort();
  if (worn.length > 200) worn.splice(0, worn.length - 200);
  return true;
}

export function wearCount(item: WearInfo): number {
  return item.worn?.length ?? 0;
}

const money = (v: number) => (v >= 10 ? `$${Math.round(v)}` : `$${v.toFixed(2)}`);

/** "$45 a wear", "$90, not worn yet", or null without a price. */
export function costPerWear(item: WearInfo): string | null {
  if (!item.price) return null;
  const n = wearCount(item);
  return n === 0 ? `${money(item.price)}, not worn yet` : `${money(item.price / n)} a wear`;
}

function daysBetween(a: string, b: string): number {
  const t = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((t(b) - t(a)) / 86400000);
}

/**
 * The piece worn least recently: never-worn pieces first (oldest added first),
 * then by the longest time since last worn. Ties go to a piece you are not
 * already wearing (`onForm`).
 */
export function leastWorn(items: WearInfo[], today: string, onForm: string[] = []): WearInfo | undefined {
  let best: WearInfo | undefined;
  let bestKey = -Infinity;
  for (const item of items) {
    const last = item.worn?.[item.worn.length - 1];
    let key = last ? daysBetween(last, today) : 10000 + (item.added ? daysBetween(item.added, today) : 0);
    if (onForm.includes(item.id)) key -= 0.5;
    if (key > bestKey) {
      bestKey = key;
      best = item;
    }
  }
  return best;
}

/** One line about a piece: "Worn 3 times, last 12 days ago. $15 a wear." */
export function wearLine(item: WearInfo, today: string): string {
  const n = wearCount(item);
  const last = item.worn?.[n - 1];
  if (n === 0) return item.price ? `Not worn yet; it cost ${money(item.price)}.` : 'Not worn yet.';
  const ago = last ? daysBetween(last, today) : 0;
  const when = ago === 0 ? 'today' : ago === 1 ? 'yesterday' : `${ago} days ago`;
  const text = `Worn ${n === 1 ? 'once' : `${n} times`}, last ${when}.`;
  const cpw = costPerWear(item);
  return cpw ? `${text} ${cpw[0].toUpperCase()}${cpw.slice(1)}.` : text;
}
