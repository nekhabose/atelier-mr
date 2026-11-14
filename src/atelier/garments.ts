/**
 * Parametric garments. Each piece is described by a handful of tailoring
 * parameters (hem height, neckline depth, sleeve length, fit, flare) and is
 * rebuilt from scratch whenever a parameter changes – cheap enough to do every
 * frame while the user drags a tailoring pin.
 */
import { BufferGeometry, Group, Material, Mesh } from '@iwsdk/core';
import {
  BODY,
  armDirection,
  armRadiusAt,
  legCenterXAt,
  legRadiusAt,
  shoulderJoint,
  torsoAt,
} from './body.js';
import { buildShell, buildTube, mergeGeometries } from './geometry.js';

export type PieceKind = 'dress' | 'top' | 'skirt' | 'trousers' | 'jacket';

export interface GarmentPiece {
  kind: PieceKind;
  /** Fabric preset id (see fabrics.ts). */
  fabric: string;
  /** Hem height above the floor (m). */
  hem: number;
  /** Front neckline depth below the collar (m). */
  neck: number;
  /** Sleeve length along the arm (m); 0 = sleeveless. */
  sleeve: number;
  /** 0 = relaxed drape, 1 = tailored / cinched. */
  fit: number;
  /** Extra hem width (m) for A-line skirts or wide-leg trousers. */
  flare: number;
  /** Dress / top bodice ends under the arms (bare shoulders). */
  strapless?: boolean;
}

export type TailorParam = 'hem' | 'neck' | 'sleeve' | 'fit';

interface Range {
  min: number;
  max: number;
}

/** Allowed tailoring range for each parameter by garment kind. */
export const RANGES: Record<PieceKind, Partial<Record<TailorParam | 'flare', Range>>> = {
  dress: {
    hem: { min: 0.06, max: 0.95 },
    neck: { min: 0, max: 0.17 },
    sleeve: { min: 0, max: 0.6 },
    fit: { min: 0, max: 1 },
    flare: { min: 0, max: 0.4 },
  },
  top: {
    hem: { min: 0.8, max: 1.12 },
    neck: { min: 0, max: 0.15 },
    sleeve: { min: 0, max: 0.6 },
    fit: { min: 0, max: 1 },
  },
  jacket: {
    hem: { min: 0.72, max: 1.08 },
    neck: { min: 0.06, max: 0.24 },
    sleeve: { min: 0.15, max: 0.6 },
    fit: { min: 0, max: 1 },
  },
  skirt: {
    hem: { min: 0.08, max: 0.86 },
    fit: { min: 0, max: 1 },
    flare: { min: 0, max: 0.4 },
  },
  trousers: {
    hem: { min: 0.04, max: 0.72 },
    fit: { min: 0, max: 1 },
    flare: { min: 0, max: 0.09 },
  },
};

const EASE: Record<PieceKind, number> = {
  skirt: 0.007,
  trousers: 0.006,
  top: 0.011,
  dress: 0.01,
  jacket: 0.03,
};

/** Draw order / layering so outer garments win the depth test cleanly. */
export const LAYER: Record<PieceKind, number> = {
  trousers: 0,
  skirt: 1,
  dress: 2,
  top: 3,
  jacket: 4,
};

const SKIRT_TOP = 1.12;
const TROUSER_TOP = 1.1;
const COLLAR_Y = 1.432;
const STRAPLESS_TOP = 1.3;

export interface Detail {
  segments: number;
  /** Rings per meter of garment length. */
  ringDensity: number;
}

export const HERO_DETAIL: Detail = { segments: 56, ringDensity: 70 };
/** Used while a tailoring pin is being dragged: same shape, far less work. */
export const DRAG_DETAIL: Detail = { segments: 30, ringDensity: 34 };
export const MINI_DETAIL: Detail = { segments: 20, ringDensity: 24 };

function rings(length: number, detail: Detail): number {
  return Math.max(3, Math.ceil(Math.abs(length) * detail.ringDensity) + 1);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Bodice radius: follows the torso, relaxed garments fill the waist hollow. */
function bodiceRadius(fit: number, ease: number) {
  const bust = torsoAt(BODY.bustY);
  return (y: number) => {
    const b = torsoAt(y);
    let rx = b.rx;
    let rz = b.rz;
    if (y < BODY.bustY && y > BODY.hipY - 0.02) {
      const fill = (1 - fit) * 0.85;
      rx = Math.max(rx, rx + (bust.rx - rx) * fill);
      rz = Math.max(rz, rz + (bust.rz - rz) * fill);
    }
    const relaxed = (1 - fit) * 0.012;
    return { rx: rx + ease + relaxed, rz: rz + ease + relaxed };
  };
}

/** Skirt radius from the waist down to the hem, with A-line flare. */
function skirtRadius(top: number, hem: number, fit: number, flare: number, ease: number) {
  const hip = torsoAt(BODY.hipY);
  const span = Math.max(0.01, top - hem);
  return (y: number) => {
    const t = clamp((top - y) / span, 0, 1);
    let rx: number;
    let rz: number;
    if (y >= BODY.hipY) {
      const b = torsoAt(y);
      rx = b.rx;
      rz = b.rz;
    } else {
      // Below the hips the fabric hangs; a tailored (pencil) skirt tapers in.
      const below = clamp((BODY.hipY - y) / Math.max(0.01, BODY.hipY - hem), 0, 1);
      const taper = 1 - 0.1 * fit * below;
      rx = hip.rx * taper;
      rz = hip.rz * taper;
      // Never cut through the legs.
      const legOuter = legCenterXAt(y) + legRadiusAt(y) + 0.012;
      rx = Math.max(rx, legOuter);
      rz = Math.max(rz, legRadiusAt(y) + 0.02);
    }
    const f = flare * Math.pow(t, 1.35);
    return { rx: rx + ease + f, rz: rz + ease + f * 0.85 };
  };
}

// ------------------------------------------------------------------ drape
//
// Real cloth never hangs as a perfect cylinder. These offsets add soft
// vertical folds that deepen toward the hem (more for flared, relaxed
// garments), a hem that rises and falls with them, relaxed folds under the
// bust, wrinkles along sleeves and a pressed crease on tailored trousers.
// They are deterministic per garment, so a rebuild never "shimmers".

const FOLDS = 11;

function foldPhase(piece: GarmentPiece): number {
  return (piece.fabric.length * 0.37 + piece.flare * 13) % (Math.PI * 2);
}

/** Folds that grow from the waist (top) to the hem. */
function hangingFolds(top: number, hem: number, piece: GarmentPiece) {
  const span = Math.max(0.01, top - hem);
  const amp = 0.0022 + piece.flare * 0.055 + (1 - piece.fit) * 0.0045;
  const ph = foldPhase(piece);
  return (y: number, theta: number) => {
    const t = clamp((top - y) / span, 0, 1);
    const w = Math.pow(t, 1.6);
    return amp * w * (0.62 * Math.sin(FOLDS * theta + ph) + 0.38 * Math.sin(2.1 * FOLDS * theta + ph * 1.7));
  };
}

/** The hem lifts slightly where a fold swings out. */
function hemWave(hem: number, piece: GarmentPiece) {
  const amp = 0.0025 + piece.flare * 0.02;
  const ph = foldPhase(piece);
  return (y: number, theta: number) => {
    const w = clamp(1 - (y - hem) / 0.05, 0, 1);
    return w * w * amp * Math.sin(FOLDS * theta + ph);
  };
}

/** Relaxed folds below the bust; tailored pieces stay smooth. */
function bodiceFolds(piece: GarmentPiece) {
  const amp = 0.0008 + (1 - piece.fit) * 0.0028;
  return (y: number, theta: number) => {
    const below = clamp((BODY.bustY - y) / 0.22, 0, 1);
    return amp * below * Math.sin(9 * theta + 0.8) * (0.55 + 0.45 * Math.cos(theta));
  };
}

/** Soft wrinkles along a sleeve, strongest past the elbow. */
function sleeveFolds(piece: GarmentPiece) {
  const amp = 0.0011 + (1 - piece.fit) * 0.0016;
  return (s: number, theta: number) => amp * clamp(s / 0.12, 0, 1) * Math.sin(5 * theta + s * 38);
}

/** Trouser legs: folds near the hem plus a pressed front crease when tailored. */
function legFolds(len: number, piece: GarmentPiece, side: 1 | -1) {
  const amp = 0.0012 + (1 - piece.fit) * 0.0025 + piece.flare * 0.02;
  const crease = piece.fit * 0.0022;
  return (s: number, theta: number) => {
    const t = clamp(s / Math.max(0.01, len), 0, 1);
    const folds = amp * Math.pow(t, 1.4) * Math.sin(7 * theta + side * 1.3 + s * 6);
    // theta 0 points to +Z (the front) for a downward tube.
    const front = Math.exp(-(theta * theta) / 0.02) + Math.exp(-((theta - Math.PI * 2) ** 2) / 0.02);
    return folds + crease * front;
  };
}

function combineY(...fns: (((y: number, theta: number) => number) | undefined)[]) {
  const list = fns.filter((f): f is (y: number, theta: number) => number => !!f);
  if (list.length === 0) return undefined;
  return (y: number, theta: number) => list.reduce((acc, f) => acc + f(y, theta), 0);
}

function neckOffset(depth: number, top: number) {
  return (y: number, theta: number) => {
    if (depth <= 0) return 0;
    const w = clamp((y - (top - 0.22)) / 0.22, 0, 1);
    const front = Math.max(0, Math.cos(theta));
    return -depth * Math.pow(front, 2.2) * w * w;
  };
}

function sleeveTube(side: 1 | -1, piece: GarmentPiece, ease: number, detail: Detail) {
  const dir = armDirection(side);
  const joint = shoulderJoint(side);
  const back = 0.035;
  const start: [number, number, number] = [
    joint[0] - dir[0] * back,
    joint[1] - dir[1] * back,
    joint[2],
  ];
  const len = piece.sleeve + back;
  const relaxed = (1 - piece.fit) * 0.012;
  return buildTube(
    start,
    dir,
    len,
    (s) => armRadiusAt(Math.max(0, s - back)) + ease + 0.004 + relaxed * (s / len),
    {
      rings: rings(len, detail),
      segments: Math.max(12, Math.round(detail.segments * 0.4)),
      fold: sleeveFolds(piece),
    },
  );
}

/** Build the geometry list for one garment piece (in mannequin space). */
export function buildPieceGeometries(piece: GarmentPiece, detail: Detail): BufferGeometry[] {
  const ease = EASE[piece.kind];
  const out: BufferGeometry[] = [];
  const shellOpts = (len: number) => ({
    rings: rings(len, detail),
    segments: detail.segments,
  });

  switch (piece.kind) {
    case 'top':
    case 'jacket':
    case 'dress': {
      const top = piece.strapless ? STRAPLESS_TOP : COLLAR_Y;
      const bodiceBottom = piece.kind === 'dress' ? BODY.waistY : piece.hem;
      out.push(
        buildShell(bodiceBottom, top, bodiceRadius(piece.fit, ease), {
          ...shellOpts(top - bodiceBottom),
          yOffset: combineY(
            piece.strapless ? undefined : neckOffset(piece.neck, top),
            piece.kind === 'dress' ? undefined : hemWave(bodiceBottom, piece),
          ),
          fold: bodiceFolds(piece),
        }),
      );
      if (piece.kind === 'dress') {
        out.push(
          buildShell(
            piece.hem,
            BODY.waistY + 0.002,
            skirtRadius(BODY.waistY, piece.hem, piece.fit, piece.flare, ease),
            {
              ...shellOpts(BODY.waistY - piece.hem),
              fold: hangingFolds(BODY.waistY, piece.hem, piece),
              yOffset: hemWave(piece.hem, piece),
            },
          ),
        );
      }
      if (piece.sleeve > 0.005 && !piece.strapless) {
        out.push(sleeveTube(1, piece, ease, detail), sleeveTube(-1, piece, ease, detail));
      }
      break;
    }
    case 'skirt': {
      out.push(
        buildShell(
          piece.hem,
          SKIRT_TOP,
          skirtRadius(SKIRT_TOP, piece.hem, piece.fit, piece.flare, ease),
          {
            ...shellOpts(SKIRT_TOP - piece.hem),
            fold: hangingFolds(SKIRT_TOP, piece.hem, piece),
            yOffset: hemWave(piece.hem, piece),
          },
        ),
      );
      break;
    }
    case 'trousers': {
      out.push(
        buildShell(BODY.crotchY - 0.02, TROUSER_TOP, bodiceRadius(1, ease), {
          ...shellOpts(TROUSER_TOP - BODY.crotchY),
        }),
      );
      const top = BODY.legTopY + 0.02;
      const len = top - piece.hem;
      const relaxed = (1 - piece.fit) * 0.014;
      for (const side of [1, -1] as const) {
        out.push(
          buildTube(
            [side * legCenterXAt(top), top, 0],
            [0, -1, 0],
            len,
            (s) => legRadiusAt(top - s) + ease + relaxed + piece.flare * Math.pow(s / len, 1.2),
            {
              rings: rings(len, detail),
              segments: Math.max(14, Math.round(detail.segments * 0.5)),
              fold: legFolds(len, piece, side),
            },
            (s) => [side * (legCenterXAt(top - s) - legCenterXAt(top)), 0, 0],
          ),
        );
      }
      break;
    }
  }
  return out;
}

/** Build a Group of meshes for a piece using the given material. */
export function buildPieceGroup(piece: GarmentPiece, material: Material, detail: Detail): Group {
  const group = new Group();
  group.name = `garment-${piece.kind}`;
  // One mesh per garment (one draw call), whatever its parts.
  const mesh = new Mesh(mergeGeometries(buildPieceGeometries(piece, detail)), material);
  mesh.castShadow = detail === HERO_DETAIL;
  mesh.receiveShadow = false;
  mesh.renderOrder = LAYER[piece.kind];
  group.add(mesh);
  return group;
}

/** Position of a tailoring pin for a parameter, in mannequin space. */
export function pinPosition(piece: GarmentPiece, param: TailorParam): [number, number, number] {
  const ease = EASE[piece.kind];
  switch (param) {
    case 'hem': {
      if (piece.kind === 'trousers') {
        const r = legRadiusAt(piece.hem) + ease + piece.flare + 0.03;
        return [legCenterXAt(piece.hem), piece.hem + 0.01, r];
      }
      if (piece.kind === 'top' || piece.kind === 'jacket') {
        const r = bodiceRadius(piece.fit, ease)(piece.hem);
        // +0.01 matches paramFromPin, so touching the pin does not move the hem.
        return [0, piece.hem + 0.01, r.rz + 0.035];
      }
      const top = piece.kind === 'dress' ? BODY.waistY : SKIRT_TOP;
      const r = skirtRadius(top, piece.hem, piece.fit, piece.flare, ease)(piece.hem);
      return [0, piece.hem + 0.01, r.rz + 0.035];
    }
    case 'neck': {
      const r = torsoAt(COLLAR_Y - piece.neck);
      return [0, COLLAR_Y - piece.neck - 0.01, r.rz + ease + 0.04];
    }
    case 'sleeve': {
      const dir = armDirection(1);
      const j = shoulderJoint(1);
      const s = piece.sleeve;
      return [j[0] + dir[0] * s + 0.035, j[1] + dir[1] * s, j[2] + 0.05];
    }
    case 'fit': {
      const r = bodiceRadius(piece.fit, ease)(BODY.waistY);
      return [-(r.rx + 0.07), BODY.waistY, 0.03];
    }
  }
}

/**
 * Convert a dragged pin position (mannequin space) back into a parameter
 * value, clamped to the piece's legal range.
 */
/**
 * What a tailor would read off the tape for a measurement, in centimetres,
 * on a form scaled to your proportions (width, height): hem height from the
 * floor, neckline depth, sleeve length from the shoulder, waist round.
 */
export function measureCm(piece: GarmentPiece, param: TailorParam, bodyW = 1, bodyH = 1): number {
  switch (param) {
    case 'hem':
      return Math.round((piece.hem * bodyH - 0.025) * 100);
    case 'neck':
      return Math.round(piece.neck * bodyH * 100);
    case 'sleeve':
      return Math.round(piece.sleeve * bodyH * 100);
    case 'fit': {
      const r = bodiceRadius(piece.fit, EASE[piece.kind])(BODY.waistY);
      const a = r.rx * bodyW;
      const b = r.rz * bodyW;
      // Ramanujan's ellipse perimeter.
      return Math.round(Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b))) * 100);
    }
  }
}

/** The tape readout, in plain words. */
export function measureText(piece: GarmentPiece, param: TailorParam, bodyW = 1, bodyH = 1): string {
  const cm = measureCm(piece, param, bodyW, bodyH);
  switch (param) {
    case 'hem':
      return `Hem ${cm} cm from the floor`;
    case 'neck':
      return `Neckline ${cm} cm deep`;
    case 'sleeve':
      return cm < 3 ? 'Sleeveless' : `Sleeve ${cm} cm`;
    case 'fit':
      return `Waist ${cm} cm round`;
  }
}

export function paramFromPin(
  piece: GarmentPiece,
  param: TailorParam,
  x: number,
  y: number,
): number {
  const range = RANGES[piece.kind][param];
  if (!range) return piece[param];
  let v: number;
  switch (param) {
    case 'hem':
      v = y - 0.01;
      break;
    case 'neck':
      v = COLLAR_Y - y - 0.01;
      break;
    case 'sleeve': {
      const j = shoulderJoint(1);
      const dir = armDirection(1);
      // Project onto the arm axis.
      v = (x - 0.035 - j[0]) * dir[0] + (y - j[1]) * dir[1];
      break;
    }
    case 'fit': {
      // Pin sits ~0.07 m outside the waist; pulling it inward cinches.
      const loose = bodiceRadius(0, EASE[piece.kind])(BODY.waistY).rx + 0.07;
      const tight = bodiceRadius(1, EASE[piece.kind])(BODY.waistY).rx + 0.07;
      // Inward (smaller |x|) → fitted.
      v = (loose - Math.abs(x)) / Math.max(0.001, loose - tight);
      break;
    }
  }
  return clamp(v, range.min, range.max);
}

/** Which worn piece a tailoring parameter acts on. */
export function pieceForParam(pieces: GarmentPiece[], param: TailorParam): GarmentPiece | undefined {
  const by = (k: PieceKind) => pieces.find((p) => p.kind === k);
  switch (param) {
    case 'hem':
      return by('dress') ?? by('skirt') ?? by('trousers') ?? by('top');
    case 'sleeve':
      return by('jacket') ?? by('dress') ?? by('top');
    case 'neck':
      return by('dress') ?? by('top');
    case 'fit':
      return by('dress') ?? by('top') ?? by('jacket');
  }
}

/** Vertical extent of a piece, used to decide where a dropped swatch lands. */
export function pieceSpan(piece: GarmentPiece): [number, number] {
  switch (piece.kind) {
    case 'dress':
      return [piece.hem, COLLAR_Y];
    case 'top':
    case 'jacket':
      return [piece.hem, COLLAR_Y];
    case 'skirt':
      return [piece.hem, SKIRT_TOP];
    case 'trousers':
      return [piece.hem, TROUSER_TOP];
  }
}
