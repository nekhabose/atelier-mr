/**
 * Mannequin body measurements (meters). The mannequin stands on the floor at
 * the origin and faces +Z. Everything here is pure data + math so it can be
 * shared by the scene-asset (editor realm) and runtime garment builder.
 */

/** [y, half-width (x), half-depth (z)] keyframes for the torso, bottom → top. */
const TORSO_KEYS: ReadonlyArray<readonly [number, number, number]> = [
  [0.8, 0.15, 0.115],
  [0.86, 0.172, 0.125],
  [0.93, 0.176, 0.124],
  [1.02, 0.15, 0.106],
  [1.1, 0.128, 0.094],
  [1.18, 0.142, 0.104],
  [1.25, 0.158, 0.116],
  [1.31, 0.163, 0.11],
  [1.36, 0.172, 0.096],
  [1.4, 0.13, 0.08],
  [1.435, 0.06, 0.052],
  [1.445, 0.048, 0.046],
];

/** [y, radius] keyframes for one leg, top (hip) → bottom (ankle). */
const LEG_KEYS: ReadonlyArray<readonly [number, number]> = [
  [0.9, 0.09],
  [0.72, 0.076],
  [0.52, 0.052],
  [0.46, 0.047],
  [0.3, 0.043],
  [0.13, 0.03],
  [0.06, 0.027],
];

/** [s, radius] keyframes along one arm, shoulder (s=0) → wrist. */
const ARM_KEYS: ReadonlyArray<readonly [number, number]> = [
  [0, 0.05],
  [0.06, 0.045],
  [0.28, 0.036],
  [0.32, 0.033],
  [0.56, 0.025],
  [0.6, 0.024],
];

export const BODY = {
  height: 1.72,
  crotchY: 0.8,
  hipY: 0.93,
  waistY: 1.1,
  bustY: 1.25,
  shoulderY: 1.36,
  neckBaseY: 1.445,
  neckTopY: 1.53,
  headCenterY: 1.625,
  legX: 0.088,
  ankleX: 0.075,
  legTopY: 0.9,
  ankleY: 0.06,
  shoulderX: 0.178,
  shoulderJointY: 1.355,
  armLength: 0.6,
  /** Arm splay from vertical, radians. */
  armSplay: (11 * Math.PI) / 180,
} as const;

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Torso half-width / half-depth at height y (clamped to the torso range). */
export function torsoAt(y: number): { rx: number; rz: number } {
  const keys = TORSO_KEYS;
  if (y <= keys[0][0]) return { rx: keys[0][1], rz: keys[0][2] };
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    if (y <= b[0]) {
      const t = smooth((y - a[0]) / (b[0] - a[0]));
      return { rx: a[1] + (b[1] - a[1]) * t, rz: a[2] + (b[2] - a[2]) * t };
    }
  }
  const last = keys[keys.length - 1];
  return { rx: last[1], rz: last[2] };
}

/** Leg radius at height y. */
export function legRadiusAt(y: number): number {
  const keys = LEG_KEYS;
  if (y >= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    if (y >= b[0]) {
      const t = smooth((a[0] - y) / (a[0] - b[0]));
      return a[1] + (b[1] - a[1]) * t;
    }
  }
  return keys[keys.length - 1][1];
}

/** Leg centre x (positive side) at height y – legs taper slightly inward. */
export function legCenterXAt(y: number): number {
  const t = Math.min(1, Math.max(0, (BODY.legTopY - y) / (BODY.legTopY - BODY.ankleY)));
  return BODY.legX + (BODY.ankleX - BODY.legX) * t;
}

/** Arm radius at distance s from the shoulder joint. */
export function armRadiusAt(s: number): number {
  const keys = ARM_KEYS;
  if (s <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    if (s <= b[0]) {
      const t = smooth((s - a[0]) / (b[0] - a[0]));
      return a[1] + (b[1] - a[1]) * t;
    }
  }
  return keys[keys.length - 1][1];
}

/** Unit direction of an arm (side = +1 for the mannequin's left / +X). */
export function armDirection(side: 1 | -1): [number, number, number] {
  return [side * Math.sin(BODY.armSplay), -Math.cos(BODY.armSplay), 0];
}

/** Shoulder joint position for an arm. */
export function shoulderJoint(side: 1 | -1): [number, number, number] {
  return [side * BODY.shoulderX, BODY.shoulderJointY, 0];
}
