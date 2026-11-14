/**
 * Studio set for the flat page: an oak plank floor, a limewashed plaster back
 * wall with a painted skirting board, and soft sunlight from a window off to
 * the left falling on the wall. Deterministic and DOM-free (textures are
 * seeded DataTextures), so the editor realm can evaluate it too.
 *
 * Origin: the floor at the middle of the studio, facing +Z (towards you).
 * The wall stands at local z = -WALL_Z. It is shown only on the flat page;
 * in the headset the real room is the set.
 */
import {
  DataTexture,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  BoxGeometry,
  RepeatWrapping,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
  AdditiveBlending,
} from '@iwsdk/core';

export const STUDIO_SET = {
  width: 12,
  depth: 9,
  wallHeight: 4.2,
  /** Wall distance behind the origin. */
  wallZ: 1.65,
} as const;

/** Seeded random numbers (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth value noise on a wrapping grid of `cells` (0..1). */
function valueNoise(size: number, cells: number, seed: number): Float32Array {
  const r = rng(seed);
  const grid = new Float32Array(cells * cells).map(() => r());
  const out = new Float32Array(size * size);
  const s = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = (x / size) * cells;
      const gy = (y / size) * cells;
      const x0 = Math.floor(gx) % cells;
      const y0 = Math.floor(gy) % cells;
      const x1 = (x0 + 1) % cells;
      const y1 = (y0 + 1) % cells;
      const fx = s(gx - Math.floor(gx));
      const fy = s(gy - Math.floor(gy));
      const a = grid[y0 * cells + x0] + (grid[y0 * cells + x1] - grid[y0 * cells + x0]) * fx;
      const b = grid[y1 * cells + x0] + (grid[y1 * cells + x1] - grid[y1 * cells + x0]) * fx;
      out[y * size + x] = a + (b - a) * fy;
    }
  }
  return out;
}

function texture(data: Uint8Array, size: number, srgb = true): DataTexture {
  const tex = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  if (srgb) tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/** Oak floorboards running front to back; one tile is 1.8 m square. */
function oakTexture(): DataTexture {
  const S = 512;
  const PLANKS = 10;
  const r = rng(7);
  const low = valueNoise(S, 6, 11);
  const fine = new Float32Array(S).map(() => r());
  const data = new Uint8Array(S * S * 4);
  const plankPx = S / PLANKS;
  const boards = Array.from({ length: PLANKS }, () => ({
    tone: 0.92 + r() * 0.13,
    warm: r() * 0.04,
    joints: [r(), (r() + 0.5) % 1],
    twoJoints: r() > 0.45,
  }));
  for (let y = 0; y < S; y++) {
    const v = y / S;
    for (let x = 0; x < S; x++) {
      const col = Math.floor(x / plankPx);
      const b = boards[col];
      const local = x - col * plankPx;
      // Grain: fine streaks along the board, slowly wandering.
      const wander = low[y * S + x] * 6;
      const streak = fine[Math.floor((x + wander) % S)];
      let k = b.tone * (0.95 + streak * 0.07) * (0.97 + low[((y * 3) % S) * S + x] * 0.05);
      // Board edges and end joints: thin dark gaps.
      if (local < 1.5 || local > plankPx - 1) k *= 0.74;
      for (let j = 0; j < (b.twoJoints ? 2 : 1); j++) {
        const d = Math.abs(v - b.joints[j]) * S;
        if (d < 1.2 || S - d < 1.2) k *= 0.78;
      }
      const i = (y * S + x) * 4;
      data[i] = Math.min(255, 182 * k * (1 + b.warm));
      data[i + 1] = Math.min(255, 152 * k);
      data[i + 2] = Math.min(255, 118 * k * (1 - b.warm));
      data[i + 3] = 255;
    }
  }
  return texture(data, S);
}

/** Limewashed plaster: soft cloudy variation; one tile is 2 m square. */
function plasterTexture(): DataTexture {
  const S = 256;
  const a = valueNoise(S, 4, 21);
  const b = valueNoise(S, 9, 22);
  const c = valueNoise(S, 23, 23);
  const data = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    const k = 0.955 + (a[i] - 0.5) * 0.06 + (b[i] - 0.5) * 0.035 + (c[i] - 0.5) * 0.02;
    data[i * 4] = Math.min(255, 236 * k);
    data[i * 4 + 1] = Math.min(255, 227 * k);
    data[i * 4 + 2] = Math.min(255, 213 * k);
    data[i * 4 + 3] = 255;
  }
  return texture(data, S);
}

/** Sunlight through a four-pane window: warm light, soft edges, glazing bars. */
function windowLightTexture(): DataTexture {
  const S = 256;
  const data = new Uint8Array(S * S * 4);
  const soft = (d: number, w: number) => Math.min(1, Math.max(0, d / w));
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / (S - 1);
      const v = y / (S - 1);
      const edge = soft(Math.min(u, 1 - u, v, 1 - v), 0.09);
      const bars = soft(Math.abs(u - 0.5) - 0.025, 0.03) * soft(Math.abs(v - 0.5) - 0.025, 0.03);
      const a = edge * bars;
      const i = (y * S + x) * 4;
      data[i] = 255;
      data[i + 1] = 238;
      data[i + 2] = 208;
      data[i + 3] = Math.round(a * 255);
    }
  }
  const tex = new DataTexture(data, S, S, RGBAFormat, UnsignedByteType);
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** A plane sheared sideways (x += k * y), like light falling at an angle. */
function shearedPlane(w: number, h: number, k: number): PlaneGeometry {
  const g = new PlaneGeometry(w, h);
  g.applyMatrix4(new Matrix4().set(1, k, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1));
  return g;
}

/** The flat page's studio set. Origin = floor at the studio centre, +Z forward. */
export function createStudioSet(): Group {
  const { width, depth, wallHeight, wallZ } = STUDIO_SET;
  const root = new Group();
  root.name = 'StudioSet';

  const oak = oakTexture();
  oak.repeat.set(width / 1.8, depth / 1.8);
  const floorGeo = new PlaneGeometry(width, depth);
  floorGeo.rotateX(-Math.PI / 2);
  floorGeo.translate(0, 0, -wallZ + depth / 2);
  const floor = new Mesh(floorGeo, new MeshStandardMaterial({ map: oak, roughness: 0.66, metalness: 0 }));
  floor.name = 'Floor';
  // The scene's shadow catcher already draws shadows on the floor.
  floor.receiveShadow = false;
  root.add(floor);

  const plaster = plasterTexture();
  plaster.repeat.set(width / 2, wallHeight / 2);
  const wallGeo = new PlaneGeometry(width, wallHeight);
  wallGeo.translate(0, wallHeight / 2, -wallZ);
  const wall = new Mesh(wallGeo, new MeshStandardMaterial({ map: plaster, roughness: 0.94, metalness: 0 }));
  wall.name = 'Wall';
  root.add(wall);

  const skirtingGeo = new BoxGeometry(width, 0.11, 0.018);
  skirtingGeo.translate(0, 0.055, -wallZ + 0.009);
  const skirting = new Mesh(skirtingGeo, new MeshStandardMaterial({ color: '#efe8dc', roughness: 0.55 }));
  skirting.name = 'Skirting';
  root.add(skirting);

  // Sunlight from a window off to the left: on the wall right of centre,
  // and a long pool on the floor to the front left.
  const light = new Group();
  light.name = 'WindowLight';
  const lightMat = new MeshBasicMaterial({
    map: windowLightTexture(),
    transparent: true,
    opacity: 0.3,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
  const onWall = new Mesh(shearedPlane(1.45, 1.65, 0.32), lightMat);
  onWall.name = 'OnWall';
  onWall.position.set(2.75, 1.85, -wallZ + 0.004);
  const floorMat = lightMat.clone();
  floorMat.opacity = 0.18;
  const onFloorGeo = shearedPlane(1.2, 2.1, -0.45);
  onFloorGeo.rotateX(-Math.PI / 2);
  const onFloor = new Mesh(onFloorGeo, floorMat);
  onFloor.name = 'OnFloor';
  onFloor.position.set(-2.6, 0.004, 0.9);
  for (const m of [onWall, onFloor]) {
    m.renderOrder = 2;
    m.raycast = () => {};
    m.userData.iwsdkPreviewBounds = 'exclude';
    light.add(m);
  }
  root.add(light);

  for (const m of [floor, wall, skirting]) m.raycast = () => {};
  return root;
}
