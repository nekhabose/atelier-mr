/**
 * Atelier's paper-and-ink palette: cream pattern paper, ink, and one red
 * tacking-thread accent. Shared by the panels' runtime colours (chips, toggles,
 * days) and the 3D labels so everything reads as one handmade set.
 */
export const INK = '#2a231c';
export const INK_SOFT = '#5c5146';
export const PAPER = '#f4ede1';
export const PAPER_LIGHT = '#fbf7f0';
export const EDGE = '#cbbda5';
export const THREAD = '#a8442c';
export const CREAM_TEXT = '#f7f1e6';

/** Chip / toggle states on the paper panels. */
export const CHIP = {
  on: { bg: INK, border: INK, text: CREAM_TEXT },
  off: { bg: PAPER_LIGHT, border: EDGE, text: INK },
  /** Today in the week planner: outlined in thread red. */
  today: { bg: PAPER_LIGHT, border: THREAD, text: INK },
} as const;

/** Serif for names and titles drawn on paper (system fonts only, works offline). */
export const SERIF = 'Georgia, "Iowan Old Style", "Times New Roman", serif';
