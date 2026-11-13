/**
 * Atelier set pieces built in code: the porcelain mannequin, the brass clothing
 * rack and the swatch board. Deterministic and DOM-free (evaluated in both the
 * runtime and the editor realm).
 */
import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  SphereGeometry,
  TorusGeometry,
  createSceneMaterial,
} from '@iwsdk/core';
import {
  BODY,
  armDirection,
  armRadiusAt,
  legCenterXAt,
  legRadiusAt,
  shoulderJoint,
  torsoAt,
} from '../atelier/body.js';
import { buildShell, buildTube } from '../atelier/geometry.js';

const porcelain = createSceneMaterial({
  id: 'atelier-porcelain',
  model: 'physical',
  baseColor: '#EDE8E2',
  roughness: 0.42,
  side: 'double',
});

const brass = createSceneMaterial({
  id: 'atelier-brass',
  model: 'standard',
  baseColor: '#B8955A',
  roughness: 0.32,
  metalness: 0.85,
});

const walnut = createSceneMaterial({
  id: 'atelier-walnut',
  model: 'standard',
  baseColor: '#5A3E2B',
  roughness: 0.6,
});

const linen = createSceneMaterial({
  id: 'atelier-linen',
  model: 'standard',
  baseColor: '#D9D0C1',
  roughness: 0.95,
});

function mesh(name: string, geometry: Mesh['geometry'], material: Mesh['material'], cast = true): Mesh {
  const m = new Mesh(geometry, material);
  m.name = name;
  // Thin, small parts (hangers) skip the shadow pass: invisible gain, real cost.
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

/** Full-body porcelain mannequin on a brass turntable base. Origin = floor. */
export function createMannequin(): Group {
  const root = new Group();
  root.name = 'Mannequin';

  // Turntable base.
  const base = mesh('mannequin-base', new CylinderGeometry(0.27, 0.29, 0.025, 48), brass);
  base.position.y = 0.0125;
  root.add(base);

  const body = new Group();
  body.name = 'mannequin-body';
  root.add(body);

  body.add(
    mesh(
      'mannequin-torso',
      buildShell(BODY.crotchY - 0.04, BODY.neckBaseY, (y) => torsoAt(y), {
        rings: 56,
        segments: 48,
        capBottom: true,
      }),
      porcelain,
    ),
  );

  // Neck + head.
  body.add(
    mesh(
      'mannequin-neck',
      buildTube([0, BODY.neckBaseY - 0.01, 0], [0, 1, 0], BODY.neckTopY - BODY.neckBaseY + 0.03, () => 0.043, {
        rings: 4,
        segments: 24,
      }),
      porcelain,
    ),
  );
  const head = mesh('mannequin-head', new SphereGeometry(1, 32, 24), porcelain);
  head.scale.set(0.082, 0.108, 0.094);
  head.position.set(0, BODY.headCenterY, 0.006);
  body.add(head);

  // Legs + feet.
  const legTop = BODY.legTopY + 0.02;
  const legLen = legTop - 0.035;
  for (const side of [1, -1] as const) {
    body.add(
      mesh(
        `mannequin-leg-${side > 0 ? 'l' : 'r'}`,
        buildTube(
          [side * legCenterXAt(legTop), legTop, 0],
          [0, -1, 0],
          legLen,
          (s) => legRadiusAt(legTop - s),
          { rings: 36, segments: 24, capEnd: true },
          (s) => [side * (legCenterXAt(legTop - s) - legCenterXAt(legTop)), 0, 0],
        ),
        porcelain,
      ),
    );
    const foot = mesh(`mannequin-foot-${side > 0 ? 'l' : 'r'}`, new SphereGeometry(1, 20, 12), porcelain);
    foot.scale.set(0.036, 0.026, 0.1);
    foot.position.set(side * BODY.ankleX, 0.045, 0.045);
    body.add(foot);
  }

  // Arms + hands.
  for (const side of [1, -1] as const) {
    const dir = armDirection(side);
    const joint = shoulderJoint(side);
    body.add(
      mesh(
        `mannequin-arm-${side > 0 ? 'l' : 'r'}`,
        buildTube(joint, dir, BODY.armLength, (s) => armRadiusAt(s), {
          rings: 24,
          segments: 20,
          capStart: true,
          capEnd: true,
        }),
        porcelain,
      ),
    );
    const shoulder = mesh(`mannequin-shoulder-${side > 0 ? 'l' : 'r'}`, new SphereGeometry(0.05, 20, 14), porcelain);
    shoulder.position.set(joint[0], joint[1], joint[2]);
    body.add(shoulder);
    const hand = mesh(`mannequin-hand-${side > 0 ? 'l' : 'r'}`, new SphereGeometry(1, 16, 12), porcelain);
    hand.scale.set(0.022, 0.06, 0.034);
    const reach = BODY.armLength + 0.05;
    hand.position.set(joint[0] + dir[0] * reach, joint[1] + dir[1] * reach, joint[2]);
    hand.rotation.z = side * BODY.armSplay;
    body.add(hand);
  }

  return root;
}

export const RACK = {
  width: 1.34,
  barY: 1.62,
  /** Hanger x positions along the bar. */
  slots: 8,
} as const;

/** Brass garment rail. Origin = floor centre, bar runs along X. */
export function createClothingRack(): Group {
  const root = new Group();
  root.name = 'Clothing Rack';
  const half = RACK.width / 2;
  for (const x of [-half, half]) {
    const post = mesh('rack-post', new CylinderGeometry(0.012, 0.012, RACK.barY, 16), brass);
    post.position.set(x, RACK.barY / 2, 0);
    root.add(post);
    const foot = mesh('rack-foot', new CylinderGeometry(0.01, 0.01, 0.42, 12), brass);
    foot.rotation.x = Math.PI / 2;
    foot.position.set(x, 0.012, 0);
    root.add(foot);
    const cap = mesh('rack-cap', new SphereGeometry(0.02, 16, 12), brass);
    cap.position.set(x, RACK.barY, 0);
    root.add(cap);
  }
  const bar = mesh('rack-bar', new CylinderGeometry(0.011, 0.011, RACK.width, 16), brass);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, RACK.barY, 0);
  root.add(bar);
  return root;
}

export const SWATCH_BOARD = {
  width: 0.86,
  height: 0.66,
  centerY: 1.18,
  cols: 4,
  rows: 3,
} as const;

/** Linen pin board in a walnut frame on an easel. Origin = floor centre. */
export function createSwatchBoard(): Group {
  const root = new Group();
  root.name = 'Swatch Board';
  const { width, height, centerY } = SWATCH_BOARD;
  const board = mesh('swatch-board-linen', new BoxGeometry(width, height, 0.018), linen);
  board.position.set(0, centerY, 0);
  root.add(board);
  const frameT = 0.03;
  const frames: Array<[number, number, number, number]> = [
    [0, centerY + height / 2 + frameT / 2, width + frameT * 2, frameT],
    [0, centerY - height / 2 - frameT / 2, width + frameT * 2, frameT],
    [-width / 2 - frameT / 2, centerY, frameT, height],
    [width / 2 + frameT / 2, centerY, frameT, height],
  ];
  for (const [x, y, w, h] of frames) {
    const f = mesh('swatch-board-frame', new BoxGeometry(w, h, 0.03), walnut);
    f.position.set(x, y, 0.004);
    root.add(f);
  }
  // Easel legs.
  for (const x of [-0.3, 0.3]) {
    const leg = mesh('swatch-easel-leg', new BoxGeometry(0.025, centerY + 0.1, 0.025), walnut);
    leg.position.set(x, (centerY + 0.1) / 2, -0.03);
    root.add(leg);
  }
  const rear = mesh('swatch-easel-rear', new BoxGeometry(0.025, centerY, 0.025), walnut);
  rear.position.set(0, centerY / 2, -0.28);
  rear.rotation.x = -0.22;
  root.add(rear);
  return root;
}

/** Small brass hanger (hook + shoulder bar), origin at the hook top. */
export function createHanger(): Group {
  const root = new Group();
  root.name = 'Hanger';
  const hook = mesh('hanger-hook', new TorusGeometry(0.018, 0.0028, 8, 24, Math.PI * 1.4), brass, false);
  hook.rotation.z = Math.PI * 0.3;
  hook.position.set(0, -0.012, 0);
  root.add(hook);
  const neck = mesh('hanger-neck', new CylinderGeometry(0.0028, 0.0028, 0.03, 8), brass, false);
  neck.position.set(0, -0.045, 0);
  root.add(neck);
  const bar = mesh('hanger-bar', new CylinderGeometry(0.004, 0.004, 0.13, 8), brass, false);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, -0.062, 0);
  root.add(bar);
  return root;
}
