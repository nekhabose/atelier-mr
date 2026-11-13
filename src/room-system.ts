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
 */
import {
  createSystem,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  RingGeometry,
  UIKitMLAsset,
  Vector3,
  VisibilityState,
  XRPlane,
} from '@iwsdk/core';
import { AtelierSystem } from './atelier-system.js';

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

interface StudioNode {
  obj: Object3D;
  basePos: Vector3;
}

/** Minimal view of the WebXR XRPlane we read. */
interface DetectedPlane {
  orientation?: 'horizontal' | 'vertical';
  semanticLabel?: string;
  polygon?: ArrayLike<{ x: number; z: number }>;
}

export type PlacementResult = 'wall' | 'front' | 'authored';

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
  /** Last placement, for scripted checks. */
  lastPlacement: PlacementResult = 'authored';
  wallDistance = 0;

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
      if (obj) this.nodes.push({ obj, basePos: obj.position.clone() });
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
          this.placed = false;
          this.waitT = 0;
        } else {
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
  }

  update(delta: number): void {
    if (this.inXR && !this.placed) {
      this.waitT += delta;
      // Give plane detection a moment, then place (with or without planes).
      if ((this.queries.planes.entities.size > 0 && this.waitT > 0.6) || this.waitT > PLANE_WAIT) {
        this.place(false);
      }
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
