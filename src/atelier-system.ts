/**
 * AtelierSystem – the core loop:
 *  - tap a look on the brass rail → the mannequin is dressed in it
 *  - pinch a gold tailoring pin and pull → hem / neckline / sleeve / waist reshape live
 *  - tap a fabric swatch (or grab it and drop it on the form) → the garment re-skins
 *  - grab the form anywhere and twist → it spins on its turntable
 */
import {
  AudioUtils,
  BoxGeometry,
  Color,
  createSystem,
  DistanceGrabbable,
  Entity,
  Euler,
  Grabbed,
  Group,
  Hovered,
  Material,
  Mesh,
  Object3D,
  MeshStandardMaterial,
  MovementMode,
  OneHandGrabbable,
  Pressed,
  Quaternion,
  RayInteractable,
  SphereGeometry,
  CylinderGeometry,
  DepthOccludable,
  OcclusionShadersMode,
  UIKit,
  UIKitMLAsset,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import {
  DressForm,
  FabricSwatch,
  RackLook,
  TailorParams,
  TailorPin,
} from './atelier-components.js';
import { fabricById, fabricMaterial, miniMaterial, SWATCH_WALL, swatchMaterial } from './atelier/fabrics.js';
import {
  buildPieceGroup,
  GarmentPiece,
  HERO_DETAIL,
  LAYER,
  MINI_DETAIL,
  paramFromPin,
  pieceForParam,
  pieceSpan,
  pinPosition,
  RANGES,
  TailorParam,
  DRAG_DETAIL,
  Detail,
} from './atelier/garments.js';
import { makeLabel, makeTextSheet } from './atelier/labels.js';
import { sfx } from './atelier/sfx.js';
import { access } from './atelier/access.js';
import { say } from './atelier/voice.js';
import { cloneLook, LOOKS } from './atelier/looks.js';
import { createHanger, RACK, SWATCH_BOARD } from './scene-assets/atelier.scene-asset.js';

const PIN_COLORS: Record<TailorParam, string> = {
  hem: '#d9a441',
  neck: '#e07a5f',
  sleeve: '#7fb7be',
  fit: '#b388eb',
};
const PIN_LABELS: Record<TailorParam, string> = {
  hem: 'HEM ↕',
  neck: 'NECKLINE ↕',
  sleeve: 'SLEEVE ↕',
  fit: 'WAIST ↔',
};
const PARAMS: TailorParam[] = ['hem', 'neck', 'sleeve', 'fit'];
const WEAR_DURATION = 0.45;
const MINI_SCALE = 0.19;

/** A restorable outfit state for undo / redo / reset and the stylist preview. */
export interface Snapshot {
  pieces: GarmentPiece[];
  name: string;
  lookIndex: number;
}
const HISTORY_LIMIT = 30;
const TURN_STEP = Math.PI / 4;
const BADGE_HEIGHT = 1.86;
/** Seconds between light rebuilds while a pin is dragged (~20 Hz). */
const DRAG_INTERVAL = 0.05;

interface PinState {
  entity: Entity;
  /** Invisible handle on the pin for a direct (near) pinch with a real hand. */
  touch: Entity;
  param: TailorParam;
  head: Mesh;
  material: MeshStandardMaterial;
  label: Mesh;
}

export class AtelierSystem extends createSystem({
  rackLooks: { required: [RackLook] },
  rackPressed: { required: [RackLook, Pressed] },
  swatches: { required: [FabricSwatch] },
  swatchesGrabbed: { required: [FabricSwatch, Grabbed] },
  pins: { required: [TailorPin] },
  pinsGrabbed: { required: [TailorPin, Grabbed] },
  forms: { required: [DressForm] },
  anyPressed: { required: [RayInteractable, Pressed] },
  looksHovered: { required: [RackLook, Hovered] },
  swatchesHovered: { required: [FabricSwatch, Hovered] },
}) {
  /** Counters other systems (onboarding) watch to see what the user has done. */
  wearCount = 0;
  tailorCount = 0;
  fabricCount = 0;
  /** Stylist proposals shown (the tour's last step watches it). */
  styleCount = 0;
  /** Boutique visits (the tour's last step watches it). */
  boutiqueCount = 0;
  /** Whether the stylist view is open on the closet panel. */
  stylistOpen = false;
  private outfitName = '';
  /** Set by the closet while a draft piece is open (history is paused). */
  draftOpen = false;
  /** Listeners told whenever the outfit on the form changes. */
  private outfitListeners = new Set<() => void>();
  /** A pin is held but has not moved yet (no undo step until it does). */
  private pinPending = false;
  private pinChanged = false;
  private dragClock = 0;
  private tooltip?: Mesh;
  private occluderGeo = new BoxGeometry(0.001, 0.001, 0.001);
  private occlusionOn = false;
  /** Cloth sway: the skirt lags the turntable and settles (a damped spring). */
  private prevYaw = 0;
  private sway = 0;
  private swayVel = 0;
  private audioClock = 0;
  private fwd = new Vector3();
  private upV = new Vector3();
  private tooltipText = '';
  private past: Snapshot[] = [];
  private future: Snapshot[] = [];
  private origin?: Snapshot;
  private turnTarget: number | null = null;
  private badge?: Mesh;
  private badgeT = 0;
  private formEntity!: Entity;
  private outfit!: Group;
  private pieces: GarmentPiece[] = [];
  private pieceGroups: Group[] = [];
  private lookIndex = -1;
  private selectedPiece = -1;
  private wearT = 1;
  private pins: PinState[] = [];
  private swatchGrabStart = new Map<Entity, Vector3>();
  private tmpVec = new Vector3();
  private tmpVec2 = new Vector3();
  private tmpQuat = new Quaternion();
  private tmpEuler = new Euler(0, 0, 0, 'YXZ');
  private hoverColor = new Color('#fff4d6');
  private baseEmissive = new Color('#000000');
  private panelText: {
    name?: UIKit.Text;
    note?: UIKit.Text;
    hint?: UIKit.Text;
  } = {};

  init(): void {
    this.formEntity = this.world.requireSceneEntity('dress-form');
    const formObject = this.formEntity.object3D!;
    this.outfit = new Group();
    this.outfit.name = 'outfit';
    formObject.add(this.outfit);

    // A warm studio backdrop for the flat page (judges' first look in the
    // browser); cleared in XR so passthrough shows the real room.
    const backdrop = new Color('#ece5d8');
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        this.world.scene.background = state === VisibilityState.NonImmersive ? backdrop : null;
        // Pause: the system menu blurs the session. Go quiet and keep state.
        if (state === VisibilityState.VisibleBlurred) {
          sfx.pause();
          this.saveState();
        } else {
          sfx.resume();
        }
      }),
    );

    this.buildRack();
    this.buildSwatches();
    this.buildPins();
    this.wirePanel();

    this.cleanupFuncs.push(
      // One tactile tap for every pinch on anything interactive.
      this.queries.anyPressed.subscribe('qualify', () => sfx.tap()),
      // Big, readable names for what the hand ray points at.
      this.queries.looksHovered.subscribe('qualify', (e) => {
        const look = LOOKS[e.getValue(RackLook, 'lookIndex') ?? -1];
        if (look) this.showTooltip(look.name, e.object3D!, -0.56);
      }),
      this.queries.looksHovered.subscribe('disqualify', () => this.hideTooltip()),
      this.queries.swatchesHovered.subscribe('qualify', (e) => {
        const id = SWATCH_WALL[e.getValue(FabricSwatch, 'fabricIndex') ?? -1];
        if (id) this.showTooltip(fabricById(id).name, e.object3D!, -0.11);
      }),
      this.queries.swatchesHovered.subscribe('disqualify', () => this.hideTooltip()),
      this.queries.rackPressed.subscribe('qualify', (entity) => {
        this.wearLook(entity.getValue(RackLook, 'lookIndex') ?? 0);
      }),
      this.queries.swatchesGrabbed.subscribe('qualify', (entity) => {
        const start = new Vector3();
        entity.object3D?.getWorldPosition(start);
        this.swatchGrabStart.set(entity, start);
      }),
      this.queries.swatchesGrabbed.subscribe('disqualify', (entity) => {
        this.onSwatchReleased(entity);
      }),
      this.queries.pinsGrabbed.subscribe('disqualify', (entity) => {
        const changed = this.pinChanged;
        this.pinPending = false;
        this.pinChanged = false;
        if (changed) {
          // The drag used a light mesh; settle on the full-detail garment.
          const param = entity.getValue(TailorPin, 'param') as TailorParam;
          const piece = pieceForParam(this.pieces, param);
          if (piece) this.rebuildPiece(this.pieces.indexOf(piece));
          this.tailorCount++;
          this.saveState();
          this.emitOutfit();
          this.setHint('Nice cut. Undo if you change your mind, or drop a fabric on the form.');
        }
        this.layoutPins();
      }),
      this.queries.pinsGrabbed.subscribe('qualify', (entity) => {
        this.pinPending = true;
        this.pinChanged = false;
        this.dragClock = 0;
        const param = entity.getValue(TailorPin, 'param') as TailorParam;
        const target = pieceForParam(this.pieces, param);
        if (target) this.selectedPiece = this.pieces.indexOf(target);
        this.setHint(`Tailoring the ${param === 'fit' ? 'waist' : param}... pull the pin.`);
      }),
    );

    this.restoreState();
    // Depth occlusion for the form, its garments and pins (not the panels).
    this.formEntity.addComponent(DepthOccludable, { mode: OcclusionShadersMode.HardOcclusion });
    this.occlusionOn = true;
    this.markOccluded();
  }

  /**
   * IWSDK patches materials for occlusion when the component is added, and
   * keeps updating the shaders it patched. Garment materials are cached per
   * fabric, so each needs patching once: a fabric seen for the first time gets
   * a tiny hidden holder entity with its own DepthOccludable (a one-off shader
   * compile, never during a drag). Re-adding the form's component instead
   * would switch occlusion off for shaders three.js has already compiled.
   */
  /** Patch anything newly added to the form (e.g. the face photo). */
  refreshOcclusion(): void {
    this.ensureOcclusion();
  }

  private ensureOcclusion(): void {
    // Not hasComponent(): before the depth system registers the component that
    // throws, which would abort whatever rebuild called this.
    if (!this.occlusionOn) return;
    const fresh = new Set<Material>();
    this.formEntity.object3D!.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (m && m.visible && !m.userData.atelierOccluded) fresh.add(m);
      }
    });
    for (const m of fresh) {
      m.userData.atelierOccluded = true;
      const holder = new Mesh(this.occluderGeo, m);
      holder.name = `occluder-${m.name || m.uuid.slice(0, 8)}`;
      holder.visible = false;
      holder.raycast = () => {};
      const e = this.world.createTransformEntity(holder, { parent: this.formEntity });
      e.addComponent(DepthOccludable, { mode: OcclusionShadersMode.HardOcclusion });
    }
  }

  private markOccluded(): void {
    this.formEntity.object3D!.traverse((o) => {
      const mat = (o as Mesh).material as { userData?: Record<string, unknown> } | undefined;
      if ((o as Mesh).isMesh && mat?.userData) mat.userData.atelierOccluded = true;
    });
  }

  // ---------------------------------------------------------------- building

  private buildRack(): void {
    const rackEntity = this.world.requireSceneEntity('clothing-rack');
    const spacing = (RACK.width - 0.2) / (RACK.slots - 1);
    LOOKS.forEach((look, i) => {
      const item = new Group();
      item.name = `rack-look-${look.id}`;
      const hanger = createHanger();
      item.add(hanger);
      const mini = new Group();
      mini.scale.setScalar(MINI_SCALE);
      mini.position.y = -0.064 - 1.432 * MINI_SCALE;
      for (const p of look.pieces) {
        mini.add(buildPieceGroup(p, miniMaterial(p.fabric), MINI_DETAIL));
      }
      item.add(mini);
      // Generous invisible hit box so the small outfits are easy to target.
      const hit = new Mesh(
        new BoxGeometry(0.14, 0.4, 0.12),
        new MeshStandardMaterial({ visible: false }),
      );
      hit.position.y = -0.2;
      item.add(hit);
      const label = makeLabel(look.name, {
        width: 0.15,
        fontSize: 40,
        color: '#2b2118',
        background: 'rgba(250,246,238,0.92)',
        pill: true,
      });
      label.position.set(0, -0.46, 0.02);
      item.add(label);
      item.position.set(-RACK.width / 2 + 0.1 + spacing * i, RACK.barY + 0.03, 0);
      const entity = this.world.createTransformEntity(item, { parent: rackEntity });
      entity.addComponent(RackLook, { lookIndex: i });
      entity.addComponent(RayInteractable);
    });
  }

  private buildSwatches(): void {
    const boardEntity = this.world.requireSceneEntity('swatch-board');
    const board = boardEntity.object3D!;
    const { width, height, centerY, cols, rows } = SWATCH_BOARD;
    const cellW = width / cols;
    const cellH = height / rows;
    const title = makeLabel('FABRIC LIBRARY', {
      width: 0.34,
      fontSize: 40,
      color: '#f6efe2',
      background: 'rgba(58,40,28,0.9)',
      pill: true,
      letterSpacing: 4,
    });
    title.position.set(0, centerY + height / 2 + 0.07, 0.02);
    board.add(title);
    const captions: { text: string; x: number; y: number }[] = [];
    SWATCH_WALL.forEach((fabricId, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = -width / 2 + cellW * (col + 0.5);
      const y = centerY + height / 2 - cellH * (row + 0.5);
      const swatch = new Mesh(new BoxGeometry(0.15, 0.15, 0.008), swatchMaterial(fabricId));
      swatch.castShadow = false; // flush to the board: no visible shadow
      swatch.name = `swatch-${fabricId}`;
      swatch.position.set(x, y + 0.016, 0.016);
      const entity = this.world.createTransformEntity(swatch, { parent: boardEntity });
      entity.addComponent(FabricSwatch, { fabricIndex: i });
      entity.addComponent(RayInteractable);
      entity.addComponent(DistanceGrabbable, {
        movementMode: MovementMode.MoveFromTarget,
        rotate: false,
        scale: false,
        translate: true,
        returnToOrigin: true,
      });
      captions.push({ text: fabricById(fabricId).name, x, y: y - centerY - 0.08 });
    });
    // All fabric names on one sheet: one draw call, and larger than before.
    const sheet = makeTextSheet(width + 0.04, height + 0.08, captions, { textHeight: 0.019, color: '#3a2a1c' });
    sheet.position.set(0, centerY, 0.012);
    board.add(sheet);
  }

  private buildPins(): void {
    const headGeo = new SphereGeometry(0.026, 20, 14);
    const shaftGeo = new CylinderGeometry(0.0025, 0.0025, 0.05, 8);
    for (const param of PARAMS) {
      const pin = new Group();
      pin.name = `pin-${param}`;
      const material = new MeshStandardMaterial({
        color: PIN_COLORS[param],
        roughness: 0.25,
        metalness: 0.4,
        emissive: new Color(PIN_COLORS[param]),
        emissiveIntensity: 0.25,
      });
      const head = new Mesh(headGeo, material);
      pin.add(head);
      const shaft = new Mesh(
        shaftGeo,
        new MeshStandardMaterial({ color: '#c9c3b6', metalness: 0.9, roughness: 0.2 }),
      );
      shaft.rotation.x = Math.PI / 2;
      shaft.position.z = -0.03;
      pin.add(shaft);
      // Larger invisible grab target – comfortable for hand rays.
      const hit = new Mesh(new SphereGeometry(0.045, 10, 8), new MeshStandardMaterial({ visible: false }));
      pin.add(hit);
      const label = makeLabel(PIN_LABELS[param], {
        width: 0.15,
        fontSize: 48,
        color: '#ffffff',
        background: PIN_COLORS[param],
        pill: true,
      });
      label.position.set(param === 'fit' ? -0.105 : 0.105, 0.0, 0);
      pin.add(label);
      const entity = this.world.createTransformEntity(pin, { parent: this.formEntity });
      entity.addComponent(TailorPin, { param: TailorParams[param] });
      entity.addComponent(RayInteractable);
      entity.addComponent(DistanceGrabbable, {
        movementMode: MovementMode.MoveFromTarget,
        rotate: false,
        scale: false,
        translate: true,
        returnToOrigin: false,
      });
      pin.visible = false;
      // Near grab: pinch the pin itself with your fingers. Grab components are
      // one per entity, so this is a sibling handle the pin follows; near
      // handles ignore rays, so the ray grab above still works from a seat.
      const touchObj = new Group();
      touchObj.name = `pin-${param}-touch`;
      touchObj.add(new Mesh(new SphereGeometry(0.04, 10, 8), new MeshStandardMaterial({ visible: false })));
      const touch = this.world.createTransformEntity(touchObj, { parent: this.formEntity });
      touch.addComponent(TailorPin, { param: TailorParams[param] });
      touch.addComponent(OneHandGrabbable, { rotate: false, translate: true });
      touchObj.visible = false;
      this.pins.push({ entity, touch, param, head, material, label });
    }
  }

  private wirePanel(): void {
    const panel = this.world.getSceneObject<UIKitMLAsset>('atelier-panel');
    if (!panel) return;
    this.panelText.name = panel.getElementById<UIKit.Text>('look-name') ?? undefined;
    this.panelText.note = panel.getElementById<UIKit.Text>('look-note') ?? undefined;
    this.panelText.hint = panel.getElementById<UIKit.Text>('hint') ?? undefined;
    const xrButton = panel.getElementById('xr-button');
    const exitButton = panel.getElementById('exit-button');
    const resetButton = panel.getElementById('reset-button');
    if (resetButton) {
      const onReset = () => this.resetLook();
      resetButton.addEventListener('click', onReset);
      this.cleanupFuncs.push(() => resetButton.removeEventListener('click', onReset));
    }
    const wire = (id: string, fn: () => void) => {
      const node = panel.getElementById(id);
      if (!node) return;
      node.addEventListener('click', fn);
      this.cleanupFuncs.push(() => node.removeEventListener('click', fn));
    };
    wire('undo-button', () => this.undo());
    wire('redo-button', () => this.redo());
    wire('turn-button', () => this.turnForm(1));
    if (xrButton && exitButton) {
      if (!this.world.xrEnabled) {
        xrButton.setProperties({ display: 'none' });
        exitButton.setProperties({ display: 'none' });
        return;
      }
      const launchXR = () => this.world.launchXR();
      const exitXR = () => this.world.exitXR();
      xrButton.addEventListener('click', launchXR);
      exitButton.addEventListener('click', exitXR);
      this.cleanupFuncs.push(
        () => xrButton.removeEventListener('click', launchXR),
        () => exitButton.removeEventListener('click', exitXR),
        this.world.visibilityState.subscribe((state) => {
          const is2D = state === VisibilityState.NonImmersive;
          xrButton.setProperties({ display: is2D ? 'flex' : 'none' });
          exitButton.setProperties({ display: is2D ? 'none' : 'flex' });
        }),
      );
    }
  }

  // ---------------------------------------------------------------- actions

  /** Dress the mannequin in a look from the rack. */
  wearLook(index: number): void {
    const look = LOOKS[index];
    if (!look) return;
    this.setBadge(null);
    this.checkpoint();
    this.lookIndex = index;
    this.pieces = cloneLook(look);
    this.selectedPiece = this.outermostPiece();
    this.rebuildAll();
    this.wearT = 0;
    this.wearCount++;
    AudioUtils.play(this.formEntity);
    this.setPanel(look.name, look.note);
    this.setHint('Pinch a coloured pin and pull to tailor. Tap Turn to see the back.');
    this.origin = this.snapshot();
    this.saveState();
    this.emitOutfit();
  }

  /** Apply a fabric to a worn piece (defaults to the selected piece). */
  applyFabric(fabricId: string, pieceIndex = this.selectedPiece): void {
    if (this.pieces.length === 0) {
      this.setHint('Dress the form first - tap a look on the rail.');
      return;
    }
    const idx = pieceIndex >= 0 ? pieceIndex : this.outermostPiece();
    const piece = this.pieces[idx];
    if (!piece) return;
    if (piece.fabric === fabricId) {
      this.setHint(`The ${piece.kind} is already ${fabricById(fabricId).name}. Try another swatch.`);
      return;
    }
    this.checkpoint();
    piece.fabric = fabricId;
    this.fabricCount++;
    sfx.swish();
    this.selectedPiece = idx;
    this.rebuildPiece(idx);
    const kind = piece.kind === 'top' ? 'top' : piece.kind;
    this.setHint(`${fabricById(fabricId).name} on the ${kind}. Beautiful.`);
    this.saveState();
    this.emitOutfit();
  }

  private onSwatchReleased(entity: Entity): void {
    const start = this.swatchGrabStart.get(entity);
    this.swatchGrabStart.delete(entity);
    const fabricId = SWATCH_WALL[entity.getValue(FabricSwatch, 'fabricIndex') ?? 0];
    const obj = entity.object3D;
    if (!obj || !start || !fabricId) return;
    const now = this.tmpVec;
    obj.getWorldPosition(now);
    const moved = now.distanceTo(start);
    if (moved < 0.06) {
      // A tap: apply to the selected piece.
      this.applyFabric(fabricId);
      return;
    }
    // A drop: find which garment it landed on.
    const local = this.tmpVec2.copy(now);
    this.formEntity.object3D!.worldToLocal(local);
    const horizontal = Math.hypot(local.x, local.z);
    if (horizontal > 0.55 || local.y < 0 || local.y > 1.8) {
      this.setHint('Drop the swatch right onto the form to use it.');
      return;
    }
    let best = -1;
    let bestLayer = -1;
    this.pieces.forEach((p, i) => {
      const [lo, hi] = pieceSpan(p);
      if (local.y >= lo - 0.03 && local.y <= hi + 0.03 && LAYER[p.kind] > bestLayer) {
        best = i;
        bestLayer = LAYER[p.kind];
      }
    });
    this.applyFabric(fabricId, best >= 0 ? best : this.selectedPiece);
  }

  // ---------------------------------------------------------------- outfit

  private outermostPiece(): number {
    let best = -1;
    let layer = -1;
    this.pieces.forEach((p, i) => {
      if (LAYER[p.kind] > layer) {
        layer = LAYER[p.kind];
        best = i;
      }
    });
    return best;
  }

  private disposeGroup(group: Group): void {
    group.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    group.removeFromParent();
  }

  private rebuildAll(): void {
    for (const g of this.pieceGroups) this.disposeGroup(g);
    this.pieceGroups = this.pieces.map((p) => {
      const g = buildPieceGroup(p, fabricMaterial(p.fabric), HERO_DETAIL);
      this.outfit.add(g);
      return g;
    });
    this.layoutPins();
    this.ensureOcclusion();
  }

  private rebuildPiece(index: number, detail: Detail = HERO_DETAIL): void {
    const old = this.pieceGroups[index];
    if (old) this.disposeGroup(old);
    const p = this.pieces[index];
    const g = buildPieceGroup(p, fabricMaterial(p.fabric), detail);
    this.outfit.add(g);
    this.pieceGroups[index] = g;
    // A new fabric (the only thing that brings a new material) needs patching.
    if (detail === HERO_DETAIL) this.ensureOcclusion();
  }

  /** Place every pin on its garment edge (skips pins being dragged). */
  private layoutPins(): void {
    for (const pin of this.pins) {
      const obj = pin.entity.object3D!;
      const piece = pieceForParam(this.pieces, pin.param);
      const hidden = !piece || (pin.param === 'neck' && piece.strapless) ||
        (pin.param === 'sleeve' && piece.strapless);
      const touchObj = pin.touch.object3D!;
      obj.visible = !hidden;
      touchObj.visible = !hidden;
      if (hidden || !piece) continue;
      if (pin.entity.hasComponent(Grabbed) || pin.touch.hasComponent(Grabbed)) continue;
      const [x, y, z] = pinPosition(piece, pin.param);
      obj.position.set(x, y, z);
      obj.rotation.set(0, 0, 0);
      touchObj.position.set(x, y, z);
      touchObj.rotation.set(0, 0, 0);
    }
  }

  // ---------------------------------------------------------------- closet hooks

  /** Name shown for the outfit currently on the form. */
  get outfitTitle(): string {
    return this.outfitName;
  }

  /** The pieces currently on the form (live objects; tailoring mutates them). */
  get currentPieces(): GarmentPiece[] {
    return this.pieces;
  }

  /**
   * Dress the form in an arbitrary set of pieces (closet items, drafts).
   * The array and its piece objects are used as-is, so callers can keep
   * editing a draft piece by reference.
   */
  dress(pieces: GarmentPiece[], name: string, note: string, opts: { quiet?: boolean } = {}): void {
    this.setBadge(null);
    if (!opts.quiet && !this.draftOpen) this.checkpoint();
    this.lookIndex = -1;
    this.pieces = pieces;
    this.selectedPiece = this.outermostPiece();
    this.rebuildAll();
    if (!opts.quiet) {
      this.wearT = 0;
      this.wearCount++;
      AudioUtils.play(this.formEntity);
    }
    this.setPanel(name, note);
    if (!opts.quiet) this.origin = this.snapshot();
    this.saveState();
    this.emitOutfit();
  }

  // ---------------------------------------------------------------- history

  /** A deep copy of what is on the form now. */
  snapshot(): Snapshot {
    return {
      pieces: this.pieces.map((p) => ({ ...p })),
      name: this.outfitName,
      lookIndex: this.lookIndex,
    };
  }

  /** Remember the current state so the next change can be undone. */
  checkpoint(): void {
    if (this.draftOpen || this.pieces.length === 0) return;
    this.past.push(this.snapshot());
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
    this.future.length = 0;
  }

  /** Put a snapshot back on the form (no history entry of its own). */
  restore(s: Snapshot, note: string): void {
    this.setBadge(null);
    this.lookIndex = s.lookIndex;
    this.pieces = s.pieces.map((p) => ({ ...p }));
    this.selectedPiece = this.outermostPiece();
    this.rebuildAll();
    this.wearT = 0.55;
    this.setPanel(s.name || 'Choose a look', note);
    this.saveState();
    this.emitOutfit();
  }

  /** Subscribe to outfit changes; returns the unsubscribe function. */
  onOutfitChange(fn: () => void): () => void {
    this.outfitListeners.add(fn);
    return () => this.outfitListeners.delete(fn);
  }

  private emitOutfit(): void {
    for (const fn of this.outfitListeners) fn();
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  undo(): void {
    if (this.draftOpen) {
      this.setHint('Save or cancel the closet piece first.');
      return;
    }
    const prev = this.past.pop();
    if (!prev) {
      this.setHint('Nothing to undo yet.');
      return;
    }
    this.future.push(this.snapshot());
    sfx.rewind();
    this.restore(prev, 'Undone. Redo brings it back.');
    this.setHint(`Undo  |  ${this.past.length} more step${this.past.length === 1 ? '' : 's'} back.`);
  }

  redo(): void {
    if (this.draftOpen) {
      this.setHint('Save or cancel the closet piece first.');
      return;
    }
    const next = this.future.pop();
    if (!next) {
      this.setHint('Nothing to redo.');
      return;
    }
    this.past.push(this.snapshot());
    sfx.rewind();
    this.restore(next, 'Redone.');
    this.setHint(`Redo  |  ${this.future.length} more step${this.future.length === 1 ? '' : 's'} ahead.`);
  }

  /** Back to the outfit as it was first dressed, before tailoring and fabrics. */
  resetLook(): void {
    if (!this.origin || this.draftOpen) {
      this.setHint('Dress the form first - tap a look on the rail.');
      return;
    }
    this.checkpoint();
    this.restore(this.origin, 'Reset to how it first came off the rail. Undo to go back.');
    this.setHint('Fresh start. Pull a pin to tailor again.');
  }

  /** Turn the form on its turntable by 45 degrees (no reaching needed). */
  turnForm(direction: 1 | -1): void {
    const form = this.formEntity.object3D!;
    this.tmpEuler.setFromQuaternion(form.quaternion, 'YXZ');
    const from = this.turnTarget ?? this.tmpEuler.y;
    this.turnTarget = from + direction * TURN_STEP;
    this.setHint('Turning the form. Grab it with a pinch to spin it freely.');
  }

  /**
   * A large name label next to the hovered item (rail labels are small so
   * the hangers fit); readable from a seated distance. Shared by the closet
   * and boutique rails.
   */
  showTooltip(text: string, anchor: Object3D, dy: number): void {
    if (!this.tooltip || this.tooltipText !== text) {
      this.disposeTooltip();
      this.tooltip = makeLabel(text, {
        width: 0.34,
        fontSize: 52,
        color: '#2b2118',
        background: 'rgba(250,246,238,0.96)',
        pill: true,
      });
      this.tooltip.raycast = () => {};
      this.tooltip.renderOrder = 20;
      this.tooltipText = text;
    }
    anchor.add(this.tooltip);
    this.tooltip.position.set(0, dy, 0.03);
    this.tooltip.visible = true;
  }

  hideTooltip(): void {
    if (this.tooltip) this.tooltip.visible = false;
  }

  private disposeTooltip(): void {
    if (!this.tooltip) return;
    this.tooltip.removeFromParent();
    const mat = this.tooltip.material as unknown as { map?: { dispose(): void } | null; dispose(): void };
    mat.map?.dispose();
    mat.dispose();
    this.tooltip.geometry.dispose();
    this.tooltip = undefined;
    this.tooltipText = '';
  }

  /** A floating tag over the form (e.g. STYLIST PREVIEW); null hides it. */
  setBadge(text: string | null): void {
    if (this.badge) {
      this.badge.removeFromParent();
      const mat = this.badge.material as unknown as { map?: { dispose(): void } | null; dispose(): void };
      mat.map?.dispose();
      mat.dispose();
      this.badge.geometry.dispose();
      this.badge = undefined;
    }
    if (!text) return;
    this.badge = makeLabel(text, {
      width: 0.42,
      fontSize: 44,
      color: '#2b2118',
      background: '#e2c27d',
      pill: true,
    });
    this.formEntity.object3D!.parent?.add(this.badge);
  }

  /**
   * Tailor without dragging (accessibility, voice): step one measurement by an
   * eighth of its range. Hem: +1 = shorter. Sleeve / neckline: +1 = longer /
   * deeper. Waist: +1 = more fitted. Returns false when nothing changed.
   */
  nudge(param: TailorParam, dir: 1 | -1): boolean {
    const name = param === 'fit' ? 'waist' : param === 'neck' ? 'neckline' : param;
    if (this.pieces.length === 0) {
      this.setHint('Dress the form first - tap a look on the rail.');
      return false;
    }
    const piece = pieceForParam(this.pieces, param);
    const range = piece ? RANGES[piece.kind][param] : undefined;
    if (!piece || !range || ((param === 'sleeve' || param === 'neck') && piece.strapless)) {
      this.setHint(`This look has no ${name} to tailor.`);
      return false;
    }
    const step = (range.max - range.min) / 8;
    const next = Math.min(range.max, Math.max(range.min, piece[param] + dir * step));
    if (Math.abs(next - piece[param]) < 1e-4) {
      this.setHint(`The ${name} is as far as it goes that way.`);
      return false;
    }
    this.checkpoint();
    piece[param] = next;
    const index = this.pieces.indexOf(piece);
    this.selectedPiece = index;
    this.rebuildPiece(index);
    this.layoutPins();
    this.tailorCount++;
    this.saveState();
    this.emitOutfit();
    sfx.tick();
    const words: Record<TailorParam, [string, string]> = {
      hem: ['Hem shorter', 'Hem longer'],
      sleeve: ['Sleeves longer', 'Sleeves shorter'],
      neck: ['Neckline deeper', 'Neckline higher'],
      fit: ['Waist more fitted', 'Waist more relaxed'],
    };
    this.setHint(`${words[param][dir === 1 ? 0 : 1]}. Undo to go back.`);
    return true;
  }

  /** Rebuild every worn piece after an external edit (e.g. template change). */
  refreshAll(): void {
    this.selectedPiece = this.outermostPiece();
    this.rebuildAll();
    this.saveState();
  }

  /** Rebuild one worn piece after an external edit (e.g. colour change). */
  refreshPiece(index: number): void {
    if (!this.pieces[index]) return;
    this.rebuildPiece(index);
    this.layoutPins();
    this.saveState();
  }

  /** Show or hide the designer looks on the rail (the closet swaps in its own). */
  setDesignerRackVisible(visible: boolean): void {
    for (const entity of this.queries.rackLooks.entities) {
      entity.object3D!.visible = visible;
      if (visible && !entity.hasComponent(RayInteractable)) entity.addComponent(RayInteractable);
      if (!visible && entity.hasComponent(RayInteractable)) entity.removeComponent(RayInteractable);
    }
  }

  // ---------------------------------------------------------------- panel

  setPanel(name: string, note: string): void {
    this.outfitName = name;
    this.panelText.name?.setProperties({ text: name });
    this.panelText.note?.setProperties({ text: note });
    say(`${name}. ${note}`);
  }

  setHint(text: string): void {
    this.panelText.hint?.setProperties({ text });
    say(text);
  }

  // ---------------------------------------------------------------- persistence

  private saveState(): void {
    try {
      localStorage.setItem(
        'atelier.state.v1',
        JSON.stringify({ lookIndex: this.lookIndex, pieces: this.pieces, name: this.outfitName }),
      );
    } catch {
      /* storage unavailable – fine */
    }
  }

  /**
   * First visit: the form is already dressed when the studio appears, so the
   * very first thing you see is a finished look (no empty mannequin).
   */
  private dressForFirstVisit(): void {
    this.lookIndex = 0;
    this.pieces = cloneLook(LOOKS[0]);
    this.selectedPiece = this.outermostPiece();
    this.rebuildAll();
    this.setPanel(LOOKS[0].name, 'Your studio is dressed and ready. Pinch any look on the rail to change it.');
    this.origin = this.snapshot();
  }

  private restoreState(): void {
    try {
      const raw = localStorage.getItem('atelier.state.v1');
      if (!raw) {
        this.dressForFirstVisit();
        return;
      }
      const data = JSON.parse(raw) as { lookIndex: number; pieces: GarmentPiece[]; name?: string };
      if (!Array.isArray(data.pieces) || data.pieces.length === 0) return;
      this.lookIndex = data.lookIndex;
      this.pieces = data.pieces;
      this.selectedPiece = this.outermostPiece();
      this.rebuildAll();
      const name = LOOKS[this.lookIndex]?.name ?? data.name ?? 'Your mix';
      this.setPanel(name, 'Welcome back - your last look is still on the form.');
    } catch (err) {
      // Corrupt saved state: start fresh (and say why in the console).
      console.warn('[atelier] could not restore the last look', err);
    }
  }

  // ---------------------------------------------------------------- frame

  update(delta: number): void {
    // Keep the form upright: only yaw survives a twist-grab.
    const form = this.formEntity.object3D!;
    this.tmpEuler.setFromQuaternion(form.quaternion, 'YXZ');
    if (this.tmpEuler.x !== 0 || this.tmpEuler.z !== 0) {
      form.rotation.set(0, this.tmpEuler.y, 0, 'YXZ');
    }
    if (this.turnTarget !== null && access.calmMotion && !this.formEntity.hasComponent(Grabbed)) {
      // Calm motion: no spin, the form simply faces the new way.
      form.rotation.set(0, this.turnTarget, 0, 'YXZ');
      this.turnTarget = null;
    }
    if (this.turnTarget !== null) {
      if (this.formEntity.hasComponent(Grabbed)) {
        this.turnTarget = null;
      } else {
        const yaw = this.tmpEuler.y;
        let diff = this.turnTarget - yaw;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        if (Math.abs(diff) < 0.004) {
          form.rotation.set(0, this.turnTarget, 0, 'YXZ');
          this.turnTarget = null;
        } else {
          form.rotation.set(0, yaw + diff * Math.min(1, delta * 7), 0, 'YXZ');
        }
      }
    }
    if (this.badge) {
      // Float above the form's head and face the viewer.
      this.badge.position.set(
        form.position.x,
        form.position.y + BADGE_HEIGHT * form.scale.y + (access.calmMotion ? 0 : Math.sin(this.badgeT += delta * 1.6) * 0.008),
        form.position.z,
      );
      this.world.camera.getWorldPosition(this.tmpVec);
      this.badge.lookAt(this.tmpVec);
    }

    // Cloth sway: when the form turns, skirts and dresses lag behind and
    // settle with a small overshoot; tops and jackets move less.
    {
      const yaw = this.tmpEuler.y;
      let dYaw = yaw - this.prevYaw;
      dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
      this.prevYaw = yaw;
      const dt = Math.max(delta, 1e-3);
      const target = access.calmMotion ? 0 : Math.max(-0.22, Math.min(0.22, -(dYaw / dt) * 0.05));
      this.swayVel += (70 * (target - this.sway) - 7 * this.swayVel) * Math.min(dt, 0.05);
      this.sway += this.swayVel * Math.min(dt, 0.05);
      if (Math.abs(this.sway) < 1e-4 && Math.abs(this.swayVel) < 1e-3) this.sway = this.swayVel = 0;
      for (let i = 0; i < this.pieceGroups.length; i++) {
        const kind = this.pieces[i]?.kind;
        const k = kind === 'dress' || kind === 'skirt' ? 1 : kind === 'jacket' ? 0.45 : 0.3;
        this.pieceGroups[i].rotation.y = this.sway * k;
      }
    }

    // Sound from the form: keep the spatial bus and the listener up to date (~15 Hz).
    this.audioClock += delta;
    if (this.audioClock > 0.066) {
      this.audioClock = 0;
      form.getWorldPosition(this.tmpVec);
      sfx.setSource(this.tmpVec.x, this.tmpVec.y + 1.1, this.tmpVec.z);
      const cam = this.world.camera;
      cam.getWorldPosition(this.tmpVec);
      cam.getWorldDirection(this.fwd);
      this.upV.set(0, 1, 0).applyQuaternion(cam.getWorldQuaternion(this.tmpQuat));
      sfx.setListener(this.tmpVec.x, this.tmpVec.y, this.tmpVec.z, this.fwd.x, this.fwd.y, this.fwd.z, this.upV.x, this.upV.y, this.upV.z);
    }

    // Wear animation: the outfit drops onto the form with a soft settle.
    if (this.wearT < 1) {
      this.wearT = access.calmMotion ? 1 : Math.min(1, this.wearT + delta / WEAR_DURATION);
      const t = this.wearT;
      const ease = 1 - Math.pow(1 - t, 3);
      this.outfit.position.y = (1 - ease) * 0.35;
      this.outfit.scale.set(1, 0.85 + 0.15 * ease, 1);
    }

    // Live tailoring while a pin is held.
    // Rebuilds use the light drag mesh, at most ~20 times a second; the full
    // garment is rebuilt once on release.
    this.dragClock += delta;
    for (const entity of this.queries.pinsGrabbed.entities) {
      const param = entity.getValue(TailorPin, 'param') as TailorParam;
      const piece = pieceForParam(this.pieces, param);
      if (!piece) continue;
      const obj = entity.object3D!;
      const value = paramFromPin(piece, param, obj.position.x, obj.position.y);
      if (Math.abs(value - piece[param]) > 0.002 && this.dragClock >= DRAG_INTERVAL) {
        if (this.pinPending) {
          this.checkpoint();
          this.pinPending = false;
        }
        this.pinChanged = true;
        this.dragClock = 0;
        piece[param] = value;
        this.rebuildPiece(this.pieces.indexOf(piece), DRAG_DETAIL);
        sfx.tick();
        this.pulse(0.25, 12);
      }
    }
    // A pin pinched directly (near handle): the visible pin follows the fingers.
    for (const pin of this.pins) {
      if (pin.touch.hasComponent(Grabbed)) pin.entity.object3D!.position.copy(pin.touch.object3D!.position);
    }

    // Hover feedback.
    for (const entity of this.queries.rackLooks.entities) {
      const s = entity.hasComponent(Hovered) ? 1.08 : 1;
      entity.object3D!.scale.setScalar(s);
    }
    for (const pin of this.pins) {
      const hot =
        pin.entity.hasComponent(Hovered) || pin.entity.hasComponent(Grabbed) || pin.touch.hasComponent(Grabbed);
      pin.material.emissiveIntensity = hot ? 0.9 : 0.25;
      pin.head.scale.setScalar(hot ? 1.35 : 1);
    }
    for (const entity of this.queries.swatches.entities) {
      const obj = entity.object3D!;
      if (entity.hasComponent(Grabbed)) continue;
      const lift = entity.hasComponent(Hovered) ? 0.03 : 0.016;
      obj.position.z += (lift - obj.position.z) * Math.min(1, delta * 12);
    }
    void this.hoverColor;
    void this.baseEmissive;
  }

  /**
   * A short vibration on every controller that is pressing (the one doing the
   * tailoring). Hands and controllers without haptics are skipped.
   */
  private pulse(intensity: number, ms: number): void {
    const session = this.world.renderer.xr.getSession();
    if (!session) return;
    for (const src of session.inputSources) {
      const pad = src.gamepad as (Gamepad & { hapticActuators?: { pulse(v: number, d: number): Promise<boolean> }[] }) | undefined;
      if (!pad || !(pad.buttons[0]?.pressed || pad.buttons[1]?.pressed)) continue;
      const act = pad.hapticActuators?.[0];
      if (act) void act.pulse(intensity, ms).catch(() => {});
      else void (pad.vibrationActuator as unknown as { playEffect?(t: string, p: object): Promise<unknown> } | null)
        ?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: intensity, weakMagnitude: intensity })
        .catch(() => {});
    }
  }

  /** Programmatic access for debugging / scripted tests. */
  get state() {
    return { lookIndex: this.lookIndex, pieces: this.pieces, selectedPiece: this.selectedPiece };
  }
}
