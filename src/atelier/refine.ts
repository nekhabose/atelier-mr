/**
 * Refining a previewed outfit: "Warmer", "Dressier", "More colour".
 *
 * The stylist answers with a small list of edits (length, sleeves, material,
 * colour per piece, plus optionally a closet jacket to layer on). Claude
 * produces them through /api/stylist; planRefineOffline produces them without
 * the network. applyRefine turns edits into real garment parameters, so the
 * change is visible on the form and undoable.
 */
import type { ClosetItem } from './closet.js';
import { pieceName } from './closet.js';
import { closetFabricId, ClosetColor, ClosetMaterial, parseClosetFabric } from './fabrics.js';
import { bareShoulders, GarmentPiece, RANGES } from './garments.js';
import {
  KEEP,
  LENGTHS,
  Mood,
  Occasion,
  PieceEdit,
  Refine,
  RefineReply,
  SLEEVES,
  StylistItem,
  Weather,
} from './stylist-contract.js';
import { describeItem } from './stylist-engine.js';

type Length = (typeof LENGTHS)[number];
type Sleeves = (typeof SLEEVES)[number];

/** Describe the pieces on the form with ids p0..pN. */
export function describeOutfit(pieces: GarmentPiece[]): StylistItem[] {
  return pieces.map((piece, i) => describeItem({ id: `p${i}`, name: pieceName(piece), piece }));
}

// ------------------------------------------------------------------ offline plan

const NEUTRAL = new Set(['white', 'cream', 'camel', 'navy', 'grey', 'black']);
const LONGER: Record<string, Length> = { mini: 'midi', knee: 'midi', midi: 'ankle' };
const CASUAL = new Set(['denim', 'cotton', 'knit', 'stripe', 'check', 'dots']);
const STATEMENT: Record<Occasion, ClosetColor> = {
  work: 'blue',
  interview: 'navy',
  date: 'red',
  party: 'red',
  weekend: 'green',
  travel: 'blue',
};

const edit = (piece: string): PieceEdit => ({ piece, length: KEEP, sleeves: KEEP, material: KEEP, color: KEEP });
const lower = (s: string) => s.toLowerCase();

export function planRefineOffline(
  refine: Refine,
  outfit: StylistItem[],
  closet: StylistItem[],
  occasion: Occasion,
  _weather: Weather,
  mood: Mood,
): RefineReply {
  const edits: PieceEdit[] = [];
  const said: string[] = [];
  const hasJacket = outfit.some((i) => i.kind === 'jacket');
  const jackets = closet.filter((i) => i.kind === 'jacket');
  let addItemId = '';
  const get = (id: string) => {
    let e = edits.find((x) => x.piece === id);
    if (!e) {
      e = edit(id);
      edits.push(e);
    }
    return e;
  };
  const fabricWord = (i: StylistItem) => lower(i.fabric.split(' ').pop() ?? '');

  if (refine === 'warmer') {
    if (!hasJacket && jackets.length > 0) {
      const j = jackets.find((x) => ['wool', 'knit'].includes(fabricWord(x))) ?? jackets[0];
      addItemId = j.id;
      said.push(`layered your ${lower(j.name)}`);
    }
    for (const i of outfit) {
      if ((i.kind === 'skirt' || i.kind === 'dress' || i.kind === 'trousers') && LONGER[i.length]) {
        const to = i.kind === 'trousers' ? 'ankle' : LONGER[i.length];
        get(i.id).length = to;
        said.push(`let the ${i.kind} down to ${to}`);
      }
      if ((i.kind === 'top' || i.kind === 'dress') && i.sleeves !== 'long') {
        get(i.id).sleeves = 'long';
        said.push(`added long sleeves to the ${i.kind}`);
      }
      if (i.kind === 'top' && ['cotton', 'satin', 'stripe', 'dots'].includes(fabricWord(i))) {
        get(i.id).material = 'knit';
        said.push('switched the top to knit');
      }
    }
  } else if (refine === 'dressier') {
    for (const i of outfit) {
      if (CASUAL.has(fabricWord(i))) {
        const to: ClosetMaterial = i.kind === 'trousers' || i.kind === 'jacket' ? 'wool' : 'satin';
        get(i.id).material = to;
        said.push(`made the ${i.kind} ${to}`);
      }
      if (i.length === 'mini' && i.kind !== 'trousers') {
        get(i.id).length = 'knee';
        said.push(`dropped the ${i.kind} to the knee`);
      }
    }
    if (!hasJacket && jackets.length > 0 && occasion !== 'party') {
      const j = jackets.find((x) => ['wool'].includes(fabricWord(x))) ?? jackets[0];
      addItemId = j.id;
      said.push(`added your ${lower(j.name)} for structure`);
    }
    // Already formal (lace, satin, a wool blazer): sharpen it further.
    if (said.length === 0) {
      const jacket = outfit.find((i) => i.kind === 'jacket' && fabricWord(i) !== 'satin');
      const base = outfit.find((i) => (i.kind === 'dress' || i.kind === 'skirt') && (i.length === 'knee' || i.length === 'midi'));
      if (jacket) {
        get(jacket.id).material = 'satin';
        said.push('recut the jacket in satin, tuxedo style');
      } else if (base) {
        const to = base.length === 'knee' ? 'midi' : 'ankle';
        get(base.id).length = to;
        said.push(`let the ${base.kind} down to ${to} for a longer line`);
      }
    }
  } else {
    const colourful = outfit.filter((i) => !NEUTRAL.has(lower(i.color)));
    const canvas = outfit.find((i) => i.kind !== 'jacket' && NEUTRAL.has(lower(i.color)));
    if (colourful.length === 0 && canvas) {
      const to = mood === 'classic' ? 'navy' === lower(canvas.color) ? 'red' : STATEMENT[occasion] : 'red';
      get(canvas.id).color = to;
      said.push(`turned the ${canvas.kind} ${to}`);
    } else if (canvas) {
      get(canvas.id).material = 'stripe';
      said.push(`gave the ${canvas.kind} a stripe to echo the colour`);
    } else if (outfit[0]) {
      get(outfit[0].id).color = 'pink';
      said.push(`switched the ${outfit[0].kind} to pink`);
    }
  }

  const label = refine === 'warmer' ? 'Warmer' : refine === 'dressier' ? 'Dressier' : 'More colour';
  const summary =
    said.length > 0
      ? `${label}: I ${listOf(said.slice(0, 4))}.`
      : `${label}: this look is already there - try another idea.`;
  return { summary, addItemId, edits: edits.slice(0, 4) };
}

function listOf(parts: string[]): string {
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
}

// ------------------------------------------------------------------ apply

const HEM: Record<string, Partial<Record<Length, number>>> = {
  bottom: { mini: 0.66, knee: 0.5, midi: 0.3, ankle: 0.1, floor: 0.06 },
  top: { cropped: 1.08, hip: 0.88, knee: 0.8 },
  jacket: { cropped: 1.04, hip: 0.9, knee: 0.74 },
};
const SLEEVE: Record<Sleeves, number> = { none: 0, short: 0.12, elbow: 0.3, long: 0.55 };

function clampParam(piece: GarmentPiece, param: 'hem' | 'sleeve', v: number): number {
  const r = RANGES[piece.kind][param];
  return r ? Math.min(r.max, Math.max(r.min, v)) : v;
}

/**
 * Apply a refine reply to copies of the pieces. Unknown piece ids and
 * impossible edits are skipped. Returns the new outfit and whether anything
 * changed.
 */
export function applyRefine(
  pieces: GarmentPiece[],
  reply: RefineReply,
  closet: ClosetItem[],
): { pieces: GarmentPiece[]; changed: boolean } {
  const next = pieces.map((p) => ({ ...p }));
  let changed = false;
  for (const e of reply.edits) {
    const idx = Number(e.piece.slice(1));
    const p = next[idx];
    if (!p || !/^p\d+$/.test(e.piece)) continue;
    if (e.length !== KEEP) {
      const table = p.kind === 'top' ? HEM.top : p.kind === 'jacket' ? HEM.jacket : HEM.bottom;
      const hem = table[e.length];
      if (hem !== undefined) {
        p.hem = clampParam(p, 'hem', hem);
        changed = true;
      }
    }
    if (e.sleeves !== KEEP && RANGES[p.kind].sleeve && !bareShoulders(p)) {
      p.sleeve = clampParam(p, 'sleeve', SLEEVE[e.sleeves]);
      changed = true;
    }
    const parsed = parseClosetFabric(p.fabric);
    // A designer-library fabric has no closet colour to keep: only a colour
    // edit (which names one) can replace it.
    if ((e.material !== KEEP && (parsed || e.color !== KEEP)) || e.color !== KEEP) {
      const now = parsed ?? { material: 'cotton' as ClosetMaterial, color: 'white' as ClosetColor };
      p.fabric = closetFabricId(
        e.material !== KEEP ? (e.material as ClosetMaterial) : now.material,
        e.color !== KEEP ? (e.color as ClosetColor) : now.color,
      );
      changed = true;
    }
  }
  if (reply.addItemId && !next.some((p) => p.kind === 'jacket')) {
    const jacket = closet.find((i) => i.id === reply.addItemId && i.piece.kind === 'jacket');
    if (jacket) {
      next.push({ ...jacket.piece });
      changed = true;
    }
  }
  return { pieces: next, changed };
}
