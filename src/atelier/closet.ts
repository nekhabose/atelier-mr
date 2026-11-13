/**
 * Digital Closet data: clothes the user owns, recreated as a garment template
 * + colour + fabric, tailored on the form and saved to localStorage.
 * Runtime-only (uses localStorage).
 */
import {
  closetFabricId,
  CLOSET_COLORS,
  CLOSET_MATERIALS,
  fabricById,
  parseClosetFabric,
} from './fabrics.js';
import type { GarmentPiece, PieceKind } from './garments.js';
import { piece } from './looks.js';

export interface ClosetItem {
  id: string;
  name: string;
  piece: GarmentPiece;
}

/** The rail holds 8 hangers; one is reserved for "+ New piece". */
export const CLOSET_CAPACITY = 7;
const STORAGE_KEY = 'atelier.closet.v1';

export const TEMPLATES: { kind: PieceKind; name: string }[] = [
  { kind: 'top', name: 'Top' },
  { kind: 'trousers', name: 'Trousers' },
  { kind: 'skirt', name: 'Skirt' },
  { kind: 'dress', name: 'Dress' },
  { kind: 'jacket', name: 'Jacket' },
];

const NOUN: Record<PieceKind, string> = {
  top: 'top',
  trousers: 'trousers',
  skirt: 'skirt',
  dress: 'dress',
  jacket: 'jacket',
};

/** Human name for a piece, e.g. "Navy striped top" or "Bordeaux Velvet dress". */
export function pieceName(p: GarmentPiece): string {
  const closet = parseClosetFabric(p.fabric);
  if (closet) {
    const color = CLOSET_COLORS.find((c) => c.key === closet.color)!.name;
    const adj = CLOSET_MATERIALS.find((m) => m.key === closet.material)!.adj;
    return `${color} ${adj} ${NOUN[p.kind]}`;
  }
  return `${fabricById(p.fabric).name} ${NOUN[p.kind]}`;
}

/** A fresh piece of the given kind with that kind's default cut. */
export function templatePiece(kind: PieceKind, fabric: string): GarmentPiece {
  return piece({ kind, fabric });
}

/** Which kinds a new piece replaces when added to an outfit. */
const REPLACES: Record<PieceKind, PieceKind[]> = {
  dress: ['dress', 'top', 'skirt', 'trousers'],
  top: ['top', 'dress'],
  skirt: ['skirt', 'trousers', 'dress'],
  trousers: ['trousers', 'skirt', 'dress'],
  jacket: ['jacket'],
};

/** Add a piece to an outfit, removing whatever it would physically replace. */
export function mixIn(outfit: GarmentPiece[], p: GarmentPiece): GarmentPiece[] {
  const replaced = REPLACES[p.kind];
  return [...outfit.filter((o) => !replaced.includes(o.kind)), { ...p }];
}

function makeItem(p: GarmentPiece): ClosetItem {
  return { id: Math.random().toString(36).slice(2, 10), name: pieceName(p), piece: { ...p } };
}

/** A few everyday basics so the closet is not empty on first visit. */
function starterCloset(): ClosetItem[] {
  return [
    makeItem(piece({ kind: 'top', fabric: closetFabricId('cotton', 'white'), hem: 0.93, sleeve: 0.13, fit: 0.4 })),
    makeItem(piece({ kind: 'trousers', fabric: closetFabricId('denim', 'blue'), hem: 0.07, fit: 0.55 })),
    makeItem(piece({ kind: 'jacket', fabric: closetFabricId('wool', 'black'), hem: 0.84, sleeve: 0.56, fit: 0.62 })),
    makeItem(piece({ kind: 'skirt', fabric: closetFabricId('check', 'camel'), hem: 0.55, fit: 0.5, flare: 0.08 })),
  ];
}

export function loadCloset(): ClosetItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const items = JSON.parse(raw) as ClosetItem[];
      if (Array.isArray(items)) return items.filter((i) => i && i.piece && i.id);
    }
  } catch {
    /* fall through to the starter closet */
  }
  const items = starterCloset();
  saveCloset(items);
  return items;
}

export function saveCloset(items: ClosetItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* storage unavailable */
  }
}

export function newClosetItem(p: GarmentPiece): ClosetItem {
  return makeItem(p);
}
