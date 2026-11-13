/**
 * Low-level procedural geometry for the mannequin and garments: elliptical
 * "shells" stacked along Y (torso, skirts) and tapered tubes along an arbitrary
 * axis (arms, sleeves, legs). Pure Three.js, no DOM – safe in both realms.
 *
 * UVs are in meters (u around the body, v along the length) so a fabric
 * texture with `repeat = 1 / tileSize` tiles at a consistent physical scale.
 */
import { BufferGeometry, Float32BufferAttribute, Vector3 } from '@iwsdk/core';

export type RadiusFn = (y: number) => { rx: number; rz: number };

interface ShellOptions {
  /** Number of rings along Y (>= 2). */
  rings: number;
  /** Segments around the circumference. */
  segments: number;
  /** Reference circumference (m) used for the u texture coordinate. */
  uCircumference?: number;
  capTop?: boolean;
  capBottom?: boolean;
  /** Optional per-ring vertical offset (e.g. a scoop neckline dip at the front). */
  yOffset?: (y: number, theta: number) => number;
}

/** Elliptical shell from yBottom to yTop. Theta 0 points to +Z (front). */
export function buildShell(
  yBottom: number,
  yTop: number,
  radius: RadiusFn,
  opts: ShellOptions,
): BufferGeometry {
  const { rings, segments } = opts;
  const uC = opts.uCircumference ?? 0.9;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < rings; i++) {
    const y = yBottom + ((yTop - yBottom) * i) / (rings - 1);
    const { rx, rz } = radius(y);
    for (let j = 0; j <= segments; j++) {
      const theta = (j / segments) * Math.PI * 2;
      const yy = opts.yOffset ? y + opts.yOffset(y, theta) : y;
      positions.push(rx * Math.sin(theta), yy, rz * Math.cos(theta));
      uvs.push((j / segments) * uC, y);
    }
  }
  const row = segments + 1;
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * row + j;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  if (opts.capBottom) addCap(positions, uvs, indices, 0, row, segments, yBottom, false);
  if (opts.capTop) {
    addCap(positions, uvs, indices, (rings - 1) * row, row, segments, yTop, true);
  }

  return finish(positions, uvs, indices);
}

function addCap(
  positions: number[],
  uvs: number[],
  indices: number[],
  ringStart: number,
  _row: number,
  segments: number,
  y: number,
  top: boolean,
): void {
  const center = positions.length / 3;
  positions.push(0, y, 0);
  uvs.push(0, y);
  for (let j = 0; j < segments; j++) {
    const a = ringStart + j;
    const b = ringStart + j + 1;
    if (top) indices.push(center, b, a);
    else indices.push(center, a, b);
  }
}

interface TubeOptions {
  rings: number;
  segments: number;
  uCircumference?: number;
  capEnd?: boolean;
  capStart?: boolean;
}

const _dir = new Vector3();
const _e1 = new Vector3();
const _e2 = new Vector3();
const _fwd = new Vector3(0, 0, 1);
const _up = new Vector3(0, 1, 0);

/**
 * Tapered tube from `start` along `dir` for `length` meters. The radius can
 * vary along the tube (`radius(s)` where s is distance from start), and the
 * ring centre can drift via `centerOffset(s)` (used for tapering legs).
 */
export function buildTube(
  start: readonly [number, number, number],
  dir: readonly [number, number, number],
  length: number,
  radius: (s: number) => number,
  opts: TubeOptions,
  centerOffset?: (s: number) => [number, number, number],
): BufferGeometry {
  const { rings, segments } = opts;
  const uC = opts.uCircumference ?? 0.3;
  _dir.set(dir[0], dir[1], dir[2]).normalize();
  const ref = Math.abs(_dir.dot(_fwd)) > 0.9 ? _up : _fwd;
  _e1.crossVectors(_dir, ref).normalize();
  _e2.crossVectors(_e1, _dir).normalize();

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const centers: number[] = [];

  for (let i = 0; i < rings; i++) {
    const s = (length * i) / (rings - 1);
    const off = centerOffset ? centerOffset(s) : [0, 0, 0];
    const cx = start[0] + _dir.x * s + off[0];
    const cy = start[1] + _dir.y * s + off[1];
    const cz = start[2] + _dir.z * s + off[2];
    centers.push(cx, cy, cz);
    const r = radius(s);
    for (let j = 0; j <= segments; j++) {
      const theta = (j / segments) * Math.PI * 2;
      const sn = Math.sin(theta);
      const cs = Math.cos(theta);
      positions.push(
        cx + r * (sn * _e1.x + cs * _e2.x),
        cy + r * (sn * _e1.y + cs * _e2.y),
        cz + r * (sn * _e1.z + cs * _e2.z),
      );
      uvs.push((j / segments) * uC, s);
    }
  }
  const row = segments + 1;
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * row + j;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  // Make sure the winding produces outward normals.
  if (rings >= 2 && segments >= 1) {
    const ia = 0;
    const ib = 1;
    const ic = row;
    const ax = positions[ia * 3];
    const ay = positions[ia * 3 + 1];
    const az = positions[ia * 3 + 2];
    const ux = positions[ib * 3] - ax;
    const uy = positions[ib * 3 + 1] - ay;
    const uz = positions[ib * 3 + 2] - az;
    const vx = positions[ic * 3] - ax;
    const vy = positions[ic * 3 + 1] - ay;
    const vz = positions[ic * 3 + 2] - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const ox = ax - centers[0];
    const oy = ay - centers[1];
    const oz = az - centers[2];
    if (nx * ox + ny * oy + nz * oz < 0) {
      for (let k = 0; k < indices.length; k += 3) {
        const t = indices[k + 1];
        indices[k + 1] = indices[k + 2];
        indices[k + 2] = t;
      }
    }
  }

  if (opts.capEnd) {
    const ringStart = (rings - 1) * row;
    const ci = positions.length / 3;
    const k = (rings - 1) * 3;
    positions.push(centers[k], centers[k + 1], centers[k + 2]);
    uvs.push(0, length);
    for (let j = 0; j < segments; j++) {
      indices.push(ci, ringStart + j, ringStart + j + 1);
    }
  }
  if (opts.capStart) {
    const ci = positions.length / 3;
    positions.push(centers[0], centers[1], centers[2]);
    uvs.push(0, 0);
    for (let j = 0; j < segments; j++) {
      indices.push(ci, j + 1, j);
    }
  }

  return finish(positions, uvs, indices);
}

function finish(positions: number[], uvs: number[], indices: number[]): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}
