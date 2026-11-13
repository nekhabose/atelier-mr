/**
 * RoomPlacementSystem – purposeful passthrough.
 *
 * When an immersive session starts, Atelier reads the room through scene
 * understanding (detected planes) and sets the studio into it:
 *  - the floor plane decides the height everything stands on;
 *  - if a wall is in front of you, the rack, form and fabric board back up
 *    against it, the way a real fitting corner would be laid out;
 *  - with no usable wall, the studio is placed in front of where you look.
 * "Move studio" on the panel re-runs the placement for wherever you face now.
 * Leaving XR restores the authored layout for the desktop view.
 *
 * Persistence: IWSDK keeps one persistent world anchor per device (restored
 * across sessions by its saved id). The studio frame is stored relative to
 * that anchor, so on the next visit - once the same anchor is restored - the
 * studio returns to the same spot in the real room. If the anchor cannot be
 * restored (new room, cleared space, unsupported runtime) placement falls
 * back to scene understanding as above.
 */
import {
  createSystem,
  Entity,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  RingGeometry,
  UIKitMLAsset,
  Vector3,
  SceneUnderstandingSystem,
  VisibilityState,
  XRAnchor,
  XRPlane,
} from '@iwsdk/core';
import { AtelierSystem } from './atelier-system.js';
import { sfx } from './atelier/sfx.js';
import { makeLabel } from './atelier/labels.js';

/** Scene nodes that make up the studio and move together. */
const STUDIO_NODES = ['dress-form', 'clothing-rack', 'swatch-board', 'atelier-panel', 'closet-panel', 'shadow-catcher'];
/** Distance from the studio frame origin to the wall (deepest authored point + clearance). */
const STUDIO_DEPTH = 2.05;
/** Only walls in this range (metres along your gaze) are used for snapping. */
const WALL_MIN = 1.85;
const WALL_MAX = 2.8; // farther walls tend to have furniture in between
/** Wait this long for planes before falling back to "in front of you". */
const PLANE_WAIT = 2.5;
const RING_TIME = 1.4;
/** How long to wait for a saved anchor to come back before placing afresh. */
const ANCHOR_WAIT = 4;
const ROOM_KEY = 'atelier.room.v1';
/** Where IWSDK stores its persistent anchor id. */
const IWSDK_ANCHOR_KEY = 'iwsdk_scene_anchor_uuid';

/** The studio frame relative to the persistent anchor. */
interface SavedRoom {
  uuid: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

interface StudioNode {
  id: string;
  obj: Object3D;
  basePos: Vector3;
  baseScale: Vector3;
}

/**
 * The opening reveal: each studio piece settles into place in turn, then the
 * title appears. Delays are seconds from the moment the studio is placed.
 */
const REVEAL: Record<string, number> = {
  'shadow-catcher': 0,
  'dress-form': 0.05,
  'clothing-rack': 0.35,
  'swatch-board': 0.5,
  'atelier-panel': 0.85,
  'closet-panel': 0.95,
};
const REVEAL_DUR = 0.7;
const TITLE_IN = 1.2;
const TITLE_OUT = 4.2;

/** Ease out with a small overshoot, so pieces "land". */
function easeOutBack(t: number): number {
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/** Minimal view of the WebXR XRPlane we read. */
interface DetectedPlane {
  orientation?: 'horizontal' | 'vertical';
  semanticLabel?: string;
  polygon?: ArrayLike<{ x: number; z: number }>;
}

export type PlacementResult = 'wall' | 'front' | 'restored' | 'authored';

export class RoomPlacementSystem extends createSystem({
  planes: { required: [XRPlane] },
}) {
  private nodes: StudioNode[] = [];
  private yaw = 0;
  private inXR = false;
  private placed = false;
  private waitT = 0;
  private ring!: Mesh;
  private ringMat!: MeshBasicMaterial;
  private ringT = RING_TIME;
  /** Seconds into the opening reveal (Infinity when not revealing). */
  private revealT = Infinity;
  private revealedThisSession = false;
  private title!: Group;
  private titleMats: MeshBasicMaterial[] = [];
  /** Last placement, for scripted checks. */
  lastPlacement: PlacementResult = 'authored';
  wallDistance = 0;
  /** True once the current placement is saved against the room anchor. */
  anchored = false;
  private frame = { x: 0, y: 0, z: 0, yaw: 0 };
  private saved: SavedRoom | null = null;
  private anchorMarker!: Object3D;
  private anchorEntity!: Entity;
  private anchorFrames = 0;
  private needsSave = false;
  private m = new Matrix4();
  private mInv = new Matrix4();
  private v = new Vector3();
  private anchorQ = new Quaternion();
  private scratchPos = new Vector3();
  private scratchScale = new Vector3();

  private head = new Vector3();
  private dir = new Vector3();
  private n = new Vector3();
  private o = new Vector3();
  private hit = new Vector3();
  private bestHit = new Vector3();
  private bestN = new Vector3();
  private local = new Vector3();
  private origin = new Vector3();
  private up = new Vector3(0, 1, 0);
  private q = new Quaternion();
  private qDelta = new Quaternion();
  private qInv = new Quaternion();

  init(): void {
    for (const id of STUDIO_NODES) {
      const obj = this.world.getSceneObject(id);
      if (obj) this.nodes.push({ id, obj, basePos: obj.position.clone(), baseScale: obj.scale.clone() });
    }

    // A soft ring that blooms on the floor under the form when it lands.
    const ringGroup = new Group();
    this.ringMat = new MeshBasicMaterial({
      color: '#e2c27d',
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.ring = new Mesh(new RingGeometry(0.3, 0.34, 64), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.006;
    this.ring.visible = false;
    this.ring.raycast = () => {};
    ringGroup.add(this.ring);
    this.world.createTransformEntity(ringGroup, {
      parent: this.world.requireSceneEntity('dress-form'),
    });

    // An invisible marker parented to IWSDK's world anchor gives us the
    // anchor's frame each frame (its parent is the anchored group).
    this.anchorMarker = new Object3D();
    this.anchorMarker.name = 'room-anchor-marker';
    this.anchorEntity = this.world.createTransformEntity(this.anchorMarker);
    this.anchorEntity.addComponent(XRAnchor);
    try {
      const raw = readStorage(ROOM_KEY);
      this.saved = raw ? (JSON.parse(raw) as SavedRoom) : null;
    } catch {
      this.saved = null;
    }

    // Title card for the opening moment.
    this.title = new Group();
    this.title.name = 'studio-title';
    const word = makeLabel('ATELIER', {
      width: 1.05,
      fontSize: 62,
      weight: 500,
      color: '#f6e7c4',
      background: 'rgba(28,24,20,0.62)',
      pill: true,
      letterSpacing: 20,
      font: 'Didot, "Bodoni 72", Georgia, "Times New Roman", serif',
    });
    const sub = makeLabel('YOUR STUDIO IS READY', {
      width: 0.6,
      fontSize: 34,
      weight: 600,
      color: '#2b2118',
      background: 'rgba(226,194,125,0.92)',
      pill: true,
      letterSpacing: 6,
    });
    sub.position.y = -0.16;
    this.title.add(word, sub);
    for (const m of [word, sub]) {
      const mat = m.material as MeshBasicMaterial;
      mat.opacity = 0;
      this.titleMats.push(mat);
      m.raycast = () => {};
    }
    this.title.visible = false;
    this.world.createTransformEntity(this.title, {
      parent: this.world.requireSceneEntity('dress-form'),
    });
    this.title.position.set(0, 2.08, 0.05);

    const panel = this.world.getSceneObject<UIKitMLAsset>('atelier-panel');
    const moveButton = panel?.getElementById('place-button');
    if (moveButton) {
      const onMove = () => this.place(true);
      moveButton.addEventListener('click', onMove);
      this.cleanupFuncs.push(() => moveButton.removeEventListener('click', onMove));
      moveButton.setProperties({ display: 'none' });
    }

    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        const inXR = state !== VisibilityState.NonImmersive;
        if (inXR === this.inXR) return;
        this.inXR = inXR;
        moveButton?.setProperties({ display: inXR ? 'flex' : 'none' });
        if (inXR) {
          this.revealedThisSession = false;
          // Hidden until placed, so the reveal is the first thing you see.
          for (const node of this.nodes) node.obj.visible = false;
          this.placed = false;
          this.waitT = 0;
          this.anchorFrames = 0;
          this.anchored = false;
        } else {
          this.finishReveal();
          this.applyFrame(0, 0, 0, 0);
          this.lastPlacement = 'authored';
        }
      }),
    );
  }

  /**
   * Place the studio for the current head pose.
   * @param announce show feedback on the panel.
   */
  place(announce = false): PlacementResult {
    const camera = this.world.camera;
    camera.getWorldPosition(this.head);
    camera.getWorldDirection(this.dir);
    this.dir.y = 0;
    if (this.dir.lengthSq() < 1e-6) this.dir.set(0, 0, -1);
    this.dir.normalize();

    // Floor: prefer a plane labelled floor, else the lowest horizontal plane
    // well below the head. local-floor already puts the floor at y=0.
    let floorY = 0;
    let floorFound = false;
    let bestT = Infinity;
    for (const entity of this.queries.planes.entities) {
      const plane = entity.getValue(XRPlane, '_plane') as DetectedPlane | undefined;
      const obj = entity.object3D;
      if (!plane || !obj) continue;
      obj.getWorldPosition(this.o);
      if (plane.orientation === 'horizontal') {
        const isFloor = plane.semanticLabel === 'floor';
        if (isFloor || (this.o.y < this.head.y - 0.9 && (!floorFound || this.o.y < floorY))) {
          if (isFloor || !floorFound) floorY = this.o.y;
          floorFound = floorFound || isFloor;
        }
        continue;
      }
      // Vertical plane: its normal is the plane's local +Y.
      obj.getWorldQuaternion(this.q);
      this.n.copy(this.up).applyQuaternion(this.q);
      this.n.y = 0;
      if (this.n.lengthSq() < 1e-4) continue;
      this.n.normalize();
      const denom = this.dir.dot(this.n);
      if (Math.abs(denom) < 0.35) continue; // grazing wall
      const t = this.local.copy(this.o).sub(this.head).dot(this.n) / denom;
      if (t < WALL_MIN || t > WALL_MAX || t >= bestT) continue;
      this.hit.copy(this.dir).multiplyScalar(t).add(this.head);
      if (!this.insidePolygon(obj, plane)) continue;
      bestT = t;
      this.bestHit.copy(this.hit);
      // Point the normal back toward the viewer.
      this.bestN.copy(this.n);
      if (this.bestN.dot(this.dir) > 0) this.bestN.negate();
    }

    let result: PlacementResult;
    if (bestT < Infinity) {
      // Studio frame: -Z points into the wall, origin STUDIO_DEPTH out from it.
      const yaw = Math.atan2(this.bestN.x, this.bestN.z);
      this.origin.copy(this.bestN).multiplyScalar(STUDIO_DEPTH).add(this.bestHit);
      this.applyFrame(this.origin.x, floorY, this.origin.z, yaw);
      result = 'wall';
      this.wallDistance = bestT;
    } else {
      const yaw = Math.atan2(-this.dir.x, -this.dir.z);
      this.applyFrame(this.head.x, floorY, this.head.z, yaw);
      result = 'front';
      this.wallDistance = 0;
    }
    this.placed = true;
    this.lastPlacement = result;
    this.ringT = 0;
    this.ring.visible = true;
    this.needsSave = true;
    this.anchored = false;
    sfx.settle();
    this.startReveal();

    const atelier = this.world.getSystem(AtelierSystem);
    if (atelier && (announce || result === 'wall')) {
      atelier.setHint(
        result === 'wall'
          ? 'Studio set against your wall. Face another spot and tap Move studio to try it there.'
          : 'Studio placed in front of you. Face a wall and tap Move studio to back it up there.',
      );
    }
    return result;
  }

  /** Is the hit point (this.hit) within the plane polygon's bounds? */
  private insidePolygon(obj: Object3D, plane: DetectedPlane): boolean {
    const poly = plane.polygon;
    if (!poly || poly.length < 3) return true;
    this.local.copy(this.hit);
    obj.worldToLocal(this.local);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }
    const pad = 0.25;
    return (
      this.local.x > minX - pad &&
      this.local.x < maxX + pad &&
      this.local.z > minZ - pad &&
      this.local.z < maxZ + pad
    );
  }

  /** Move every studio node from its authored pose into the given frame. */
  private applyFrame(x: number, y: number, z: number, yaw: number): void {
    // Rotate current orientations by the change in yaw (keeps the user's spin of the form).
    this.qInv.setFromAxisAngle(this.up, -this.yaw);
    this.qDelta.setFromAxisAngle(this.up, yaw).multiply(this.qInv);
    this.q.setFromAxisAngle(this.up, yaw);
    for (const node of this.nodes) {
      node.obj.position.copy(node.basePos).applyQuaternion(this.q);
      node.obj.position.x += x;
      node.obj.position.y += y;
      node.obj.position.z += z;
      node.obj.quaternion.premultiply(this.qDelta);
    }
    this.yaw = yaw;
    this.frame.x = x;
    this.frame.y = y;
    this.frame.z = z;
    this.frame.yaw = yaw;
  }

  // ---------------------------------------------------------------- anchor

  /** Is IWSDK's world anchor live this session, with our marker attached? */
  private anchorLive(): boolean {
    const su = this.world.getSystem(SceneUnderstandingSystem) as unknown as { xrAnchor?: unknown } | undefined;
    const live = !!su?.xrAnchor && this.anchorEntity.getValue(XRAnchor, 'attached') === true;
    this.anchorFrames = live ? this.anchorFrames + 1 : 0;
    // One extra frame so the anchored group has taken the anchor's pose.
    return this.anchorFrames > 2;
  }

  /** The anchor frame (world matrix of the anchored group). */
  private anchorMatrix(): Matrix4 | null {
    const group = this.anchorMarker.parent;
    if (!group) return null;
    group.updateMatrixWorld(true);
    return this.m.copy(group.matrixWorld);
  }

  private yawOf(m: Matrix4): number {
    m.decompose(this.scratchPos, this.anchorQ, this.scratchScale);
    this.dir.set(0, 0, -1).applyQuaternion(this.anchorQ);
    return Math.atan2(-this.dir.x, -this.dir.z);
  }

  /** Store the current studio frame relative to the anchor. */
  private saveToAnchor(): void {
    const uuid = readStorage(IWSDK_ANCHOR_KEY);
    const m = this.anchorMatrix();
    if (!uuid || !m) return;
    this.mInv.copy(m).invert();
    this.v.set(this.frame.x, this.frame.y, this.frame.z).applyMatrix4(this.mInv);
    const record: SavedRoom = {
      uuid,
      x: this.v.x,
      y: this.v.y,
      z: this.v.z,
      yaw: this.frame.yaw - this.yawOf(m),
    };
    try {
      localStorage.setItem(ROOM_KEY, JSON.stringify(record));
      this.saved = record;
      this.anchored = true;
    } catch {
      /* storage unavailable */
    }
  }

  /** Put the studio back where it was saved last time. */
  private restoreFromAnchor(saved: SavedRoom): void {
    const m = this.anchorMatrix();
    if (!m) return;
    this.v.set(saved.x, saved.y, saved.z).applyMatrix4(m);
    this.applyFrame(this.v.x, this.v.y, this.v.z, saved.yaw + this.yawOf(m));
    this.placed = true;
    this.anchored = true;
    this.needsSave = false;
    this.lastPlacement = 'restored';
    sfx.settle();
    this.startReveal();
    this.ringT = 0;
    this.ring.visible = true;
    this.world
      .getSystem(AtelierSystem)
      ?.setHint('Welcome back - your studio is right where you left it in your room.');
  }

  // ---------------------------------------------------------------- reveal

  /** True while the opening reveal is still playing (or not yet placed). */
  get revealing(): boolean {
    return (this.inXR && !this.placed) || this.revealT !== Infinity;
  }

  /** First placement of a session: play the opening reveal. */
  private startReveal(): void {
    if (this.revealedThisSession) return;
    this.revealedThisSession = true;
    this.revealT = 0;
    this.title.visible = true;
    this.stepReveal(0);
  }

  private stepReveal(t: number): void {
    for (const node of this.nodes) {
      const delay = REVEAL[node.id] ?? 0;
      const p = Math.min(1, Math.max(0, (t - delay) / REVEAL_DUR));
      const s = p <= 0 ? 0.001 : Math.max(0.001, easeOutBack(p));
      node.obj.scale.copy(node.baseScale).multiplyScalar(s);
      node.obj.visible = p > 0;
    }
    // Title: fade in, hold, fade out, drifting up a touch.
    const fadeIn = Math.min(1, Math.max(0, (t - TITLE_IN) / 0.6));
    const fadeOut = Math.min(1, Math.max(0, (TITLE_OUT - t) / 0.8));
    const a = Math.min(fadeIn, fadeOut);
    for (const m of this.titleMats) m.opacity = a;
    this.title.position.y = 2.02 + 0.06 * fadeIn;
    this.world.camera.getWorldPosition(this.head);
    this.title.lookAt(this.head);
  }

  private finishReveal(): void {
    if (this.revealT === Infinity) return;
    this.revealT = Infinity;
    for (const node of this.nodes) {
      node.obj.scale.copy(node.baseScale);
      node.obj.visible = true;
    }
    this.title.visible = false;
  }

  update(delta: number): void {
    if (this.revealT !== Infinity) {
      const before = this.revealT;
      this.revealT += delta;
      if (before < TITLE_IN && this.revealT >= TITLE_IN) sfx.sparkle();
      if (this.revealT > TITLE_OUT + 0.2) this.finishReveal();
      else this.stepReveal(this.revealT);
    }
    const live = this.inXR && this.anchorLive();
    if (this.inXR && !this.placed) {
      this.waitT += delta;
      const saved = this.saved;
      const sameAnchor = live && !!saved && readStorage(IWSDK_ANCHOR_KEY) === saved.uuid;
      if (sameAnchor && saved) {
        this.restoreFromAnchor(saved);
      } else {
        // Waiting for a saved anchor? Give it a moment; otherwise (or once a
        // different anchor is live) place from planes.
        const waitingForAnchor = !!saved && !live && this.waitT < ANCHOR_WAIT;
        const planesReady =
          (this.queries.planes.entities.size > 0 && this.waitT > 0.6) || this.waitT > PLANE_WAIT;
        if (!waitingForAnchor && planesReady) this.place(false);
      }
    }
    if (this.needsSave && live) {
      this.needsSave = false;
      this.saveToAnchor();
    }
    if (this.ringT < RING_TIME) {
      this.ringT += delta;
      const t = Math.min(1, this.ringT / RING_TIME);
      const s = 1 + t * 1.2;
      this.ring.scale.set(s, s, 1);
      this.ringMat.opacity = 0.85 * (1 - t);
      if (t >= 1) this.ring.visible = false;
    }
  }
}
