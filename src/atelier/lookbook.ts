/**
 * The lookbook: whole outfits the user saved (with their tailoring and
 * fabrics), so a look can be put back on the form in a later session.
 * Runtime-only (localStorage), newest first.
 */
import type { GarmentPiece } from './garments.js';

const STORAGE_KEY = 'atelier.lookbook.v1';
export const LOOKBOOK_CAPACITY = 6;

export interface SavedLook {
  id: string;
  name: string;
  date: string;
  pieces: GarmentPiece[];
}

export function loadLookbook(): SavedLook[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as SavedLook[];
    if (!Array.isArray(list)) return [];
    return list
      .filter((l) => l && typeof l.name === 'string' && Array.isArray(l.pieces) && l.pieces.length > 0)
      .slice(0, LOOKBOOK_CAPACITY);
  } catch {
    return [];
  }
}

function persist(list: SavedLook[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
}

/**
 * Save an outfit. A look with the same name is replaced and moves to the
 * front; past capacity the oldest look drops off. Returns the new list.
 */
export function saveLook(list: SavedLook[], name: string, pieces: GarmentPiece[], date: string): SavedLook[] {
  const clean = name.trim() || 'Untitled look';
  const entry: SavedLook = {
    id: Math.random().toString(36).slice(2, 10),
    name: clean,
    date,
    pieces: pieces.map((p) => ({ ...p })),
  };
  const next = [entry, ...list.filter((l) => l.name !== clean)].slice(0, LOOKBOOK_CAPACITY);
  persist(next);
  return next;
}

export function removeLook(list: SavedLook[], id: string): SavedLook[] {
  const next = list.filter((l) => l.id !== id);
  persist(next);
  return next;
}
