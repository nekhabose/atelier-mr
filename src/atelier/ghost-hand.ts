/**
 * A translucent "ghost" right hand used by the onboarding tour to demonstrate
 * gestures. Runtime-only procedural geometry (capsules + spheres).
 *
 * Local frame: fingers point along +Z, back of the hand faces +Y, the thumb
 * sits on +X. Object3D.lookAt() therefore aims the fingers at a target.
 */
import {
  CapsuleGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
} from '@iwsdk/core';

interface Digit {
  base: Group;
  mid: Group;
  tip: Object3D;
}

export interface GhostHand {
  root: Group;
  /** 0 = open, 1 = thumb and index tips touching. */
  setPinch(p: number): void;
  setOpacity(o: number): void;
  /** World-space point between the thumb and index tips. */
  pinchPoint(out: Vector3): Vector3;
}

const FINGERS = [
  // x offset, seg1, seg2   (index → pinky)
  { x: 0.021, l1: 0.04, l2: 0.03 },
  { x: 0.007, l1: 0.044, l2: 0.032 },
  { x: -0.008, l1: 0.041, l2: 0.03 },
  { x: -0.022, l1: 0.032, l2: 0.025 },
];

export function createGhostHand(): GhostHand {
  const skin = new MeshBasicMaterial({
    color: '#8fcbff',
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  const glow = new MeshBasicMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 1,
    depthWrite: false,
  });
  const root = new Group();
  root.name = 'ghost-hand';
  // Slightly larger than life so the demo reads from a couple of metres away.
  root.scale.setScalar(1.3);
  const noRay = (m: Mesh) => {
    m.raycast = () => {};
    m.renderOrder = 12;
    return m;
  };

  const palm = noRay(new Mesh(new SphereGeometry(1, 20, 14), skin));
  palm.scale.set(0.043, 0.015, 0.05);
  root.add(palm);

  const segment = (length: number, radius: number) => {
    const geo = new CapsuleGeometry(radius, Math.max(0.001, length - radius * 2), 4, 10);
    geo.rotateX(Math.PI / 2); // capsule axis +Y → +Z
    geo.translate(0, 0, length / 2);
    return noRay(new Mesh(geo, skin));
  };
  const tipGeo = new SphereGeometry(0.0062, 10, 8);

  const makeDigit = (x: number, y: number, z: number, l1: number, l2: number, r: number): Digit => {
    const base = new Group();
    base.position.set(x, y, z);
    base.add(segment(l1, r));
    const mid = new Group();
    mid.position.z = l1;
    mid.add(segment(l2, r * 0.88));
    base.add(mid);
    const tip = noRay(new Mesh(tipGeo, glow));
    tip.position.z = l2;
    mid.add(tip);
    root.add(base);
    return { base, mid, tip };
  };

  const fingers = FINGERS.map((f) => makeDigit(f.x, 0, 0.042, f.l1, f.l2, 0.0085));
  const thumb = makeDigit(0.034, -0.008, 0.004, 0.038, 0.03, 0.0095);

  const setPinch = (p: number) => {
    // Index curls toward the thumb; the other fingers rest folded.
    fingers[0].base.rotation.x = 0.35 + 0.55 * p;
    fingers[0].mid.rotation.x = 0.35 + 0.6 * p;
    for (let i = 1; i < fingers.length; i++) {
      fingers[i].base.rotation.x = 0.95;
      fingers[i].mid.rotation.x = 1.05;
    }
    thumb.base.rotation.set(0.25 + 0.3 * p, 0.8 - 0.62 * p, 0);
    thumb.mid.rotation.set(0.1 + 0.2 * p, -0.15 * p, 0);
  };
  setPinch(0);

  const a = new Vector3();
  const b = new Vector3();
  return {
    root,
    setPinch,
    setOpacity(o: number) {
      skin.opacity = 0.72 * o;
      glow.opacity = o;
      root.visible = o > 0.01;
    },
    pinchPoint(out: Vector3) {
      fingers[0].tip.getWorldPosition(a);
      thumb.tip.getWorldPosition(b);
      return out.copy(a).add(b).multiplyScalar(0.5);
    },
  };
}
