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
import { localDate } from './ootd.js';

export interface ClosetItem {
  id: string;
  name: string;
  piece: GarmentPiece;
  /** What it cost, in dollars (rough is fine; for cost per wear). */
  price?: number;
  /** Local dates it was worn (logged with Wear today), oldest first. */
  worn?: string[];
  /** Local date it was added. */
  added?: string;
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

/** What the piece is called, from its cut: "slip dress", "ruffle skirt", "blazer". */
function noun(p: GarmentPiece): string {
  const length = p.hem >= 0.6 ? 'mini ' : p.hem <= 0.12 ? 'maxi ' : p.hem <= 0.36 ? 'midi ' : '';
  switch (p.kind) {
    case 'dress': {
      const cut = p.corset
        ? 'corset dress'
        : p.buttons
          ? 'blazer dress'
          : p.fringe
            ? 'fringe dress'
            : p.straps === 'halter'
              ? 'halter dress'
              : p.straps === 'slip'
                ? 'slip dress'
                : p.drape
                  ? 'draped dress'
                  : 'dress';
      return `${length}${cut}`;
    }
    case 'top':
      return p.straps === 'slip' ? 'cami' : p.straps === 'halter' ? 'halter top' : p.corset ? 'corset top' : 'top';
    case 'skirt':
      return `${length}${p.tiers ? 'ruffle skirt' : p.slit ? 'slit skirt' : 'skirt'}`;
    case 'jacket':
      return p.buttons ? 'blazer' : 'jacket';
    case 'trousers':
      return p.flare >= 0.06 ? 'wide-leg trousers' : 'trousers';
  }
}

/** Human name for a piece, e.g. "Navy striped top" or "Bordeaux Velvet dress". */
export function pieceName(p: GarmentPiece): string {
  const closet = parseClosetFabric(p.fabric);
  if (closet) {
    const color = CLOSET_COLORS.find((c) => c.key === closet.color)!.name;
    const adj = CLOSET_MATERIALS.find((m) => m.key === closet.material)!.adj;
    return `${color} ${adj} ${noun(p)}`;
  }
  return `${fabricById(p.fabric).name} ${noun(p)}`;
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

function makeItem(p: GarmentPiece, price?: number): ClosetItem {
  const item: ClosetItem = {
    id: Math.random().toString(36).slice(2, 10),
    name: pieceName(p),
    piece: { ...p },
    added: localDate(),
  };
  if (price) item.price = price;
  return item;
}

/**
 * A small, current wardrobe so the closet is not empty on first visit, with
 * typical prices (edit a piece to set what yours cost). One hanger is left
 * free for a new piece.
 */
function starterCloset(): ClosetItem[] {
  return [
    makeItem(piece({ kind: 'dress', fabric: closetFabricId('satin', 'brown'), hem: 0.26, neck: 0.07, neckline: 'cowl', fit: 0.82, flare: 0.08, straps: 'slip', back: 0.12 }), 70),
    makeItem(piece({ kind: 'dress', fabric: closetFabricId('lace', 'black'), hem: 0.22, neck: 0.04, neckline: 'square', fit: 0.88, flare: 0.06, straps: 'slip' }), 100),
    makeItem(piece({ kind: 'dress', fabric: closetFabricId('satin', 'cream'), hem: 0.58, neck: 0.15, neckline: 'v', sleeve: 0.56, fit: 0.92, flare: 0.05, buttons: 6, shoulders: 0.7 }), 130),
    makeItem(piece({ kind: 'dress', fabric: closetFabricId('sequin', 'silver'), hem: 0.66, neck: 0.03, fit: 0.92, flare: 0.05, straps: 'halter', back: 0.14, fringe: 0.1 }), 100),
    makeItem(piece({ kind: 'dress', fabric: closetFabricId('satin', 'burgundy'), hem: 0.64, neck: 0.04, neckline: 'sweetheart', fit: 1, flare: 0.06, strapless: true, corset: true }), 80),
    makeItem(piece({ kind: 'jacket', fabric: closetFabricId('wool', 'black'), hem: 0.84, neck: 0.2, sleeve: 0.56, fit: 0.75, buttons: 6, shoulders: 0.6 }), 200),
  ];
}

/** The basics Atelier used to start with: an untouched copy is upgraded once. */
const OLD_STARTER = ['White cotton top', 'Blue denim trousers', 'Black wool jacket', 'Camel check skirt'];
function untouchedOldStarter(items: ClosetItem[]): boolean {
  return (
    items.length === OLD_STARTER.length &&
    items.every((item, i) => item.name === OLD_STARTER[i] && !(item.worn && item.worn.length))
  );
}

export function loadCloset(): ClosetItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const items = JSON.parse(raw) as ClosetItem[];
      if (Array.isArray(items) && !untouchedOldStarter(items)) return items.filter((i) => i && i.piece && i.id);
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

export function newClosetItem(p: GarmentPiece, price?: number): ClosetItem {
  return makeItem(p, price);
}
