/**
 * Shared contract between the in-headset stylist and the /api/stylist
 * serverless function. Dependency-free so the server can import it without
 * pulling in the 3D runtime.
 */

export const OCCASIONS = ['work', 'interview', 'date', 'weekend', 'party', 'travel'] as const;
export const WEATHERS = ['warm', 'mild', 'cold', 'rainy'] as const;
export const MOODS = ['classic', 'bold', 'relaxed'] as const;
export type Occasion = (typeof OCCASIONS)[number];
export type Weather = (typeof WEATHERS)[number];
export type Mood = (typeof MOODS)[number];

export const ITEM_KINDS = ['top', 'trousers', 'skirt', 'dress', 'jacket'] as const;
export const LENGTHS = ['cropped', 'hip', 'mini', 'knee', 'midi', 'ankle', 'floor'] as const;
export const SLEEVES = ['none', 'short', 'elbow', 'long'] as const;

/** One closet piece, described in words (no geometry). */
export interface StylistItem {
  id: string;
  name: string;
  kind: (typeof ITEM_KINDS)[number];
  color: string;
  fabric: string;
  length: (typeof LENGTHS)[number];
  sleeves: (typeof SLEEVES)[number];
}

export interface StylistRequest {
  occasion: Occasion;
  weather: Weather;
  mood: Mood;
  items: StylistItem[];
}

export interface StylistResponse {
  itemIds: string[];
  title: string;
  reason: string;
  tip: string;
}

/** What /api/stylist returns: up to MAX_OPTIONS ranked outfits. */
export interface StylistReply {
  options: StylistResponse[];
}

export const MAX_OPTIONS = 3;
export const MAX_ITEMS = 24;
export const NAME_PATTERN = /^[A-Za-z][A-Za-z -]{0,47}$/;
export const ID_PATTERN = /^[a-z0-9]{1,16}$/;

/**
 * Is this set of pieces something a person can actually wear?
 * Exactly a dress, or a top plus one bottom; at most one jacket on top.
 */
export function isWearable(kinds: string[]): boolean {
  const count = (k: string) => kinds.filter((x) => x === k).length;
  const dress = count('dress');
  const top = count('top');
  const bottoms = count('trousers') + count('skirt');
  const jacket = count('jacket');
  if (jacket > 1 || kinds.length !== dress + top + bottoms + jacket) return false;
  if (dress === 1) return top === 0 && bottoms === 0;
  return dress === 0 && top === 1 && bottoms === 1;
}

// ------------------------------------------------------------------ refine

/** Ways the user can ask the stylist to change the previewed outfit. */
export const REFINES = ['warmer', 'dressier', 'colour'] as const;
export type Refine = (typeof REFINES)[number];

/** Closet fabric vocabulary (mirrors CLOSET_MATERIALS / CLOSET_COLORS keys). */
export const MATERIAL_KEYS = ['cotton', 'satin', 'knit', 'wool', 'denim', 'stripe', 'check', 'plaid', 'dots', 'floral'] as const;
export const COLOR_KEYS = ['white', 'cream', 'camel', 'pink', 'red', 'green', 'blue', 'navy', 'grey', 'black'] as const;
export const KEEP = 'keep';

/** One change to a piece on the form; KEEP leaves that attribute alone. */
export interface PieceEdit {
  /** Id of the outfit piece (p0, p1, ...). */
  piece: string;
  length: (typeof LENGTHS)[number] | typeof KEEP;
  sleeves: (typeof SLEEVES)[number] | typeof KEEP;
  material: (typeof MATERIAL_KEYS)[number] | typeof KEEP;
  color: (typeof COLOR_KEYS)[number] | typeof KEEP;
}

export interface RefineRequest {
  mode: 'refine';
  refine: Refine;
  occasion: Occasion;
  weather: Weather;
  mood: Mood;
  /** What is on the form now, ids p0..pN. */
  outfit: StylistItem[];
  /** The closet (a jacket from it may be added). */
  items: StylistItem[];
}

export interface RefineReply {
  /** One sentence on what changed and why. */
  summary: string;
  /** A closet jacket to layer on, or '' for none. */
  addItemId: string;
  edits: PieceEdit[];
}

export const MAX_EDITS = 4;
