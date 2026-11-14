/**
 * "Mark it on yourself": a pinch on your own body (at your knee, your wrist,
 * just below your collarbone) becomes a tailoring measurement on the form, the
 * way a tailor pins cloth on the client rather than on paper.
 *
 * Pure maths. The pinch point is read against your head and the floor, scaled
 * from your height to the form's (1.72 m), and classified by where it is:
 *  - out at the side, below the shoulder: the end of a sleeve;
 *  - on the centre line, high on the chest: the depth of a neckline;
 *  - lower down: a hem (height above the floor).
 */
import { BODY } from './body.js';
import type { TailorParam } from './garments.js';

/** Eye height is about 93.5% of standing height. */
export const EYE_RATIO = 0.935;
/** The form's collar line (garments.ts COLLAR_Y). */
const COLLAR_Y = 1.432;
/** Above this (form metres) a centre-line pinch is a neckline, below it a hem. */
const NECK_FLOOR = 1.16;
/**
 * How far in front of your eyes' vertical line a pinch on your clothes can be.
 * A pinch made to point a hand ray at a panel is usually 30-45 cm out in front,
 * so it is not taken as a mark.
 */
const FRONT = 0.3;
const BEHIND = 0.25;
const SIDE = 0.45;

export interface BodyMarkInput {
  /** Pinch point (world, metres). */
  point: { x: number; y: number; z: number };
  /** Headset position (world). */
  head: { x: number; y: number; z: number };
  /** The head's horizontal right direction (unit length, world XZ). */
  right: { x: number; z: number };
  floorY: number;
  /** Your standing height in metres. */
  height: number;
}

export type MarkParam = Exclude<TailorParam, 'fit'>;

export interface BodyMark {
  param: MarkParam;
  /** The measurement in form units (what GarmentPiece stores). */
  value: number;
  /** The same measurement on you, in centimetres. */
  cm: number;
}

export type MarkMiss = 'far' | 'high';

/** Standing height from eye height (clamped to a plausible adult range). */
export function heightFromEyes(eyeY: number, floorY: number): number {
  const h = (eyeY - floorY) / EYE_RATIO;
  return Math.min(2.05, Math.max(1.45, h));
}

/** Classify a pinch on the body and turn it into a measurement. */
export function markFromBody(input: BodyMarkInput): BodyMark | MarkMiss {
  const { point, head, right, floorY, height } = input;
  const dx = point.x - head.x;
  const dz = point.z - head.z;
  const lateral = Math.abs(dx * right.x + dz * right.z);
  // Forward is the right direction turned a quarter to the left.
  const forward = dx * right.z - dz * right.x;
  if (forward > FRONT || forward < -BEHIND || lateral > SIDE) return 'far';
  /** Form metres per real metre. */
  const s = BODY.height / height;
  /** Real metres per form metre. */
  const k = 1 / s;
  const eyeY = head.y;
  // Upper body is read from the head (works seated too), the hem from the floor.
  const collarY = eyeY - (EYE_RATIO * BODY.height - COLLAR_Y) * k;
  if (point.y > collarY + 0.03) return 'high';

  const shoulderY = eyeY - (EYE_RATIO * BODY.height - BODY.shoulderJointY) * k;
  const shoulderX = BODY.shoulderX * k;
  if (lateral > 0.19 * k && point.y < shoulderY) {
    // Along the hanging arm, from the shoulder joint to the pinch.
    const along = Math.hypot(lateral - shoulderX, shoulderY - point.y);
    return { param: 'sleeve', value: Math.min(0.6, along * s), cm: Math.round(along * 100) };
  }

  const formYFromHead = EYE_RATIO * BODY.height - (eyeY - point.y) * s;
  if (formYFromHead > NECK_FLOOR) {
    const depth = Math.max(0, collarY - point.y);
    return { param: 'neck', value: depth * s, cm: Math.round(depth * 100) };
  }
  const above = Math.max(0, point.y - floorY);
  return { param: 'hem', value: above * s, cm: Math.round(above * 100) };
}

/** Plain words for a mark ("Hem at 52 cm from the floor"). */
export function markText(mark: BodyMark): string {
  switch (mark.param) {
    case 'hem':
      return `Hem marked ${mark.cm} cm from the floor`;
    case 'neck':
      return `Neckline marked ${mark.cm} cm below the collar`;
    case 'sleeve':
      return `Sleeve marked ${mark.cm} cm from the shoulder`;
  }
}
