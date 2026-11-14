/**
 * The stylist's offline brain. Describes closet pieces in words for Claude
 * (see /api/stylist) and, when the network or the API is unavailable, picks
 * and explains an outfit itself by scoring every wearable combination.
 */
import type { ClosetItem } from './closet.js';
import { fabricById, parseClosetFabric, CLOSET_COLORS, CLOSET_MATERIALS } from './fabrics.js';
import type { GarmentPiece } from './garments.js';
import {
  isWearable,
  LENGTHS,
  Mood,
  Occasion,
  SLEEVES,
  StylistItem,
  StylistResponse,
  Weather,
} from './stylist-contract.js';

// ------------------------------------------------------------------ describe

function lengthOf(p: GarmentPiece): (typeof LENGTHS)[number] {
  if (p.kind === 'top' || p.kind === 'jacket') {
    if (p.hem > 1.0) return 'cropped';
    return p.hem < 0.7 ? 'knee' : 'hip';
  }
  if (p.hem >= 0.62) return 'mini';
  if (p.hem >= 0.45) return 'knee';
  if (p.hem >= 0.22) return 'midi';
  if (p.hem >= 0.05) return 'ankle';
  return 'floor';
}

function sleevesOf(p: GarmentPiece): (typeof SLEEVES)[number] {
  if (p.kind === 'trousers' || p.kind === 'skirt' || p.strapless || p.sleeve <= 0.01) return 'none';
  if (p.sleeve < 0.2) return 'short';
  if (p.sleeve < 0.4) return 'elbow';
  return 'long';
}

/** Words for colour + fabric (library fabrics use their own name). */
function colourAndFabric(p: GarmentPiece): { color: string; fabric: string } {
  const closet = parseClosetFabric(p.fabric);
  if (closet) {
    return {
      color: CLOSET_COLORS.find((c) => c.key === closet.color)!.name,
      fabric: CLOSET_MATERIALS.find((m) => m.key === closet.material)!.name,
    };
  }
  const f = fabricById(p.fabric);
  const [first, ...rest] = f.name.split(' ');
  return { color: first, fabric: rest.join(' ') || f.finish };
}

const safe = (s: string) => s.replace(/[^A-Za-z -]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 48) || 'Piece';

export function describeItem(item: ClosetItem): StylistItem {
  const { color, fabric } = colourAndFabric(item.piece);
  return {
    id: item.id,
    name: safe(item.name),
    kind: item.piece.kind,
    color: safe(color),
    fabric: safe(fabric),
    length: lengthOf(item.piece),
    sleeves: sleevesOf(item.piece),
  };
}

// ------------------------------------------------------------------ score

const NEUTRAL = new Set(['white', 'cream', 'camel', 'navy', 'grey', 'black', 'ivory', 'charcoal', 'noir', 'onyx', 'cloud', 'chalk']);
const PATTERNED = new Set(['stripe', 'check', 'plaid', 'dots', 'floral', 'pinstripe', 'gingham', 'polka', 'herringbone']);
const FORMALITY: Record<string, number> = {
  satin: 0.8, silk: 0.8, velvet: 0.85, wool: 0.85, pinstripe: 0.9, herringbone: 0.85,
  cotton: 0.45, linen: 0.4, knit: 0.4, denim: 0.2, stripe: 0.35, check: 0.35,
  plaid: 0.5, dots: 0.45, floral: 0.35, gingham: 0.35, polka: 0.45,
};
const TARGET: Record<Occasion, number> = {
  interview: 0.85, work: 0.65, date: 0.6, party: 0.6, travel: 0.35, weekend: 0.25,
};

const word = (s: string) => s.toLowerCase().split(' ').pop() ?? '';
const fabricKey = (i: StylistItem) => word(i.fabric);
const isNeutral = (i: StylistItem) => NEUTRAL.has(i.color.toLowerCase());
const isPattern = (i: StylistItem) => PATTERNED.has(fabricKey(i));

export function score(outfit: StylistItem[], occasion: Occasion, weather: Weather, mood: Mood): number {
  const jacket = outfit.some((i) => i.kind === 'jacket');
  let formality = outfit.reduce((s, i) => s + (FORMALITY[fabricKey(i)] ?? 0.5), 0) / outfit.length;
  if (jacket) formality += 0.15;
  let s = -Math.abs(formality - TARGET[occasion]) * 3;

  const longSleeve = outfit.some((i) => i.sleeves === 'long');
  const covered = outfit.some((i) => i.kind === 'trousers' || ['midi', 'ankle', 'floor'].includes(i.length));
  const mini = outfit.some((i) => i.length === 'mini');
  const delicate = outfit.some((i) => ['satin', 'silk', 'velvet'].includes(fabricKey(i)));
  switch (weather) {
    case 'cold':
      s += (jacket ? 1 : 0) + (longSleeve ? 0.5 : 0) + (covered ? 0.5 : 0) - (mini ? 0.8 : 0);
      s += outfit.some((i) => ['wool', 'knit'].includes(fabricKey(i))) ? 0.3 : 0;
      break;
    case 'warm':
      s += (jacket ? -1 : 0) + (longSleeve ? -0.4 : 0.3);
      s += outfit.some((i) => i.kind === 'skirt' || i.kind === 'dress') ? 0.3 : 0;
      s -= outfit.some((i) => fabricKey(i) === 'wool') ? 0.5 : 0;
      break;
    case 'rainy':
      s += (jacket ? 1 : 0) - (delicate ? 0.6 : 0) - (mini ? 0.5 : 0) + (covered ? 0.4 : 0);
      break;
    case 'mild':
      s += jacket ? 0.2 : 0;
      break;
  }

  const bold = outfit.filter((i) => !isNeutral(i) || isPattern(i)).length;
  const neutrals = outfit.filter(isNeutral).length;
  const patterns = outfit.filter(isPattern).length;
  if (mood === 'bold') s += Math.min(1.2, bold * 0.6);
  if (mood === 'classic') s += neutrals * 0.4 - (patterns > 1 ? 0.5 : 0);
  if (mood === 'relaxed') {
    s += outfit.filter((i) => ['knit', 'cotton', 'denim', 'linen'].includes(fabricKey(i))).length * 0.4;
    s -= delicate ? 0.4 : 0;
  }
  // Harmony: one statement at a time.
  if (patterns > 1) s -= 1.2;
  const loud = new Set(outfit.filter((i) => !isNeutral(i)).map((i) => i.color.toLowerCase()));
  if (loud.size > 1) s -= 0.6;
  return s;
}

/** Every wearable combination in the closet. */
export function candidates(items: StylistItem[]): StylistItem[][] {
  const of = (k: string) => items.filter((i) => i.kind === k);
  const bases: StylistItem[][] = [...of('dress').map((d) => [d])];
  for (const t of of('top')) {
    for (const b of [...of('trousers'), ...of('skirt')]) bases.push([t, b]);
  }
  const out: StylistItem[][] = [];
  for (const base of bases) {
    out.push(base);
    for (const j of of('jacket')) out.push([...base, j]);
  }
  return out.filter((o) => isWearable(o.map((i) => i.kind)));
}

// ------------------------------------------------------------------ explain

const TITLES: Record<Occasion, string[]> = {
  work: ['Desk to Dinner', 'Monday, Mastered', 'Quietly in Charge'],
  interview: ['Quiet Confidence', 'First Impression', 'Hired on Sight'],
  date: ['Evening Edit', 'Golden Hour', 'Second Glance'],
  weekend: ['Easy Saturday', 'Market Morning', 'Slow Sunday'],
  party: ['After Dark', 'Main Character', 'Last Dance'],
  travel: ['Carry-On Chic', 'Window Seat', 'Arrivals Hall'],
};
const OCCASION_WHY: Record<Occasion, string> = {
  work: 'polished enough for meetings, easy enough for a long day',
  interview: 'clean lines that read as prepared and self-assured',
  date: 'relaxed but clearly considered',
  weekend: 'comfortable pieces that still look put together',
  party: 'a look with enough presence for the room',
  travel: 'easy layers that move with you and resist creasing',
};
const WEATHER_WHY: Record<Weather, string> = {
  warm: 'light and breathable for the heat',
  mild: 'balanced for an in-between day',
  cold: 'layered and covered against the cold',
  rainy: 'covered up and practical for the rain',
};
const TIPS: Record<Weather, string> = {
  warm: 'Roll the sleeves once and add a slim sandal to keep it airy.',
  mild: 'Carry the outer layer over your shoulders for the evening chill.',
  cold: 'Add a fine knit underneath and a boot to seal in warmth.',
  rainy: 'Choose a closed shoe and keep the darkest piece closest to the ground.',
};

export interface StylistResult extends StylistResponse {
  source: 'claude' | 'offline';
}

export interface StylistPlan {
  /** Ranked, distinct outfits (best first). */
  options: StylistResult[];
  /** How many wearable combinations the closet allowed. */
  considered: number;
  /** A missing piece worth adding for this kind of day, if any. */
  gap?: string;
}

const listOf = (names: string[]) =>
  names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];

function explain(outfit: StylistItem[], occasion: Occasion, weather: Weather, mood: Mood): string {
  const names = outfit.map((i) => i.name.toLowerCase());
  const jacket = outfit.find((i) => i.kind === 'jacket');
  const statement = outfit.find((i) => isPattern(i) || !isNeutral(i));
  let extra = mood === 'bold' ? ' The colour does the talking.' : mood === 'classic' ? ' Timeless, no fuss.' : ' Comfort first.';
  if (mood === 'bold' && statement) extra = ` The ${statement.name.toLowerCase()} is the statement.`;
  if (mood === 'classic' && jacket) extra = ` The ${jacket.name.toLowerCase()} adds structure.`;
  return `Your ${listOf(names)} - ${OCCASION_WHY[occasion]}, and ${WEATHER_WHY[weather]}.${extra}`;
}

/** Spot the one piece that would most improve options for this day. */
function findGap(items: StylistItem[], occasion: Occasion, weather: Weather, mood: Mood, best: number): string | undefined {
  const has = (k: string) => items.some((i) => i.kind === k);
  if ((weather === 'cold' || weather === 'rainy') && !has('jacket')) {
    return 'Gap: no jacket yet - add one with New piece for colder days.';
  }
  if (mood === 'bold' && items.every((i) => isNeutral(i) && !isPattern(i))) {
    return 'Gap: everything is neutral - one colour or pattern piece would help bold days.';
  }
  if (TARGET[occasion] >= 0.8 && best < -0.6) {
    return 'Gap: nothing dressy enough - a wool or satin piece would sharpen this.';
  }
  if (weather === 'warm' && items.filter((i) => i.sleeves !== 'long' && i.kind !== 'jacket').length < 2) {
    return 'Gap: few light pieces - a short-sleeve top or a skirt would help in the heat.';
  }
  return undefined;
}

/** Plan up to `count` distinct outfits and explain each, without the network. */
export function planOffline(
  items: StylistItem[],
  occasion: Occasion,
  weather: Weather,
  mood: Mood,
  count = 3,
  seed = Date.now(),
  /** Only outfits with this closet piece in them (build a look around it). */
  include?: string,
): StylistPlan {
  const all = candidates(items).filter((o) => !include || o.some((i) => i.id === include));
  const scored = all
    .map((o, i) => ({ o, s: score(o, occasion, weather, mood) + (((seed >> (i % 16)) & 7) / 7) * 0.25 }))
    .sort((a, b) => b.s - a.s);
  // Distinct: each option must change the base (dress, or top + bottom).
  const chosen: StylistItem[][] = [];
  const baseKey = (o: StylistItem[]) => o.filter((i) => i.kind !== 'jacket').map((i) => i.id).sort().join('+');
  for (const { o } of scored) {
    if (chosen.length >= count) break;
    if (chosen.some((c) => baseKey(c) === baseKey(o))) continue;
    chosen.push(o);
  }
  // A small closet may only have one base: allow jacket variations then.
  for (const { o } of scored) {
    if (chosen.length >= count) break;
    if (!chosen.includes(o)) chosen.push(o);
  }
  const titles = TITLES[occasion];
  const options = chosen.map((o, k) => ({
    itemIds: o.map((i) => i.id),
    title: titles[(Math.abs(seed) + k) % titles.length],
    reason: explain(o, occasion, weather, mood),
    tip: TIPS[weather],
    source: 'offline' as const,
  }));
  return {
    options,
    considered: all.length,
    gap: findGap(items, occasion, weather, mood, scored[0]?.s ?? -9),
  };
}

/** The single best offline outfit (kept for callers that want one answer). */
export function styleOffline(
  items: StylistItem[],
  occasion: Occasion,
  weather: Weather,
  mood: Mood,
  seed = Date.now(),
): StylistResult | null {
  return planOffline(items, occasion, weather, mood, 1, seed).options[0] ?? null;
}
