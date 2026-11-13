/**
 * The boutique: three original labels (no real-world brands), each with a
 * small collection, and the "shop against your closet" verdict.
 *
 * The verdict is grounded in facts the engine computes, never invented:
 *  - newOutfits: how many new wearable outfits the piece unlocks with the
 *    user's closet (dress alone; or top + bottom, optionally + one jacket);
 *  - costPerOutfit: price / newOutfits;
 *  - a near-duplicate already in the closet (same kind and colour).
 * Claude may phrase the verdict and pick the pairing (/api/stylist, mode
 * "boutique"), but the numbers always come from here.
 */
import type { ClosetItem } from './closet.js';
import type { GarmentPiece } from './garments.js';
import { piece } from './looks.js';
import { BoutiqueVerdict, Mood, Occasion, StylistItem, Weather } from './stylist-contract.js';
import { candidates, describeItem, score } from './stylist-engine.js';

export interface BoutiquePiece {
  id: string;
  name: string;
  price: number;
  blurb: string;
  piece: GarmentPiece;
}

export interface Boutique {
  id: string;
  name: string;
  /** What the house is about (one line). */
  tagline: string;
  /** The boutique stylist's greeting. */
  host: string;
  /** The kind of day these clothes are for (drives the pairing). */
  occasion: Occasion;
  pieces: BoutiquePiece[];
}

export const BOUTIQUES: Boutique[] = [
  {
    id: 'maison-lune',
    name: 'Maison Lune',
    tagline: 'Evening pieces in velvet, satin and silk.',
    host: 'Bonsoir. Everything here is cut for the evening. Tap a piece and I will style it with your closet.',
    occasion: 'date',
    pieces: [
      { id: 'ml-slip', name: 'Velvet Slip Dress', price: 189, blurb: 'Bias-cut bordeaux velvet to mid-calf.', piece: piece({ kind: 'dress', fabric: 'bordeaux-velvet', hem: 0.28, neck: 0.1, sleeve: 0, fit: 0.85, flare: 0.08 }) },
      { id: 'ml-cami', name: 'Blush Satin Cami', price: 79, blurb: 'Fluid satin with a soft scoop.', piece: piece({ kind: 'top', fabric: 'blush-satin', hem: 0.95, neck: 0.08, sleeve: 0, fit: 0.55 }) },
      { id: 'ml-palazzo', name: 'Navy Satin Palazzo', price: 129, blurb: 'Wide, floor-skimming evening trousers.', piece: piece({ kind: 'trousers', fabric: 'navy-satin', hem: 0.05, fit: 0.4, flare: 0.09 }) },
      { id: 'ml-polka', name: 'Polka Silk Midi', price: 115, blurb: 'Noir polka silk with a gentle flare.', piece: piece({ kind: 'skirt', fabric: 'noir-polka', hem: 0.3, fit: 0.6, flare: 0.16 }) },
      { id: 'ml-tux', name: 'Noir Tuxedo Jacket', price: 245, blurb: 'Sharp shoulders, herringbone wool.', piece: piece({ kind: 'jacket', fabric: 'noir-wool', hem: 0.84, neck: 0.2, sleeve: 0.56, fit: 0.8 }) },
    ],
  },
  {
    id: 'studio-nord',
    name: 'Studio Nord',
    tagline: 'Quiet workwear that travels well.',
    host: 'Welcome to Studio Nord. Pieces for long days. Tap one and I will show you how it works with what you own.',
    occasion: 'work',
    pieces: [
      { id: 'sn-blazer', name: 'Chalk Stripe Blazer', price: 210, blurb: 'Soft-tailored pinstripe wool.', piece: piece({ kind: 'jacket', fabric: 'chalk-pinstripe', hem: 0.82, neck: 0.18, sleeve: 0.56, fit: 0.75 }) },
      { id: 'sn-blouse', name: 'Ivory Silk Blouse', price: 98, blurb: 'Long sleeves, clean neckline.', piece: piece({ kind: 'top', fabric: 'ivory-silk', hem: 0.9, neck: 0.04, sleeve: 0.55, fit: 0.5 }) },
      { id: 'sn-trouser', name: 'Charcoal Trousers', price: 120, blurb: 'Straight leg, full length.', piece: piece({ kind: 'trousers', fabric: 'charcoal-wool', hem: 0.05, fit: 0.65, flare: 0.02 }) },
      { id: 'sn-pencil', name: 'Charcoal Pencil Skirt', price: 89, blurb: 'Knee length, close fit.', piece: piece({ kind: 'skirt', fabric: 'charcoal-wool', hem: 0.5, fit: 0.95, flare: 0 }) },
      { id: 'sn-knit', name: 'Onyx Fine Knit', price: 75, blurb: 'Fine-gauge knit for under everything.', piece: piece({ kind: 'top', fabric: 'onyx-knit', hem: 0.9, neck: 0.02, sleeve: 0.55, fit: 0.6 }) },
    ],
  },
  {
    id: 'sol-sable',
    name: 'Sol & Sable',
    tagline: 'Easy weekend linen, denim and print.',
    host: 'Hi! Weekend clothes, easy to wear. Tap a piece and I will mix it with your closet.',
    occasion: 'weekend',
    pieces: [
      { id: 'ss-floral', name: 'Garden Midi Dress', price: 110, blurb: 'Floral cotton with short sleeves.', piece: piece({ kind: 'dress', fabric: 'garden-floral', hem: 0.3, neck: 0.06, sleeve: 0.12, fit: 0.55, flare: 0.16 }) },
      { id: 'ss-breton', name: 'Breton Stripe Tee', price: 45, blurb: 'The stripe that goes with everything.', piece: piece({ kind: 'top', fabric: 'breton-stripe', hem: 0.92, neck: 0.03, sleeve: 0.3, fit: 0.45 }) },
      { id: 'ss-linen', name: 'Olive Linen Trousers', price: 85, blurb: 'Wide and breezy.', piece: piece({ kind: 'trousers', fabric: 'olive-linen', hem: 0.08, fit: 0.35, flare: 0.08 }) },
      { id: 'ss-denim', name: 'Indigo Denim Jacket', price: 95, blurb: 'Boxy, hip length.', piece: piece({ kind: 'jacket', fabric: 'indigo-denim', hem: 0.9, neck: 0.16, sleeve: 0.55, fit: 0.4 }) },
      { id: 'ss-gingham', name: 'Rose Gingham Skirt', price: 65, blurb: 'Above the knee, swingy.', piece: piece({ kind: 'skirt', fabric: 'rose-gingham', hem: 0.62, fit: 0.5, flare: 0.14 }) },
    ],
  },
];

// ------------------------------------------------------------------ verdict

export interface BoutiqueAnalysis {
  /** The candidate described for the stylist (id "new"). */
  candidate: StylistItem;
  closetOutfits: number;
  newOutfits: number;
  costPerOutfit: number;
  /** A closet piece that is very close (same kind + colour), if any. */
  duplicate?: StylistItem;
  /** Best pairings (item id lists, each including "new"), best first. */
  pairings: string[][];
  verdict: BoutiqueVerdict;
  reason: string;
}

const NEW_ID = 'new';

export function describeCandidate(p: BoutiquePiece): StylistItem {
  return describeItem({ id: NEW_ID, name: p.name, piece: p.piece });
}

/** Shop against the closet: what does this piece add to what I own? */
export function analyse(
  bp: BoutiquePiece,
  closet: ClosetItem[],
  occasion: Occasion,
  weather: Weather = 'mild',
  mood: Mood = 'classic',
): BoutiqueAnalysis {
  const items = closet.map(describeItem);
  const candidate = describeCandidate(bp);
  const before = candidates(items).length;
  const withNew = candidates([...items, candidate]).filter((o) => o.some((i) => i.id === NEW_ID));
  const newOutfits = withNew.length;
  // Show the new piece first: a jacket from the closet would cover a
  // boutique top or dress, so open with a pairing that leaves it visible.
  const covers = (o: StylistItem[]) =>
    candidate.kind !== 'jacket' &&
    candidate.kind !== 'trousers' &&
    candidate.kind !== 'skirt' &&
    o.some((i) => i.kind === 'jacket');
  const ranked = withNew
    .map((o) => ({ o, s: score(o, occasion, weather, mood) - (covers(o) ? 10 : 0) }))
    .sort((a, b) => b.s - a.s)
    .map(({ o }) => o.map((i) => i.id));
  const duplicate = items.find(
    (i) => i.kind === candidate.kind && i.color.toLowerCase() === candidate.color.toLowerCase(),
  );
  const costPerOutfit = Math.round(bp.price / Math.max(1, newOutfits));

  let verdict: BoutiqueVerdict;
  if (duplicate) verdict = 'skip';
  else if (newOutfits >= 4 && costPerOutfit <= 60) verdict = 'buy';
  else if (newOutfits >= 2) verdict = 'maybe';
  else verdict = 'skip';

  const partners = (ranked[0] ?? [])
    .filter((id) => id !== NEW_ID)
    .map((id) => items.find((i) => i.id === id)?.name.toLowerCase())
    .filter(Boolean) as string[];
  const withWhat = partners.length ? ` Best with your ${partners.join(' and ')}.` : '';
  let reason: string;
  if (duplicate) {
    reason = `You already own something very close - your ${duplicate.name.toLowerCase()}. Spend on something new to you.`;
  } else if (newOutfits === 0) {
    reason = `Nothing in your closet completes it yet, so it would hang alone.`;
  } else if (verdict === 'buy') {
    reason = `It works hard: ${newOutfits} new outfits at about $${costPerOutfit} each.${withWhat}`;
  } else if (verdict === 'maybe') {
    reason = `${newOutfits} new outfits at about $${costPerOutfit} each - good, not essential.${withWhat}`;
  } else {
    reason = `Only ${newOutfits} new outfit${newOutfits === 1 ? '' : 's'} with what you own.${withWhat}`;
  }
  return {
    candidate,
    closetOutfits: before,
    newOutfits,
    costPerOutfit,
    duplicate,
    pairings: ranked.slice(0, 3),
    verdict,
    reason,
  };
}

/** The piece in a boutique that adds the most to this closet. */
export function bestPick(b: Boutique, closet: ClosetItem[]): { piece: BoutiquePiece; analysis: BoutiqueAnalysis } {
  let best = { piece: b.pieces[0], analysis: analyse(b.pieces[0], closet, b.occasion) };
  for (const p of b.pieces.slice(1)) {
    const a = analyse(p, closet, b.occasion);
    const rank = (x: BoutiqueAnalysis) => (x.verdict === 'buy' ? 2 : x.verdict === 'maybe' ? 1 : 0) * 100 + x.newOutfits;
    if (rank(a) > rank(best.analysis)) best = { piece: p, analysis: a };
  }
  return best;
}
