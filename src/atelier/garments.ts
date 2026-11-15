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
  // Modern details. All optional, so older pieces and shared links keep
  // their shape.
  /** Thin slip straps, or a halter that ties at the neck (no sleeves). */
  straps?: 'slip' | 'halter';
  /** Shape of the front neckline (its depth is `neck`); scoop when unset. */
  neckline?: 'v' | 'sweetheart' | 'square' | 'cowl';
  /** Open back: how far the back is cut down from the top edge (m). */
  back?: number;
  /** Thigh slit on the left front: its height above the hem (m). */
  slit?: number;
  /** Tiered ruffles down the skirt (2 or 3). */
  tiers?: number;
  /** Gathered drape sweeping across the body, 0..1. */
  drape?: number;
  /** Boned corset bodice. */
  corset?: boolean;
  /** Double-breasted buttons down the front (4 or 6). */
  buttons?: number;
  /** Puffed, padded shoulders, 0..1. */
  shoulders?: number;
  /** Fringe falling below the hem (m). */
  fringe?: number;
}

/** No sleeves can be added: strapless, slip straps or a halter. */
export function bareShoulders(p: GarmentPiece): boolean {
  return !!p.strapless || !!p.straps;
}

/** The neckline cannot be tailored: strapless or slip (the top edge is straight across). */
export function fixedNeckline(p: GarmentPiece): boolean {
  return !!p.strapless || p.straps === 'slip';
}

/** This measurement does not exist on this piece (no sleeves to lengthen, no neckline to move). */
export function cannotTailor(p: GarmentPiece, param: TailorParam): boolean {
  return (param === 'sleeve' && bareShoulders(p)) || (param === 'neck' && fixedNeckline(p));
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
/** A slip's top edge, just above the bust. */
const SLIP_TOP = 1.31;
/** Where a halter's armholes and bare sides come down to. */
const HALTER_SIDE = 1.265;
/** The wearer's left front, where a slit opens (theta 0 = front, +X = their left). */
const SLIT_THETA = 0.5;

export interface Detail {
  segments: number;
  /** Rings per meter of garment length. */
  ringDensity: number;
}

export const HERO_DETAIL: Detail = { segments: 56, ringDensity: 70 };
/** The quality governor's lighter worn garments (about half the triangles). */
export const LIGHT_DETAIL: Detail = { segments: 40, ringDensity: 48 };
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

const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Angle in -PI..PI (0 = front). */
const wrap = (theta: number) => (theta > Math.PI ? theta - Math.PI * 2 : theta);

/** The bodice's top edge height: under the arms, at the slip line, or at the collar. */
function bodiceTop(piece: GarmentPiece): number {
  if (piece.strapless) return STRAPLESS_TOP;
  if (piece.straps === 'slip') return SLIP_TOP;
  return COLLAR_Y;
}

/**
 * How far the top edge is cut down at each angle: the neckline at the front,
 * a halter's bare sides, an open back. Positive = lower.
 */
function edgeDrop(piece: GarmentPiece, top: number): { drop: (theta: number) => number; max: number } {
  const shape = piece.neckline ?? 'scoop';
  // Strapless: only a sweetheart shapes the straight top edge.
  const depth = piece.strapless && shape !== 'sweetheart' ? 0 : piece.neck;
  const halter = piece.straps === 'halter' ? top - HALTER_SIDE : 0;
  const back = piece.back ?? 0;
  const front = (a: number) => {
    const t = Math.abs(a);
    switch (shape) {
      case 'v':
        return depth * Math.max(0, 1 - t / 0.55);
      case 'square':
        return depth * (1 - smoothstep(0.55, 0.78, t));
      case 'sweetheart':
        // A dip at the centre between two cups, falling away to the sides.
        return depth * (0.6 * Math.exp(-((a / 0.13) ** 2)) + 0.55 * smoothstep(0.55, 1.15, t) * (t < Math.PI / 2 ? 1 : 0));
      case 'cowl':
        return depth * Math.pow(Math.max(0, Math.cos(a)), 1.4);
      default:
        return depth * Math.pow(Math.max(0, Math.cos(a)), 2.2);
    }
  };
  const drop = (theta: number) => {
    const a = wrap(theta);
    const t = Math.abs(a);
    const sides = halter * smoothstep(0.3, 0.85, t);
    let d = Math.max(front(a), sides);
    if (back > 0) d = Math.max(d, sides + back * smoothstep(Math.PI - 1.15, Math.PI - 0.35, t));
    return d;
  };
  const max = Math.max(depth, halter + back, halter);
  return { drop, max };
}

/** Lower the top edge by `drop`, easing in over a window deep enough not to fold. */
function topEdgeOffset(top: number, e: { drop: (theta: number) => number; max: number }) {
  if (e.max <= 0) return undefined;
  const win = Math.max(0.22, 2.2 * e.max);
  return (y: number, theta: number) => {
    const w = clamp((y - (top - win)) / win, 0, 1);
    return -e.drop(theta) * w * w;
  };
}

/** A cowl: soft swags of fabric hanging forward under the neckline. */
function cowlFolds(piece: GarmentPiece, top: number) {
  if (piece.neckline !== 'cowl' || piece.strapless) return undefined;
  const depth = Math.max(0.04, piece.neck);
  return (y: number, theta: number) => {
    const front = Math.pow(Math.max(0, Math.cos(theta)), 3);
    const w = clamp((y - (top - depth - 0.14)) / (depth + 0.14), 0, 1);
    return front * w * (0.012 + 0.008 * Math.sin(((top - y) / 0.045) * Math.PI));
  };
}

/** Corset boning: fine vertical ridges around the bodice. */
function corsetRidges(piece: GarmentPiece) {
  if (!piece.corset) return undefined;
  return (_y: number, theta: number) => 0.0035 * Math.pow(Math.abs(Math.cos(4 * theta)), 18);
}

/** Gathers twisting across the hips, as in a draped dress. */
function drapeFolds(piece: GarmentPiece) {
  const k = piece.drape ?? 0;
  if (k <= 0) return undefined;
  return (y: number, theta: number) =>
    k * 0.007 * Math.sin(7 * theta + (y - BODY.waistY) * 30) * Math.exp(-(((y - 1.0) / 0.26) ** 2));
}

/** Tiered ruffles: each tier flares out, gathered, and the next starts above it. */
function tierRadius(piece: GarmentPiece, top: number, base: ReturnType<typeof skirtRadius>) {
  const n = Math.round(piece.tiers ?? 0);
  if (n < 2) return base;
  const span = Math.max(0.01, top - piece.hem);
  return (y: number) => {
    const r = base(y);
    const t = clamp((top - y) / span, 0, 1);
    const k = Math.min(n - 1, Math.floor(t * n));
    const frac = t * n - k;
    const boost = 0.012 * k + 0.03 * Math.pow(frac, 0.8);
    return { rx: r.rx + boost, rz: r.rz + boost * 0.85 };
  };
}

function tierFolds(piece: GarmentPiece, top: number) {
  const n = Math.round(piece.tiers ?? 0);
  if (n < 2) return undefined;
  const span = Math.max(0.01, top - piece.hem);
  return (y: number, theta: number) => {
    const t = clamp((top - y) / span, 0, 1);
    const k = Math.min(n - 1, Math.floor(t * n));
    const frac = t * n - k;
    return 0.006 * frac * Math.sin(26 * theta + k * 1.7);
  };
}

/** The hem rises into a slit on the left front, and dips on one side when draped. */
function hemCut(piece: GarmentPiece, hem: number) {
  const slit = piece.slit ?? 0;
  const drape = piece.drape ?? 0;
  if (slit <= 0 && drape <= 0) return undefined;
  const win = Math.max(0.06, 2.2 * slit);
  return (y: number, theta: number) => {
    let v = 0;
    if (slit > 0) {
      const w = clamp(1 - (y - hem) / win, 0, 1);
      v += slit * Math.exp(-(((wrap(theta) - SLIT_THETA) / 0.1) ** 2)) * w * w;
    }
    if (drape > 0) {
      const w = clamp(1 - (y - hem) / 0.12, 0, 1);
      v -= drape * 0.05 * (0.5 + 0.5 * Math.cos(theta - 2.2)) * w;
    }
    return v;
  };
}

/** Depth of the torso's surface at (x, y), front (+) or back (-) of centre. */
function surfaceZ(x: number, y: number): number {
  const r = torsoAt(y);
  return r.rz * Math.sqrt(Math.max(0, 1 - (x / r.rx) ** 2));
}

/** Two thin slip straps, front to back over the shoulders, lying on the body. */
function slipStraps(piece: GarmentPiece, ease: number, top: number, detail: Detail): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  const x = 0.085;
  // The top of the shoulder at this width: where the torso narrows to x.
  let lo = 1.36;
  let hi = 1.445;
  for (let k = 0; k < 20; k++) {
    const mid = (lo + hi) / 2;
    if (torsoAt(mid).rx > x) lo = mid;
    else hi = mid;
  }
  const peak = lo + 0.004;
  const backTop = top - Math.min(piece.back ?? 0, 0.16);
  const L = 0.3;
  const lift = ease + 0.0045;
  for (const side of [1, -1] as const) {
    out.push(
      buildTube(
        [side * x, 0, 0],
        [0, 0, -1],
        L,
        () => 0.0036,
        { rings: Math.max(14, Math.round(detail.ringDensity * 0.3)), segments: 6 },
        (sAlong) => {
          const u = sAlong / L;
          const front = u < 0.5;
          const from = front ? top : backTop;
          const y = from + (peak - from) * Math.sin(Math.PI * u);
          const z = (front ? 1 : -1) * (surfaceZ(x, y) + lift);
          return [0, y, z + sAlong];
        },
      ),
    );
  }
  return out;
}

/** A halter's band around the neck. */
function halterBand(ease: number, detail: Detail): BufferGeometry {
  return buildShell(
    COLLAR_Y - 0.004,
    COLLAR_Y + 0.028,
    (y) => {
      const r = torsoAt(y);
      return { rx: r.rx + ease + 0.004, rz: r.rz + ease + 0.004 };
    },
    { rings: 4, segments: Math.max(16, Math.round(detail.segments * 0.5)) },
  );
}

/** Double-breasted buttons: two columns down the front, from the waist up. */
function frontButtons(piece: GarmentPiece, ease: number): BufferGeometry[] {
  const n = Math.round(piece.buttons ?? 0);
  if (n < 2) return [];
  const rows = Math.ceil(n / 2);
  const out: BufferGeometry[] = [];
  const radius = bodiceRadius(piece.fit, ease);
  // Below the neckline's lowest point, so no button floats in the opening.
  const highest = bodiceTop(piece) - piece.neck - 0.035;
  const step = Math.min(0.075, (highest - (BODY.waistY - 0.05)) / Math.max(1, rows - 1));
  for (let r = 0; r < rows; r++) {
    const y = BODY.waistY - 0.05 + r * step;
    const z = radius(y).rz;
    for (const x of [-0.048, 0.048]) {
      const L = 0.008;
      out.push(
        buildTube([x, y, z - 0.002], [0, 0, 1], L, (s) => 0.0095 * Math.sqrt(Math.max(0, 1 - (2 * s / L - 1) ** 2)) + 0.0005, {
          rings: 5,
          segments: 10,
        }),
      );
    }
  }
  return out;
}

/** Fringe hanging below the hem: a band the fringe material cuts into strands. */
function fringeBand(piece: GarmentPiece, top: number, ease: number, detail: Detail): BufferGeometry[] {
  const len = piece.fringe ?? 0;
  if (len <= 0) return [];
  const base = skirtRadius(top, piece.hem, piece.fit, piece.flare, ease);
  const r = base(piece.hem);
  return [
    buildShell(piece.hem - len, piece.hem + 0.012, (y) => {
      const t = clamp((piece.hem - y) / len, 0, 1);
      return { rx: r.rx + 0.004 + t * 0.012, rz: r.rz + 0.004 + t * 0.01 };
    }, { rings: 3, segments: detail.segments }),
  ];
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
    (s) =>
      armRadiusAt(Math.max(0, s - back)) + ease + 0.004 + relaxed * (s / len) +
      (piece.shoulders ?? 0) * 0.028 * Math.exp(-s / 0.07),
    {
      rings: rings(len, detail),
      segments: Math.max(12, Math.round(detail.segments * 0.4)),
      fold: sleeveFolds(piece),
    },
  );
}

/** A garment's geometry: the cloth, small trims (buttons) and fringe. */
export interface PieceParts {
  main: BufferGeometry[];
  trim: BufferGeometry[];
  fringe: BufferGeometry[];
}

/** Build one garment piece (in mannequin space), split by material. */
export function buildPieceParts(piece: GarmentPiece, detail: Detail): PieceParts {
  const ease = EASE[piece.kind];
  const main: BufferGeometry[] = [];
  const trim: BufferGeometry[] = [];
  const fringe: BufferGeometry[] = [];
  const shellOpts = (len: number) => ({
    rings: rings(len, detail),
    segments: detail.segments,
  });
  const fit = piece.corset ? Math.max(piece.fit, 0.9) : piece.fit;

  switch (piece.kind) {
    case 'top':
    case 'jacket':
    case 'dress': {
      const top = bodiceTop(piece);
      const bodiceBottom = piece.kind === 'dress' ? BODY.waistY : piece.hem;
      main.push(
        buildShell(bodiceBottom, top, bodiceRadius(fit, ease), {
          ...shellOpts(top - bodiceBottom),
          yOffset: combineY(
            topEdgeOffset(top, edgeDrop(piece, top)),
            piece.kind === 'dress' ? undefined : hemWave(bodiceBottom, piece),
            piece.kind === 'dress' ? undefined : hemCut(piece, bodiceBottom),
          ),
          fold: combineY(bodiceFolds(piece), cowlFolds(piece, top), corsetRidges(piece), drapeFolds(piece)),
        }),
      );
      if (piece.kind === 'dress') {
        const skirt = tierRadius(piece, BODY.waistY, skirtRadius(BODY.waistY, piece.hem, fit, piece.flare, ease));
        main.push(
          buildShell(piece.hem, BODY.waistY + 0.002, skirt, {
            ...shellOpts(BODY.waistY - piece.hem),
            fold: combineY(hangingFolds(BODY.waistY, piece.hem, piece), drapeFolds(piece), tierFolds(piece, BODY.waistY)),
            yOffset: combineY(hemWave(piece.hem, piece), hemCut(piece, piece.hem)),
          }),
        );
        fringe.push(...fringeBand(piece, BODY.waistY, ease, detail));
      }
      if (piece.straps === 'slip') main.push(...slipStraps(piece, ease, top, detail));
      if (piece.straps === 'halter') main.push(halterBand(ease, detail));
      if (piece.sleeve > 0.005 && !bareShoulders(piece)) {
        main.push(sleeveTube(1, piece, ease, detail), sleeveTube(-1, piece, ease, detail));
      }
      trim.push(...frontButtons(piece, ease));
      break;
    }
    case 'skirt': {
      const skirt = tierRadius(piece, SKIRT_TOP, skirtRadius(SKIRT_TOP, piece.hem, fit, piece.flare, ease));
      main.push(
        buildShell(piece.hem, SKIRT_TOP, skirt, {
          ...shellOpts(SKIRT_TOP - piece.hem),
          fold: combineY(hangingFolds(SKIRT_TOP, piece.hem, piece), drapeFolds(piece), tierFolds(piece, SKIRT_TOP)),
          yOffset: combineY(hemWave(piece.hem, piece), hemCut(piece, piece.hem)),
        }),
      );
      fringe.push(...fringeBand(piece, SKIRT_TOP, ease, detail));
      break;
    }
    case 'trousers': {
      main.push(
        buildShell(BODY.crotchY - 0.02, TROUSER_TOP, bodiceRadius(1, ease), {
          ...shellOpts(TROUSER_TOP - BODY.crotchY),
        }),
      );
      const top = BODY.legTopY + 0.02;
      const len = top - piece.hem;
      const relaxed = (1 - piece.fit) * 0.014;
      for (const side of [1, -1] as const) {
        main.push(
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
  return { main, trim, fringe };
}

/** Every geometry of one garment piece (in mannequin space). */
export function buildPieceGeometries(piece: GarmentPiece, detail: Detail): BufferGeometry[] {
  const parts = buildPieceParts(piece, detail);
  return [...parts.main, ...parts.trim, ...parts.fringe];
}

/**
 * Build a Group of meshes for a piece. The cloth is one mesh (one draw call);
 * buttons and fringe get their own when materials are given for them (the
 * worn garment), and otherwise join the cloth (the miniatures on the rail).
 */
export function buildPieceGroup(
  piece: GarmentPiece,
  material: Material,
  detail: Detail,
  extras: { trim?: Material; fringe?: Material } = {},
): Group {
  const group = new Group();
  group.name = `garment-${piece.kind}`;
  const parts = buildPieceParts(piece, detail);
  const cloth = [...parts.main];
  if (!extras.trim) cloth.push(...parts.trim);
  const mesh = new Mesh(mergeGeometries(cloth), material);
  mesh.castShadow = detail === HERO_DETAIL;
  mesh.receiveShadow = false;
  mesh.renderOrder = LAYER[piece.kind];
  group.add(mesh);
  if (extras.trim && parts.trim.length) {
    const trim = new Mesh(mergeGeometries(parts.trim), extras.trim);
    trim.name = 'garment-trim';
    trim.renderOrder = LAYER[piece.kind] + 0.5;
    group.add(trim);
  }
  if (extras.fringe && parts.fringe.length) {
    const fr = new Mesh(mergeGeometries(parts.fringe), extras.fringe);
    fr.name = 'garment-fringe';
    fr.renderOrder = LAYER[piece.kind] + 0.25;
    group.add(fr);
  }
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
      const top = bodiceTop(piece);
      const r = torsoAt(top - piece.neck);
      return [0, top - piece.neck - 0.01, r.rz + ease + 0.04];
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
