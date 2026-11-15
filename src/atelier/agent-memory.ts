/**
 * What the stylist agent remembers about you, learned only from what you do
 * with its work: Keep raises the traits of that outfit (its lengths, colours,
 * fabrics, layering, tailoring), Undo lowers them. Stored on this device
 * (localStorage), never sent anywhere except as the short notes the agent
 * reads with recall_preferences.
 */
import type { StylistItem } from './stylist-contract.js';

export const MEMORY_KEY = 'atelier.agent.memory.v1';
const MAX_TRAITS = 60;
const LIMIT = 5;

export interface AgentMemory {
  v: 1;
  kept: number;
  undone: number;
  /** Trait -> score, -5..5. */
  traits: Record<string, number>;
}

export interface Tailoring {
  measure: 'hem' | 'sleeve' | 'neckline';
  cm: number;
}

export const emptyMemory = (): AgentMemory => ({ v: 1, kept: 0, undone: 0, traits: {} });

const word = (s: string) => s.toLowerCase().replace(/[^a-z -]/g, '').trim();

/** The traits of an outfit worth remembering. */
export function outfitTraits(outfit: StylistItem[], tailoring: Tailoring[] = []): string[] {
  const out = new Set<string>();
  const dress = outfit.find((i) => i.kind === 'dress');
  out.add(dress ? 'shape:dress' : 'shape:separates');
  for (const item of outfit) {
    out.add(`color:${word(item.color)}`);
    out.add(`fabric:${word(item.fabric)}`);
    if (item.kind === 'dress' || item.kind === 'skirt') out.add(`length:${item.length}`);
    if (item.kind === 'jacket') out.add('layer:jacket');
  }
  for (const t of tailoring) out.add(`tailor:${t.measure}-${t.cm > 0 ? 'longer' : 'shorter'}`);
  return [...out];
}

/** Learn from a Keep (true) or an Undo (false). Returns a new memory. */
export function remember(m: AgentMemory, traits: string[], kept: boolean): AgentMemory {
  const next: AgentMemory = { v: 1, kept: m.kept + (kept ? 1 : 0), undone: m.undone + (kept ? 0 : 1), traits: { ...m.traits } };
  for (const t of traits) {
    const v = (next.traits[t] ?? 0) + (kept ? 1 : -1);
    next.traits[t] = Math.max(-LIMIT, Math.min(LIMIT, v));
    if (next.traits[t] === 0) delete next.traits[t];
  }
  const keys = Object.keys(next.traits);
  if (keys.length > MAX_TRAITS) {
    keys
      .sort((a, b) => Math.abs(next.traits[a]) - Math.abs(next.traits[b]))
      .slice(0, keys.length - MAX_TRAITS)
      .forEach((k) => delete next.traits[k]);
  }
  return next;
}

/** How well an outfit matches what you kept before (positive) or undid (negative). */
export function traitScore(m: AgentMemory, traits: string[]): number {
  return traits.reduce((sum, t) => sum + (m.traits[t] ?? 0), 0);
}

function words(trait: string): string {
  const [kind, value] = trait.split(':');
  switch (kind) {
    case 'length':
      return `${value} lengths`;
    case 'shape':
      return value === 'dress' ? 'dresses' : 'separates';
    case 'layer':
      return 'a jacket on top';
    case 'tailor': {
      const [measure, way] = value.split('-');
      return `${way} ${measure === 'neckline' ? 'necklines' : `${measure}s`}`;
    }
    default:
      return value;
  }
}

/** Short notes for the agent (and the plan card). Empty for a new user. */
export function preferenceNotes(m: AgentMemory): string[] {
  const runs = m.kept + m.undone;
  if (runs === 0) return [];
  const entries = Object.entries(m.traits);
  const liked = entries.filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const undid = entries.filter(([, v]) => v <= -1).sort((a, b) => a[1] - b[1]).slice(0, 3);
  const notes = [`Kept ${m.kept} of ${runs} earlier plan${runs === 1 ? '' : 's'}.`];
  if (liked.length) notes.push(`Likes: ${liked.map(([t]) => words(t)).join(', ')}.`);
  if (undid.length) notes.push(`Undid: ${undid.map(([t]) => words(t)).join(', ')}.`);
  return notes;
}

/** A saved memory, validated; a fresh one when missing or damaged. */
export function parseMemory(raw: unknown): AgentMemory {
  const m = raw as Partial<AgentMemory> | null;
  if (!m || m.v !== 1 || typeof m.kept !== 'number' || typeof m.undone !== 'number' || !m.traits || typeof m.traits !== 'object') {
    return emptyMemory();
  }
  const traits: Record<string, number> = {};
  for (const [k, v] of Object.entries(m.traits)) {
    if (/^[a-z]+:[a-z -]{1,40}$/.test(k) && typeof v === 'number' && Number.isFinite(v)) traits[k] = Math.max(-LIMIT, Math.min(LIMIT, Math.round(v)));
  }
  return { v: 1, kept: Math.max(0, Math.floor(m.kept)), undone: Math.max(0, Math.floor(m.undone)), traits };
}

export function loadMemory(): AgentMemory {
  try {
    return parseMemory(JSON.parse(localStorage.getItem(MEMORY_KEY) ?? 'null'));
  } catch {
    return emptyMemory();
  }
}

export function saveMemory(m: AgentMemory): void {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(m));
  } catch {
    /* private mode or full storage: remembered for this visit only */
  }
}
