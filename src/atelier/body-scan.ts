/**
 * Reading a full-length photo of you, on the device. Pure functions over pose
 * landmarks (from MediaPipe Pose, see pose.ts) and pixels, so they can be
 * unit-tested without a browser.
 *
 *  - checkFullBody: is this one person, standing, facing the camera, with the
 *    whole body (head to feet) in the frame? Anything less is refused with a
 *    plain reason ("Your feet are cut off...").
 *  - bodyWidth: shoulder and hip width relative to body length, as a width
 *    scale for the form (clamped: it reshapes, it never caricatures).
 *  - medianColor / hairLengthFrom: skin and hair colour, hair length.
 */

/** One pose landmark. Image landmarks are normalised 0..1; world ones are metres. */
export interface Pt {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

/** MediaPipe Pose landmark indices used here. */
export const LM = {
  nose: 0,
  leftEye: 2,
  rightEye: 5,
  leftEar: 7,
  rightEar: 8,
  mouthLeft: 9,
  mouthRight: 10,
  leftShoulder: 11,
  rightShoulder: 12,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
} as const;

export type ScanProblem =
  | 'no-person'
  | 'many-people'
  | 'no-head'
  | 'head-cut'
  | 'no-shoulders'
  | 'no-hips'
  | 'no-knees'
  | 'no-feet'
  | 'lying'
  | 'sideways'
  | 'too-small';

export interface ScanCheck {
  ok: boolean;
  problem?: ScanProblem;
  /** What to tell the person (also when ok). */
  message: string;
}

export const SCAN_MESSAGES: Record<ScanProblem, string> = {
  'no-person': 'I could not find a person in this photo. Use a full-length photo of you, standing, head to feet.',
  'many-people': 'I can see more than one person. Use a photo of just you, head to feet.',
  'no-head': 'I cannot see your face. Use a full-length photo facing the camera, head to feet.',
  'head-cut': 'The top of your head is cut off. Leave a little space above your head and include your feet.',
  'no-shoulders': 'I cannot see your shoulders. Use a full-length photo facing the camera, head to feet.',
  'no-hips': 'This photo stops above your hips. I need all of you, head to feet: step back and try again.',
  'no-knees': 'This photo stops above your knees. I need all of you, head to feet: step back and try again.',
  'no-feet': 'Your feet are cut off. Step back until your whole body, head to feet, is in the photo.',
  lying: 'Stand upright for the photo, head to feet in the frame.',
  sideways: 'Turn to face the camera, with your arms relaxed at your sides.',
  'too-small': 'You are very small in this photo. Stand a little closer, still head to feet.',
};

const VISIBLE = 0.5;

function seen(p: Pt | undefined): boolean {
  if (!p) return false;
  const v = p.visibility ?? 1;
  return v >= VISIBLE && p.x >= -0.02 && p.x <= 1.02 && p.y >= -0.01 && p.y <= 1.01;
}

const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z ?? 0) + (b.z ?? 0)) / 2 });

/**
 * Whether the detected poses are one whole person, head to feet.
 * `aspect` is the image width / height (landmarks are normalised per axis).
 */
export function checkFullBody(poses: Pt[][], aspect: number): ScanCheck {
  const fail = (problem: ScanProblem): ScanCheck => ({ ok: false, problem, message: SCAN_MESSAGES[problem] });
  if (poses.length === 0 || !poses[0]?.length) return fail('no-person');
  if (poses.length > 1) return fail('many-people');
  const p = poses[0];
  const at = (i: number) => p[i];

  const head = seen(at(LM.nose)) && (seen(at(LM.leftEye)) || seen(at(LM.rightEye)));
  if (!head) return fail('no-head');
  if (!seen(at(LM.leftShoulder)) || !seen(at(LM.rightShoulder))) return fail('no-shoulders');
  if (!seen(at(LM.leftHip)) || !seen(at(LM.rightHip))) return fail('no-hips');
  if (!seen(at(LM.leftKnee)) || !seen(at(LM.rightKnee))) return fail('no-knees');
  const foot = (ankle: number, heel: number) => seen(at(ankle)) || seen(at(heel));
  if (!foot(LM.leftAnkle, LM.leftHeel) || !foot(LM.rightAnkle, LM.rightHeel)) return fail('no-feet');

  const nose = at(LM.nose);
  const shoulders = mid(at(LM.leftShoulder), at(LM.rightShoulder));
  const hips = mid(at(LM.leftHip), at(LM.rightHip));
  const ankles = mid(at(LM.leftAnkle), at(LM.rightAnkle));
  // Upright: head above shoulders above hips above feet.
  if (!(nose.y < shoulders.y && shoulders.y < hips.y && hips.y < ankles.y)) return fail('lying');
  // The crown sits about one nose-to-shoulder drop above the nose.
  if (nose.y - (shoulders.y - nose.y) * 0.9 < -0.01) return fail('head-cut');
  // Facing the camera: shoulders are wide relative to the torso.
  const sl = at(LM.leftShoulder);
  const sr = at(LM.rightShoulder);
  const shoulderW = Math.abs(sl.x - sr.x) * aspect;
  const torso = Math.abs(hips.y - shoulders.y);
  if (torso <= 0 || shoulderW / torso < 0.4) return fail('sideways');
  if (ankles.y - nose.y < 0.3) return fail('too-small');
  return { ok: true, message: 'Full length, head to feet: perfect.' };
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));
}

/** Typical shoulder and hip landmark spans relative to torso + leg length. */
const REF_SHOULDER = 0.26;
const REF_HIP = 0.155;
export const WIDTH_RANGE = [0.88, 1.15] as const;

/**
 * Width scale for the form from 3D (world) landmarks in metres: shoulder and
 * hip spans relative to body length, against typical proportions. 1 = the
 * standard form. Rounded and clamped to WIDTH_RANGE.
 */
export function bodyWidth(world: Pt[]): number {
  const g = (i: number) => world[i];
  const need = [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip, LM.leftKnee, LM.rightKnee, LM.leftAnkle, LM.rightAnkle];
  if (need.some((i) => !g(i))) return 1;
  const torso = dist(mid(g(LM.leftShoulder), g(LM.rightShoulder)), mid(g(LM.leftHip), g(LM.rightHip)));
  const leg =
    (dist(g(LM.leftHip), g(LM.leftKnee)) + dist(g(LM.leftKnee), g(LM.leftAnkle)) +
      dist(g(LM.rightHip), g(LM.rightKnee)) + dist(g(LM.rightKnee), g(LM.rightAnkle))) / 2;
  const length = torso + leg;
  if (!(length > 0.3)) return 1;
  const rs = dist(g(LM.leftShoulder), g(LM.rightShoulder)) / length / REF_SHOULDER;
  const rh = dist(g(LM.leftHip), g(LM.rightHip)) / length / REF_HIP;
  const w = (rs + rh) / 2;
  return Math.round(Math.min(WIDTH_RANGE[1], Math.max(WIDTH_RANGE[0], w)) * 100) / 100;
}

export type Rgb = [number, number, number];

/**
 * Median colour of the pixels in a rectangle that belong to the person
 * (mask >= 0.5 when a mask is given). `rgba` is width*height*4.
 */
export function medianColor(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  rect: { x: number; y: number; w: number; h: number },
  mask?: ArrayLike<number> | null,
): Rgb | null {
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(width, Math.ceil(rect.x + rect.w));
  const y1 = Math.min(height, Math.ceil(rect.y + rect.h));
  const r: number[] = [];
  const g: number[] = [];
  const b: number[] = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * width + x;
      if (mask && mask[i] < 0.5) continue;
      r.push(rgba[i * 4]);
      g.push(rgba[i * 4 + 1]);
      b.push(rgba[i * 4 + 2]);
    }
  }
  if (r.length === 0) return null;
  const med = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1];
  return [med(r), med(g), med(b)];
}

export const toHex = ([r, g, b]: Rgb): string =>
  '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

const colorDist = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export type HairLength = 'short' | 'shoulder' | 'long';

/**
 * Hair length from the pixels beside the neck: how far below the chin hair
 * coloured (and not skin coloured) person pixels reach. All coordinates in
 * pixels. Dark collars next to dark hair can fool it; the card lets you change it.
 */
export function hairLengthFrom(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  mask: ArrayLike<number> | null,
  hair: Rgb,
  skin: Rgb,
  at: { centerX: number; chinY: number; shoulderY: number; halfHead: number },
): HairLength {
  if (colorDist(hair, skin) < 40) return 'short';
  const drop = Math.max(4, at.shoulderY - at.chinY);
  const yEnd = Math.min(height - 1, Math.round(at.shoulderY + drop * 1.6));
  let lowest = at.chinY;
  for (let y = Math.round(at.chinY); y <= yEnd; y += 2) {
    let hairPx = 0;
    let total = 0;
    for (const side of [-1, 1]) {
      const xa = Math.round(at.centerX + side * at.halfHead * 0.7);
      const xb = Math.round(at.centerX + side * at.halfHead * 1.5);
      for (let x = Math.min(xa, xb); x <= Math.max(xa, xb); x++) {
        if (x < 0 || x >= width) continue;
        const i = y * width + x;
        if (mask && mask[i] < 0.5) continue;
        total++;
        const c: Rgb = [rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]];
        if (colorDist(c, hair) < 45 && colorDist(c, skin) > colorDist(c, hair) + 10) hairPx++;
      }
    }
    if (total > 0 && hairPx / total > 0.3) lowest = y;
  }
  if (lowest < at.chinY + drop * 0.45) return 'short';
  if (lowest < at.shoulderY + drop * 0.35) return 'shoulder';
  return 'long';
}
