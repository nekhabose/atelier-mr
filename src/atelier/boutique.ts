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
    tagline: 'Evening velvet, satin and sequins.',
    host: 'Bonsoir. Everything here is cut for the evening. Tap a piece and I will style it with your closet.',
    occasion: 'date',
    pieces: [
      { id: 'ml-slip', name: 'Velvet Slip Maxi', price: 189, blurb: 'Bordeaux velvet on fine straps, to the floor.', piece: piece({ kind: 'dress', fabric: 'bordeaux-velvet', hem: 0.06, neck: 0.06, neckline: 'v', fit: 0.9, flare: 0.08, straps: 'slip', back: 0.12 }) },
      { id: 'ml-cami', name: 'Cowl Satin Cami', price: 79, blurb: 'Blush satin that drapes at the neck.', piece: piece({ kind: 'top', fabric: 'blush-satin', hem: 0.95, neck: 0.06, neckline: 'cowl', fit: 0.55, straps: 'slip' }) },
      { id: 'ml-halter', name: 'Emerald Halter Maxi', price: 139, blurb: 'Bare back and a long slit.', piece: piece({ kind: 'dress', fabric: 'emerald-satin', hem: 0.06, neck: 0.03, fit: 0.92, flare: 0.08, straps: 'halter', back: 0.18, slit: 0.3 }) },
      { id: 'ml-fringe', name: 'Sequin Fringe Mini', price: 99, blurb: 'Champagne sequins with a swinging fringe.', piece: piece({ kind: 'dress', fabric: 'champagne-sequin', hem: 0.66, neck: 0.03, fit: 0.92, flare: 0.05, straps: 'halter', back: 0.12, fringe: 0.1 }) },
      { id: 'ml-tux', name: 'Satin Tuxedo Blazer', price: 169, blurb: 'Onyx satin, double-breasted.', piece: piece({ kind: 'jacket', fabric: 'onyx-satin', hem: 0.84, neck: 0.2, sleeve: 0.56, fit: 0.8, buttons: 4, shoulders: 0.6 }) },
    ],
  },
  {
    id: 'studio-nord',
    name: 'Studio Nord',
    tagline: 'Sharp workwear: crepe, leather, silk.',
    host: 'Welcome to Studio Nord. Pieces for long days. Tap one and I will show you how it works with what you own.',
    occasion: 'work',
    pieces: [
      { id: 'sn-blazer', name: 'Jewel Button Blazer Dress', price: 109, blurb: 'Black crepe, strong shoulders, gold buttons.', piece: piece({ kind: 'dress', fabric: 'noir-crepe', hem: 0.62, neck: 0.15, neckline: 'v', sleeve: 0.56, fit: 0.92, flare: 0.05, buttons: 6, shoulders: 0.8 }) },
      { id: 'sn-blouse', name: 'Ivory Silk Blouse', price: 98, blurb: 'Long sleeves and a soft cowl neck.', piece: piece({ kind: 'top', fabric: 'ivory-silk', hem: 0.9, neck: 0.06, neckline: 'cowl', sleeve: 0.55, fit: 0.5 }) },
      { id: 'sn-trouser', name: 'Wide Crepe Trousers', price: 89, blurb: 'High waist, wide leg, full length.', piece: piece({ kind: 'trousers', fabric: 'noir-crepe', hem: 0.04, fit: 0.5, flare: 0.08 }) },
      { id: 'sn-pencil', name: 'Leather Pencil Skirt', price: 119, blurb: 'Cocoa leather-look, a back-step slit.', piece: piece({ kind: 'skirt', fabric: 'cocoa-leather', hem: 0.4, fit: 0.95, flare: 0, slit: 0.14 }) },
      { id: 'sn-knit', name: 'Onyx Fine Knit', price: 75, blurb: 'Fine-gauge knit for under everything.', piece: piece({ kind: 'top', fabric: 'onyx-knit', hem: 0.9, neck: 0.02, sleeve: 0.55, fit: 0.7 }) },
    ],
  },
  {
    id: 'sol-sable',
    name: 'Sol & Sable',
    tagline: 'Going out: satin, tulle and leather.',
    host: 'Hi! Pieces for going out. Tap one and I will mix it with your closet.',
    occasion: 'party',
    pieces: [
      { id: 'ss-drape', name: 'Draped Satin Midi', price: 59, blurb: 'Plum satin gathered at the hip.', piece: piece({ kind: 'dress', fabric: 'plum-satin', hem: 0.3, neck: 0.05, sleeve: 0.1, fit: 0.82, flare: 0.08, drape: 0.7 }) },
      { id: 'ss-tulle', name: 'Tulle Ruffle Mini', price: 79, blurb: 'Three tiers of black tulle.', piece: piece({ kind: 'skirt', fabric: 'noir-tulle', hem: 0.64, fit: 0.6, flare: 0.1, tiers: 3 }) },
      { id: 'ss-corset', name: 'Satin Corset Mini', price: 79, blurb: 'Garnet satin, sweetheart neckline.', piece: piece({ kind: 'dress', fabric: 'garnet-satin', hem: 0.64, neck: 0.04, neckline: 'sweetheart', fit: 1, flare: 0.06, strapless: true, corset: true }) },
      { id: 'ss-denim', name: 'Wide Indigo Jeans', price: 59, blurb: 'Full length, wide leg.', piece: piece({ kind: 'trousers', fabric: 'indigo-denim', hem: 0.04, fit: 0.45, flare: 0.08 }) },
      { id: 'ss-leather', name: 'Leather Mini Dress', price: 89, blurb: 'Cocoa leather-look, square neck.', piece: piece({ kind: 'dress', fabric: 'cocoa-leather', hem: 0.62, neck: 0.05, neckline: 'square', fit: 0.95, flare: 0.04, straps: 'slip' }) },
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
