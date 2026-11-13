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
  Mesh,
  MeshStandardMaterial,
  MovementMode,
  Pressed,
  RayInteractable,
  SphereGeometry,
  CylinderGeometry,
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
import { fabricById, fabricMaterial, SWATCH_WALL, swatchMaterial } from './atelier/fabrics.js';
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
  TailorParam,
} from './atelier/garments.js';
import { makeLabel } from './atelier/labels.js';
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

interface PinState {
  entity: Entity;
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
}) {
  /** Counters other systems (onboarding) watch to see what the user has done. */
  wearCount = 0;
  tailorCount = 0;
  fabricCount = 0;
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

    this.buildRack();
    this.buildSwatches();
    this.buildPins();
    this.wirePanel();

    this.cleanupFuncs.push(
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
      this.queries.pinsGrabbed.subscribe('disqualify', () => {
        this.tailorCount++;
        this.layoutPins();
        this.setHint('Nice cut. Drop a fabric on the form, or tap another look.');
      }),
      this.queries.pinsGrabbed.subscribe('qualify', (entity) => {
        const param = entity.getValue(TailorPin, 'param') as TailorParam;
        const target = pieceForParam(this.pieces, param);
        if (target) this.selectedPiece = this.pieces.indexOf(target);
        this.setHint(`Tailoring the ${param === 'fit' ? 'waist' : param}... pull the pin.`);
      }),
    );

    this.restoreState();
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
        mini.add(buildPieceGroup(p, fabricMaterial(p.fabric), MINI_DETAIL));
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
    SWATCH_WALL.forEach((fabricId, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = -width / 2 + cellW * (col + 0.5);
      const y = centerY + height / 2 - cellH * (row + 0.5);
      const swatch = new Mesh(new BoxGeometry(0.15, 0.15, 0.008), swatchMaterial(fabricId));
      swatch.castShadow = true;
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
      const label = makeLabel(fabricById(fabricId).name, {
        width: 0.17,
        fontSize: 42,
        color: '#3a2a1c',
      });
      label.position.set(x, y - 0.078, 0.012);
      board.add(label);
    });
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
      this.pins.push({ entity, param, head, material, label });
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
      const onReset = () => {
        if (this.lookIndex >= 0) this.wearLook(this.lookIndex);
      };
      resetButton.addEventListener('click', onReset);
      this.cleanupFuncs.push(() => resetButton.removeEventListener('click', onReset));
    }
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
    this.lookIndex = index;
    this.pieces = cloneLook(look);
    this.selectedPiece = this.outermostPiece();
    this.rebuildAll();
    this.wearT = 0;
    this.wearCount++;
    AudioUtils.play(this.formEntity);
    this.setPanel(look.name, look.note);
    this.setHint('Pinch a coloured pin and pull to tailor. Grab the form to spin it.');
    this.saveState();
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
    piece.fabric = fabricId;
    this.fabricCount++;
    this.selectedPiece = idx;
    this.rebuildPiece(idx);
    const kind = piece.kind === 'top' ? 'top' : piece.kind;
    this.setHint(`${fabricById(fabricId).name} on the ${kind}. Beautiful.`);
    this.saveState();
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
  }

  private rebuildPiece(index: number): void {
    const old = this.pieceGroups[index];
    if (old) this.disposeGroup(old);
    const p = this.pieces[index];
    const g = buildPieceGroup(p, fabricMaterial(p.fabric), HERO_DETAIL);
    this.outfit.add(g);
    this.pieceGroups[index] = g;
  }

  /** Place every pin on its garment edge (skips pins being dragged). */
  private layoutPins(): void {
    for (const pin of this.pins) {
      const obj = pin.entity.object3D!;
      const piece = pieceForParam(this.pieces, pin.param);
      const hidden = !piece || (pin.param === 'neck' && piece.strapless) ||
        (pin.param === 'sleeve' && piece.strapless);
      obj.visible = !hidden;
      if (hidden || !piece) continue;
      if (pin.entity.hasComponent(Grabbed)) continue;
      const [x, y, z] = pinPosition(piece, pin.param);
      obj.position.set(x, y, z);
      obj.rotation.set(0, 0, 0);
    }
  }

  // ---------------------------------------------------------------- panel

  private setPanel(name: string, note: string): void {
    this.panelText.name?.setProperties({ text: name });
    this.panelText.note?.setProperties({ text: note });
  }

  setHint(text: string): void {
    this.panelText.hint?.setProperties({ text });
  }

  // ---------------------------------------------------------------- persistence

  private saveState(): void {
    try {
      localStorage.setItem(
        'atelier.state.v1',
        JSON.stringify({ lookIndex: this.lookIndex, pieces: this.pieces }),
      );
    } catch {
      /* storage unavailable – fine */
    }
  }

  private restoreState(): void {
    try {
      const raw = localStorage.getItem('atelier.state.v1');
      if (!raw) return;
      const data = JSON.parse(raw) as { lookIndex: number; pieces: GarmentPiece[] };
      if (!Array.isArray(data.pieces) || data.pieces.length === 0) return;
      this.lookIndex = data.lookIndex;
      this.pieces = data.pieces;
      this.selectedPiece = this.outermostPiece();
      this.rebuildAll();
      const look = LOOKS[this.lookIndex];
      if (look) this.setPanel(look.name, 'Welcome back - your last look is still on the form.');
    } catch {
      /* ignore corrupt state */
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

    // Wear animation: the outfit drops onto the form with a soft settle.
    if (this.wearT < 1) {
      this.wearT = Math.min(1, this.wearT + delta / WEAR_DURATION);
      const t = this.wearT;
      const ease = 1 - Math.pow(1 - t, 3);
      this.outfit.position.y = (1 - ease) * 0.35;
      this.outfit.scale.set(1, 0.85 + 0.15 * ease, 1);
    }

    // Live tailoring while a pin is held.
    for (const entity of this.queries.pinsGrabbed.entities) {
      const param = entity.getValue(TailorPin, 'param') as TailorParam;
      const piece = pieceForParam(this.pieces, param);
      if (!piece) continue;
      const obj = entity.object3D!;
      const value = paramFromPin(piece, param, obj.position.x, obj.position.y);
      if (Math.abs(value - piece[param]) > 0.002) {
        piece[param] = value;
        this.rebuildPiece(this.pieces.indexOf(piece));
      }
    }

    // Hover feedback.
    for (const entity of this.queries.rackLooks.entities) {
      const s = entity.hasComponent(Hovered) ? 1.08 : 1;
      entity.object3D!.scale.setScalar(s);
    }
    for (const pin of this.pins) {
      const hot = pin.entity.hasComponent(Hovered) || pin.entity.hasComponent(Grabbed);
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

  /** Programmatic access for debugging / scripted tests. */
  get state() {
    return { lookIndex: this.lookIndex, pieces: this.pieces, selectedPiece: this.selectedPiece };
  }
}
