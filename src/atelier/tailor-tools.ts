/**
 * Tailoring tools shown while you pull a pin: a yellow tape measure laid
 * along what you are changing (floor to hem, collar to neckline, shoulder to
 * cuff, round the waist), a blue chalk mark across the garment at the pin,
 * and a paper card with the measurement in centimetres. Runtime only (canvas
 * textures). Everything is built once and reused; show() allocates nothing
 * unless the centimetre readout changes.
 */
import {
  CanvasTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from '@iwsdk/core';
import { BODY, shoulderJoint } from './body.js';
import { GarmentPiece, measureCm, measureText, TailorParam } from './garments.js';
import { makeLabel } from './labels.js';
import { INK, PAPER, SERIF } from './palette.js';

/** Metres of tape the texture covers. */
const TAPE_M = 2;
const TAPE_W = 0.024;
const COLLAR_Y = 1.432;

function tapeTexture(): CanvasTexture {
  const W = 64;
  const H = 2048;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#e9c34a';
  ctx.fillRect(0, 0, W, H);
  const pxPerCm = H / (TAPE_M * 100);
  ctx.fillStyle = '#2a231c';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 22px "Helvetica Neue", Arial, sans-serif';
  for (let cm = 0; cm <= TAPE_M * 100; cm++) {
    // 0 cm at the start of the tape (canvas bottom = texture v 0).
    const y = H - cm * pxPerCm;
    const len = cm % 10 === 0 ? 22 : cm % 5 === 0 ? 15 : 8;
    ctx.fillRect(0, y - 0.8, len, 1.6);
    ctx.fillRect(W - len, y - 0.8, len, 1.6);
    if (cm % 10 === 0 && cm > 0 && cm < TAPE_M * 100) ctx.fillText(String(cm), W / 2, y + 1);
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapT = RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function chalkTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 16;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(214,226,242,0.95)';
  for (let x = 4; x < 252; x += 22) {
    ctx.beginPath();
    ctx.roundRect(x, 4, 14, 8, 4);
    ctx.fill();
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export class TailorTools {
  /** Add to the dress form (form-local coordinates). */
  readonly root = new Group();
  private tape: Mesh;
  private tapeTex: CanvasTexture;
  private ring: Mesh;
  private chalk: Mesh;
  private card?: Mesh;
  private cardText = '';
  private a = new Vector3();
  private b = new Vector3();
  private dir = new Vector3();
  private up = new Vector3(0, 1, 0);
  private q = new Quaternion();

  constructor() {
    this.root.name = 'tailor-tools';
    this.tapeTex = tapeTexture();
    const tapeGeo = new PlaneGeometry(TAPE_W, 1);
    tapeGeo.translate(0, 0.5, 0);
    this.tape = new Mesh(
      tapeGeo,
      new MeshStandardMaterial({ map: this.tapeTex, roughness: 0.55, metalness: 0, side: DoubleSide }),
    );
    this.tape.name = 'tape-measure';
    const ringGeo = new TorusGeometry(1, 0.05, 6, 64);
    ringGeo.rotateX(Math.PI / 2);
    this.ring = new Mesh(ringGeo, new MeshStandardMaterial({ color: '#e9c34a', roughness: 0.55 }));
    this.ring.name = 'tape-round';
    this.chalk = new Mesh(
      new PlaneGeometry(0.26, 0.008),
      new MeshBasicMaterial({ map: chalkTexture(), color: '#8fb0de', transparent: true, depthWrite: false }),
    );
    this.chalk.name = 'chalk-mark';
    for (const m of [this.tape, this.ring, this.chalk]) {
      m.raycast = () => {};
      m.visible = false;
      this.root.add(m);
    }
    this.root.visible = false;
  }

  /** Show the tools for the pin being pulled (`pin` in form-local metres). */
  show(param: TailorParam, piece: GarmentPiece, pin: Vector3, bodyW: number, bodyH: number): void {
    this.root.visible = true;
    this.tape.visible = false;
    this.ring.visible = false;
    this.chalk.visible = false;
    switch (param) {
      case 'hem':
        this.a.set(pin.x + 0.075, 0.025, pin.z - 0.01);
        this.b.set(pin.x + 0.075, pin.y - 0.01, pin.z - 0.01);
        this.lay();
        this.mark(pin.x, pin.y - 0.01, pin.z - 0.03, bodyW);
        break;
      case 'neck':
        this.a.set(0.045, COLLAR_Y * bodyH, pin.z - 0.012);
        this.b.set(0.045, pin.y + 0.01, pin.z - 0.012);
        this.lay();
        this.mark(0, pin.y + 0.01, pin.z - 0.035, bodyW * 0.62);
        break;
      case 'sleeve': {
        const j = shoulderJoint(1);
        this.a.set(j[0] * bodyW + 0.03, j[1] * bodyH, j[2] * bodyW + 0.06);
        this.b.set(pin.x, pin.y, pin.z + 0.01);
        this.lay();
        break;
      }
      case 'fit': {
        const rx = Math.max(0.05, Math.abs(pin.x) - 0.07 * bodyW) + 0.004;
        this.ring.position.set(0, BODY.waistY * bodyH, 0);
        this.ring.scale.set(rx, 0.12, rx * 0.74);
        this.ring.visible = true;
        break;
      }
    }
    this.readout(measureText(piece, param, bodyW, bodyH), param, pin);
  }

  hide(): void {
    this.root.visible = false;
  }

  /** The measured value for checks (cm). */
  static cm(piece: GarmentPiece, param: TailorParam, bodyW = 1, bodyH = 1): number {
    return measureCm(piece, param, bodyW, bodyH);
  }

  private lay(): void {
    this.dir.subVectors(this.b, this.a);
    const len = this.dir.length();
    if (len < 0.01) return;
    this.dir.divideScalar(len);
    this.q.setFromUnitVectors(this.up, this.dir);
    this.tape.position.copy(this.a);
    this.tape.quaternion.copy(this.q);
    this.tape.scale.set(1, len, 1);
    this.tapeTex.repeat.set(1, len / TAPE_M);
    this.tape.visible = true;
  }

  private mark(x: number, y: number, z: number, width: number): void {
    this.chalk.position.set(x, y, z);
    this.chalk.scale.set(width, 1, 1);
    this.chalk.visible = true;
  }

  private readout(text: string, param: TailorParam, pin: Vector3): void {
    if (text !== this.cardText) {
      if (this.card) {
        this.card.removeFromParent();
        const mat = this.card.material as MeshBasicMaterial;
        mat.map?.dispose();
        mat.dispose();
        this.card.geometry.dispose();
      }
      this.card = makeLabel(text, { width: 0.32, fontSize: 40, weight: 500, color: INK, background: PAPER, shape: 'card', font: SERIF });
      this.card.raycast = () => {};
      this.card.renderOrder = 21;
      this.root.add(this.card);
      this.cardText = text;
    }
    const card = this.card!;
    if (param === 'fit') card.position.set(pin.x - 0.12, pin.y + 0.09, pin.z + 0.02);
    else card.position.set(pin.x + 0.24, pin.y + 0.07, pin.z + 0.02);
  }
}
