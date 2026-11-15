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

/**
 * Is the point on the far side of a wall from you? Walls are thin rectangles;
 * the side test runs along their short axis, and only alongside the wall
 * (past its ends, a doorway say, there is no "far side").
 */
export function beyondWall(px: number, pz: number, me: { x: number; z: number }, o: Obstacle): boolean {
  const c = Math.cos(o.yaw);
  const s = Math.sin(o.yaw);
  const local = (x: number, z: number) => {
    const dx = x - o.x;
    const dz = z - o.z;
    return { x: dx * c - dz * s, z: dx * s + dz * c };
  };
  const p = local(px, pz);
  const m = local(me.x, me.z);
  const alongX = o.hx >= o.hz;
  const along = alongX ? p.x : p.z;
  const half = alongX ? o.hx : o.hz;
  if (Math.abs(along) > half) return false;
  const side = alongX ? p.z : p.x;
  const mine = alongX ? m.z : m.x;
  return side * mine < 0;
}

/**
 * Labels of the obstacles the footprint overlaps in this frame. With `me`,
 * any part of the footprint on the far side of a wall also counts.
 */
export function blockers(footprint: Circle[], frame: Frame, obstacles: Obstacle[], me?: { x: number; z: number }): string[] {
  const hit = new Set<string>();
  for (const c of footprint) {
    const w = toWorld(frame, c.x, c.z);
    for (const o of obstacles) {
      if (overlaps(w.x, w.z, c.r, o) || (me && o.label === 'wall' && beyondWall(w.x, w.z, me, o))) hit.add(o.label);
    }
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

/** Walls nearer than this cannot hold the full studio in front of them. */
export const SNUG_BELOW = 1.85;
/** Farther walls tend to have furniture in between. */
export const SNAP_ABOVE = 2.8;

/**
 * What to do with the wall straight ahead at distance `t` (metres; Infinity
 * when there is none): back the studio up against it, fit the compact studio
 * in front of it (a small room), or ignore it.
 */
export function wallPlan(t: number, seated: boolean): 'snap' | 'snug' | 'none' {
  if (seated || !Number.isFinite(t) || t < 0.4) return 'none';
  if (t < SNUG_BELOW) return 'snug';
  return t <= SNAP_ABOVE ? 'snap' : 'none';
}

/** "Moved 30 cm left to clear your table." */
export function clearanceText(c: Clearance): string | null {
  if (c.blockedBy.length === 0) return null;
  const what = c.blockedBy.slice(0, 2).join(' and ');
  if (!c.clear) {
    return `Your ${what} ${c.blockedBy.length > 1 ? 'are' : 'is'} in the way here. Face a clearer spot and tap Move studio.`;
  }
  const parts: string[] = [];
  if (c.dx !== 0) parts.push(`${Math.round(Math.abs(c.dx) * 100)} cm ${c.dx < 0 ? 'left' : 'right'}`);
  if (c.dz !== 0) parts.push(`${Math.round(c.dz * 100)} cm toward you`);
  return `Moved the studio ${parts.join(' and ')} to clear your ${what}.`;
}

// ------------------------------------------------------------------ search

export type FitLayout = 'full' | 'compact' | 'small';

export interface LayoutFootprint {
  layout: FitLayout;
  /** The layout's footprint in the studio frame. */
  circles: Circle[];
}

export interface Placement {
  layout: FitLayout;
  /** Turn about you (radians), then a shift in the turned studio frame. */
  dyaw: number;
  dx: number;
  dz: number;
  clear: boolean;
  /** What was in the way at the starting spot. */
  blockedBy: string[];
}

const LATERAL = [0, -0.25, 0.25, -0.5, 0.5, -0.75, 0.75, -1, 1, -1.25, 1.25];
const TOWARD = [0, 0.25, 0.5, 0.75];
const TURNS = [0, -0.35, 0.35, -0.7, 0.7];
/** Second pass, when nothing fits in front: set the studio off to one side. */
const SIDE_TURNS = [-1.05, 1.05, -1.4, 1.4];

/** The frame after turning about `pivot` by `dyaw`, then shifting by (dx, dz). */
export function movedFrame(frame: Frame, pivot: { x: number; z: number }, dyaw: number, dx: number, dz: number): Frame {
  const c = Math.cos(dyaw);
  const s = Math.sin(dyaw);
  const ox = frame.x - pivot.x;
  const oz = frame.z - pivot.z;
  const turned = { x: pivot.x + ox * c + oz * s, z: pivot.z - ox * s + oz * c, yaw: frame.yaw + dyaw };
  const o = toWorld(turned, dx, dz);
  return { x: o.x, z: o.z, yaw: turned.yaw };
}

/**
 * Find a clear spot for the studio: the smallest change (shift sideways or
 * toward you, turn up to 40 degrees about you) that keeps every footprint
 * circle off furniture and inside the walls, trying each layout in order
 * (full first, then the compact and small layouts), with the form within 50
 * degrees of where you were facing. If nothing fits in front, a second pass
 * sets the studio off to your left or right (up to 80 degrees). When nothing
 * is clear, the starting spot is returned with clear = false.
 */
export function searchPlacement(
  layouts: LayoutFootprint[],
  frame: Frame,
  pivot: { x: number; z: number },
  obstacles: Obstacle[],
  formLocal: { x: number; z: number } = { x: 0, z: -1.55 },
): Placement {
  const first = layouts[0];
  const blockedBy = blockers(first.circles, frame, obstacles, pivot);
  if (blockedBy.length === 0) return { layout: first.layout, dyaw: 0, dx: 0, dz: 0, clear: true, blockedBy };
  const facing = frame.yaw;
  for (const [turns, limit] of [[TURNS, 50], [SIDE_TURNS, 100]] as const)
  for (const { layout, circles } of layouts) {
    let best: Placement | null = null;
    let bestCost = Infinity;
    for (const dyaw of turns) {
      for (const dz of TOWARD) {
        for (const dx of LATERAL) {
          const cost = Math.abs(dx) + Math.abs(dz) + 1.2 * Math.abs(dyaw);
          if (cost >= bestCost) continue;
          const f = movedFrame(frame, pivot, dyaw, dx, dz);
          // Keep the form roughly in front of you.
          const form = toWorld(f, formLocal.x, formLocal.z);
          const bearing = Math.atan2(-(form.x - pivot.x), -(form.z - pivot.z));
          let off = bearing - facing;
          off = Math.atan2(Math.sin(off), Math.cos(off));
          if (Math.abs(off) > (limit * Math.PI) / 180) continue;
          if (blockers(circles, f, obstacles, pivot).length > 0) continue;
          best = { layout, dyaw, dx, dz, clear: true, blockedBy };
          bestCost = cost;
        }
      }
    }
    if (best) return best;
  }
  return { layout: first.layout, dyaw: 0, dx: 0, dz: 0, clear: false, blockedBy };
}

/** "Moved the studio (50 cm left, turned 20 degrees) to clear your desk." */
export function placementText(p: Placement): string | null {
  if (p.blockedBy.length === 0) return null;
  const named = p.blockedBy.filter((b) => b !== 'wall');
  const what = named.slice(0, 2).join(' and ') || 'walls';
  const plural = named.length > 1 || named.length === 0;
  if (!p.clear) return `Your ${what} ${plural ? 'are' : 'is'} in the way here. Face a clearer spot and tap Move studio.`;
  const bits: string[] = [];
  if (p.dx !== 0) bits.push(`${Math.round(Math.abs(p.dx) * 100)} cm ${p.dx < 0 ? 'left' : 'right'}`);
  if (p.dz !== 0) bits.push(`${Math.round(p.dz * 100)} cm toward you`);
  const side = Math.abs(p.dyaw) >= 0.9;
  if (p.dyaw !== 0 && !side) bits.push(`turned ${Math.round((Math.abs(p.dyaw) * 180) / Math.PI)} degrees`);
  if (side) {
    const where = p.dyaw > 0 ? 'left' : 'right';
    const how = p.layout === 'full' ? 'the studio' : `the studio's ${p.layout} layout`;
    return `Nothing fits in front of you, so ${how} is on your ${where}, clear of your ${what}.`;
  }
  const lead = p.layout === 'full' ? 'Moved the studio' : `Switched to the ${p.layout} layout`;
  return `${lead}${bits.length ? ` (${bits.join(', ')})` : ''} to clear your ${what}.`;
}
