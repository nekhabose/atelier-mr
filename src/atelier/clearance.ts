/**
 * Furniture-aware placement: keep the studio's footprint (the form, the rack,
 * the fabric board) clear of real tables, sofas and beds that scene
 * understanding reports. If the chosen spot overlaps something, slide the
 * studio sideways along the wall (or a little toward you) until it is clear.
 *
 * Pure geometry on the floor plane (x, z). Rotation about +Y by yaw follows
 * three.js: local (x, z) -> (x cos + z sin, -x sin + z cos).
 */

/** A footprint circle in the studio frame (metres). */
export interface Circle {
  x: number;
  z: number;
  r: number;
}

/** Real furniture as an oriented rectangle on the floor (world metres). */
export interface Obstacle {
  x: number;
  z: number;
  /** Half extents along the obstacle's own x and z. */
  hx: number;
  hz: number;
  yaw: number;
  label: string;
}

export interface Frame {
  x: number;
  z: number;
  yaw: number;
}

/** Shifts tried in order, in the studio frame: sideways first, then toward you. */
export const SHIFTS: readonly [number, number][] = [
  [0, 0],
  [-0.3, 0],
  [0.3, 0],
  [-0.6, 0],
  [0.6, 0],
  [0, 0.3],
  [-0.3, 0.3],
  [0.3, 0.3],
  [-0.9, 0],
  [0.9, 0],
  [0, 0.6],
];

export function toWorld(frame: Frame, x: number, z: number): { x: number; z: number } {
  const c = Math.cos(frame.yaw);
  const s = Math.sin(frame.yaw);
  return { x: frame.x + x * c + z * s, z: frame.z - x * s + z * c };
}

/** Does a world-space circle overlap the obstacle? */
export function overlaps(cx: number, cz: number, r: number, o: Obstacle): boolean {
  const dx = cx - o.x;
  const dz = cz - o.z;
  const c = Math.cos(o.yaw);
  const s = Math.sin(o.yaw);
  // Into the obstacle's frame (inverse rotation).
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  const qx = Math.max(Math.abs(lx) - o.hx, 0);
  const qz = Math.max(Math.abs(lz) - o.hz, 0);
  return qx * qx + qz * qz < r * r;
}

/** Labels of the obstacles the footprint overlaps in this frame. */
export function blockers(footprint: Circle[], frame: Frame, obstacles: Obstacle[]): string[] {
  const hit = new Set<string>();
  for (const c of footprint) {
    const w = toWorld(frame, c.x, c.z);
    for (const o of obstacles) if (overlaps(w.x, w.z, c.r, o)) hit.add(o.label);
  }
  return [...hit];
}

export interface Clearance {
  /** Shift applied, in the studio frame (0, 0 when the spot was clear). */
  dx: number;
  dz: number;
  /** What was in the way at the original spot. */
  blockedBy: string[];
  /** False when no tried shift was clear (the original spot is kept). */
  clear: boolean;
}

/** The first shift that clears every obstacle. */
export function findClearance(footprint: Circle[], frame: Frame, obstacles: Obstacle[]): Clearance {
  const blockedBy = blockers(footprint, frame, obstacles);
  if (blockedBy.length === 0) return { dx: 0, dz: 0, blockedBy, clear: true };
  for (const [dx, dz] of SHIFTS) {
    const o = toWorld(frame, dx, dz);
    if (blockers(footprint, { x: o.x, z: o.z, yaw: frame.yaw }, obstacles).length === 0) {
      return { dx, dz, blockedBy, clear: true };
    }
  }
  return { dx: 0, dz: 0, blockedBy, clear: false };
}

/** "Moved 30 cm left to clear your table." */
export function clearanceText(c: Clearance): string | null {
  if (c.blockedBy.length === 0) return null;
  const what = c.blockedBy.slice(0, 2).join(' and ');
  if (!c.clear) return `Your ${what} is in the way here. Face a clearer spot and tap Move studio.`;
  const parts: string[] = [];
  if (c.dx !== 0) parts.push(`${Math.round(Math.abs(c.dx) * 100)} cm ${c.dx < 0 ? 'left' : 'right'}`);
  if (c.dz !== 0) parts.push(`${Math.round(c.dz * 100)} cm toward you`);
  return `Moved the studio ${parts.join(' and ')} to clear your ${what}.`;
}
