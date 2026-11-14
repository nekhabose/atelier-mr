import { describe, expect, it } from 'vitest';
import { bodyWidth, checkFullBody, hairLengthFrom, LM, medianColor, Pt, toHex } from '../src/atelier/body-scan';

/** A person standing, facing the camera, head to feet, in a 3:4 photo. */
function standing(): Pt[] {
  const p: Pt[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
  const set = (i: number, x: number, y: number) => (p[i] = { x, y, visibility: 0.95 });
  set(LM.nose, 0.5, 0.12);
  set(LM.leftEye, 0.52, 0.11);
  set(LM.rightEye, 0.48, 0.11);
  set(LM.leftEar, 0.54, 0.115);
  set(LM.rightEar, 0.46, 0.115);
  set(LM.mouthLeft, 0.51, 0.135);
  set(LM.mouthRight, 0.49, 0.135);
  set(LM.leftShoulder, 0.6, 0.22);
  set(LM.rightShoulder, 0.4, 0.22);
  set(LM.leftHip, 0.56, 0.5);
  set(LM.rightHip, 0.44, 0.5);
  set(LM.leftKnee, 0.55, 0.7);
  set(LM.rightKnee, 0.45, 0.7);
  set(LM.leftAnkle, 0.55, 0.9);
  set(LM.rightAnkle, 0.45, 0.9);
  set(LM.leftHeel, 0.55, 0.92);
  set(LM.rightHeel, 0.45, 0.92);
  return p;
}

/** Push landmarks out of the frame, as MediaPipe reports body parts it cannot see. */
function cut(p: Pt[], ids: number[]): Pt[] {
  const q = p.map((v) => ({ ...v }));
  for (const i of ids) q[i] = { x: q[i].x, y: 1.3, visibility: 0.05 };
  return q;
}

const LEGS = [LM.leftKnee, LM.rightKnee, LM.leftAnkle, LM.rightAnkle, LM.leftHeel, LM.rightHeel];
const FEET = [LM.leftAnkle, LM.rightAnkle, LM.leftHeel, LM.rightHeel];

describe('checkFullBody', () => {
  it('accepts one person, head to feet, facing the camera', () => {
    expect(checkFullBody([standing()], 0.75)).toMatchObject({ ok: true });
  });

  it('refuses a head-and-shoulders photo', () => {
    const r = checkFullBody([cut(standing(), [LM.leftHip, LM.rightHip, ...LEGS])], 0.75);
    expect(r).toMatchObject({ ok: false, problem: 'no-hips' });
    expect(r.message).toMatch(/head to feet/);
  });

  it('refuses a waist-up photo and a photo with the feet cut off', () => {
    expect(checkFullBody([cut(standing(), LEGS)], 0.75).problem).toBe('no-knees');
    expect(checkFullBody([cut(standing(), FEET)], 0.75).problem).toBe('no-feet');
  });

  it('accepts feet seen only by the heels', () => {
    expect(checkFullBody([cut(standing(), [LM.leftAnkle])], 0.75).ok).toBe(true);
  });

  it('refuses no person, two people, and a photo without a face', () => {
    expect(checkFullBody([], 0.75).problem).toBe('no-person');
    expect(checkFullBody([standing(), standing()], 0.75).problem).toBe('many-people');
    const noFace = standing();
    noFace[LM.nose] = { ...noFace[LM.nose], visibility: 0.1 };
    expect(checkFullBody([noFace], 0.75).problem).toBe('no-head');
  });

  it('refuses a side-on pose, a cropped head and a tiny figure', () => {
    const side = standing();
    side[LM.leftShoulder] = { x: 0.505, y: 0.22, visibility: 0.9 };
    side[LM.rightShoulder] = { x: 0.495, y: 0.22, visibility: 0.9 };
    expect(checkFullBody([side], 0.75).problem).toBe('sideways');

    const high = standing().map((v) => ({ ...v, y: v.y - 0.08 }));
    expect(checkFullBody([high], 0.75).problem).toBe('head-cut');

    const tiny = standing().map((v) => ({ ...v, y: 0.5 + (v.y - 0.5) * 0.25 }));
    expect(checkFullBody([tiny], 0.75).problem).toBe('too-small');
  });
});

describe('bodyWidth', () => {
  /** World landmarks in metres for typical proportions, with a width factor. */
  function world(k: number): Pt[] {
    const p: Pt[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0 }));
    const set = (i: number, x: number, y: number) => (p[i] = { x, y, z: 0 });
    set(LM.leftShoulder, 0.17 * k, -0.48);
    set(LM.rightShoulder, -0.17 * k, -0.48);
    set(LM.leftHip, 0.1 * k, 0);
    set(LM.rightHip, -0.1 * k, 0);
    set(LM.leftKnee, 0.1, 0.42);
    set(LM.rightKnee, -0.1, 0.42);
    set(LM.leftAnkle, 0.1, 0.82);
    set(LM.rightAnkle, -0.1, 0.82);
    return p;
  }

  it('is about 1 for typical proportions and grows with a wider build, within limits', () => {
    expect(bodyWidth(world(1))).toBeGreaterThan(0.95);
    expect(bodyWidth(world(1))).toBeLessThan(1.1);
    expect(bodyWidth(world(1.1))).toBeGreaterThan(bodyWidth(world(1)));
    expect(bodyWidth(world(2))).toBe(1.15);
    expect(bodyWidth(world(0.3))).toBe(0.88);
    expect(bodyWidth([])).toBe(1);
  });
});

describe('colour reading', () => {
  const W = 40;
  const H = 40;
  const SKIN = [200, 150, 120];
  const HAIR = [40, 28, 20];
  const BG = [240, 240, 240];

  /** Head at the top centre; hair beside the neck down to row `hairTo`. */
  function picture(hairTo: number) {
    const rgba = new Uint8ClampedArray(W * H * 4);
    const mask = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        let c = BG;
        const dx = Math.abs(x - 20);
        if (dx <= 10 && y >= 2) c = dx <= 4 || y > hairTo ? SKIN : HAIR;
        if (y <= 4 && dx <= 6) c = HAIR;
        if (c !== BG) mask[i] = 1;
        rgba.set([...c, 255], i * 4);
      }
    }
    return { rgba, mask };
  }

  it('takes the median colour of the person, ignoring the background', () => {
    const { rgba, mask } = picture(20);
    expect(medianColor(rgba, W, H, { x: 0, y: 30, w: 40, h: 5 }, mask)).toEqual(SKIN);
    expect(toHex([200, 150, 120])).toBe('#c89678');
    expect(medianColor(rgba, W, H, { x: 0, y: 0, w: 1, h: 1 }, mask)).toBeNull();
  });

  it('tells short, shoulder-length and long hair apart', () => {
    const at = { centerX: 20, chinY: 10, shoulderY: 16, halfHead: 6 };
    const len = (hairTo: number) => {
      const { rgba, mask } = picture(hairTo);
      return hairLengthFrom(rgba, W, H, mask, HAIR as [number, number, number], SKIN as [number, number, number], at);
    };
    expect(len(9)).toBe('short');
    expect(len(16)).toBe('shoulder');
    expect(len(30)).toBe('long');
  });
});
