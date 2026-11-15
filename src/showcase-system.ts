/**
 * ShowcaseSystem – a guided, captioned tour of the whole journey on the flat
 * page (desktop or Quest browser before entering), with gentle camera moves.
 * It tells one story: a real morning (rain later, an interview at ten), the
 * room becoming a studio, getting dressed for the day, tailoring by marking
 * your own body, laying out tomorrow, wearing what you own, shopping against
 * your closet, sitting down, and access. About 95 seconds.
 *
 * For judges without a headset, and for recording the demo video:
 *   - "Watch the tour" on the start page, or open the page with ?showcase;
 *   - ?showcase=record starts automatically without the exit button and sets
 *     `window.showcaseDone` when the end card has shown.
 *   - ?showcase=mr (or mr-record) is the mixed-reality cut for the video: in
 *     the IWSDK emulator it enters XR in the simulated room, plays the opening
 *     reveal, then moves the emulated headset through the studio like a head.
 *     It needs the emulator (window.IWER_DEVICE); elsewhere it plays flat.
 *
 * It drives the real systems (rail, tailoring, fabrics, stylist, boutique,
 * accessibility panel): nothing in the tour is pre-rendered.
 */
import { createSystem, Matrix4, Quaternion, Vector3, VisibilityState } from '@iwsdk/core';
import { AtelierSystem } from './atelier-system.js';
import { ClosetSystem } from './closet-system.js';
import { StylistSystem } from './stylist-system.js';
import { BoutiqueSystem } from './boutique-system.js';
import { AccessSystem } from './access-system.js';
import { OnboardingSystem } from './onboarding-system.js';
import { RoomPlacementSystem } from './room-system.js';
import { MorningSystem } from './morning-system.js';
import { MarkSystem } from './mark-system.js';
import { access } from './atelier/access.js';
import { LOOKS } from './atelier/looks.js';
import { LINE_LENGTH, LINE_START, LINE_TEXT, WORD_AT } from './atelier/tour-timing.js';

interface Shot {
  pos: [number, number, number];
  target: [number, number, number];
}

type ShotKey = keyof typeof SHOTS;

/** Kinds of sound the video's soundtrack places where the tour acts. */
type Sfx = 'reveal' | 'sparkle' | 'swish' | 'settle' | 'pin';

interface Step {
  at: number;
  title?: string;
  sub?: string;
  shot?: ShotKey;
  act?: () => void;
  sfx?: Sfx;
}

/** Seconds into the tour: `f` of the way through narration line `i`. */
const line = (i: number, f = 0) => LINE_START[i] + f * LINE_LENGTH[i];
/**
 * When word `w` of line `i` is spoken (from the recording, see
 * scripts/tour-timing.py), a moment early so the change lands on the word;
 * `f` of the way through the line when the word is not known.
 */
const word = (i: number, w: string, f: number) =>
  LINE_START[i] + (WORD_AT[`${i}:${w}`] ?? f * LINE_LENGTH[i]) - 0.15;
/** The camera arrives as a line starts. */
const scene = (i: number) => Math.max(0, LINE_START[i] - 0.8);
/** The caption (what is said, word for word) as the voice starts. */
const said = (i: number, title: string) => ({ at: Math.max(0, LINE_START[i] - 0.3), title, sub: LINE_TEXT[i] });

const MOVE = 1.6;
/** Page-camera shots for the flat tour (authored layout: form at 0,0,-1.55). */
const SHOTS = {
  intro: { pos: [0, 1.55, 1.1], target: [0, 1.1, -1.5] },
  wide: { pos: [0, 1.5, 0.75], target: [0, 1.0, -1.45] },
  rack: { pos: [-0.25, 1.38, -0.15], target: [-1.05, 1.15, -1.35] },
  form: { pos: [0.18, 1.28, -0.42], target: [0, 0.95, -1.55] },
  hem: { pos: [0.1, 0.95, -0.55], target: [0, 0.62, -1.55] },
  board: { pos: [0.3, 1.35, -0.3], target: [1.05, 1.15, -1.3] },
  stylist: { pos: [-0.05, 1.32, 0.05], target: [-0.3, 0.92, -1.2] },
  boutique: { pos: [-0.2, 1.35, 0.1], target: [-0.75, 0.98, -1.2] },
  seated: { pos: [0, 1.5, 0.75], target: [0, 1.0, -1.45] },
  access: { pos: [0.2, 1.18, -0.12], target: [0.52, 0.8, -0.8] },
  end: { pos: [0, 1.6, 1.0], target: [0, 1.0, -1.5] },
} satisfies Record<string, Shot>;
/** The tour ends just after the last line. */
const TOTAL = line(LINE_START.length - 1, 1) + 1.2;

/**
 * Head poses for the mixed-reality cut, in the studio's own frame. Standing
 * eye height, as a person would; seated is in the seated layout's frame
 * (origin under your chair).
 */
const MR_SHOTS: Record<ShotKey, Shot> = {
  intro: { pos: [0, 1.6, 0.2], target: [0, 1.25, -2.5] },
  wide: { pos: [0, 1.6, 0.3], target: [0, 1.05, -1.5] },
  rack: { pos: [-0.3, 1.55, -0.2], target: [-1.05, 1.2, -1.35] },
  hem: { pos: [0.15, 1.35, -0.62], target: [0, 0.72, -1.55] },
  form: { pos: [0.2, 1.5, -0.45], target: [0, 1.05, -1.55] },
  board: { pos: [0.35, 1.55, -0.35], target: [1.05, 1.2, -1.3] },
  stylist: { pos: [-0.1, 1.5, 0.05], target: [-0.35, 0.95, -1.15] },
  boutique: { pos: [-0.25, 1.52, 0.05], target: [-0.75, 1.0, -1.2] },
  seated: { pos: [0, 1.17, 0.05], target: [0, 0.85, -0.95] },
  access: { pos: [0.25, 1.4, -0.12], target: [0.52, 0.85, -0.8] },
  end: { pos: [0.1, 1.62, 0.45], target: [0, 1.05, -1.5] },
};

/** The emulated headset (IWER), present only under the IWSDK dev server. */
interface EmulatedDevice {
  position: { set(x: number, y: number, z: number): void; x: number; y: number; z: number };
  quaternion: { set(x: number, y: number, z: number, w: number): void; x: number; y: number; z: number; w: number };
  controllers?: Record<string, { position?: { set(x: number, y: number, z: number): void } } | undefined>;
}

function emulatedDevice(): EmulatedDevice | undefined {
  return (globalThis as unknown as { IWER_DEVICE?: EmulatedDevice }).IWER_DEVICE;
}

export class ShowcaseSystem extends createSystem({}) {
  /** Whether the tour is playing. */
  playing = false;
  /** Seconds into the tour. */
  t = 0;
  /** Recording: the tour runs on the real clock, so slow frames cannot drift it. */
  private t0 = 0;
  private steps: Step[] = [];
  private next = 0;
  private record = false;
  private overlay?: HTMLDivElement;
  private caption?: HTMLDivElement;
  private endCard?: HTMLDivElement;
  private savedPos = new Vector3();
  private savedQuat = new Quaternion();
  private fromPos = new Vector3();
  private fromTarget = new Vector3();
  private toPos = new Vector3();
  private toTarget = new Vector3();
  private curTarget = new Vector3(0, 1, -1.5);
  private moveT = MOVE;
  private hemFrom = 0;
  private hemT = -1;
  /** 'flat' moves the page camera; 'mr' moves the emulated headset in XR. */
  mode: 'flat' | 'mr' = 'flat';
  private pendingMR = false;
  /** The studio frame the head pose was last expressed in (mixed-reality cut). */
  private lastFrame = { x: 0, y: 0, z: 0, yaw: 0 };
  private seatedByTour = false;
  /** Recording: wait in the empty room until go(), so capture starts first. */
  private waitForGo = false;
  /** In XR and waiting for go(). */
  ready = false;
  /** When each sound-bearing action ran (tour seconds), for the soundtrack. */
  cues: { t: number; kind: Sfx }[] = [];
  private m4 = new Matrix4();
  private q = new Quaternion();
  private eye = new Vector3();
  /** Current head position in the studio frame (mixed-reality cut). */
  private headLocal = new Vector3();
  private look = new Vector3();
  private up = new Vector3(0, 1, 0);

  init(): void {
    this.buildOverlay();
    const params = new URLSearchParams(location.search);
    if (params.has('showcase')) {
      const v = params.get('showcase') ?? '';
      this.record = v.endsWith('record');
      const mode = v.startsWith('mr') ? 'mr' : 'flat';
      setTimeout(() => this.start(mode), this.record ? 2500 : 1200);
    }
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        const inXR = state !== VisibilityState.NonImmersive;
        if (this.playing && inXR !== (this.mode === 'mr')) this.stop();
      }),
      () => this.overlay?.remove(),
    );
  }

  private get atelier() {
    return this.world.getSystem(AtelierSystem)!;
  }

  start(mode: 'flat' | 'mr' = 'flat', opts: { waitForGo?: boolean } = {}): void {
    if (this.playing || this.pendingMR) return;
    this.waitForGo = !!opts.waitForGo;
    this.ready = false;
    const inXR = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    if (mode === 'mr' && (!emulatedDevice() || !this.world.xrEnabled)) mode = 'flat';
    if (mode === 'flat' && inXR) return;
    this.mode = mode;
    if (mode === 'mr') {
      // Dress the form first, so the reveal shows a look; then enter XR and
      // begin once the studio has been placed in the room.
      if (this.atelier.currentPieces.length === 0) this.atelier.wearLook(0);
      const room = this.world.getSystem(RoomPlacementSystem);
      if (room && !room.isPlaced) room.hold = true;
      this.pendingMR = true;
      this.setTourHeld(true);
      if (!inXR) this.world.launchXR();
      return;
    }
    const cam = this.world.camera;
    this.savedPos.copy(cam.position);
    this.savedQuat.copy(cam.quaternion);
    this.begin();
    this.jump('intro');
  }

  /** Recording: start the tour that start(mode, { waitForGo: true }) readied. */
  go(): boolean {
    if (!this.pendingMR || !this.ready) return false;
    this.waitForGo = false;
    this.pendingMR = false;
    this.ready = false;
    this.begin();
    return true;
  }

  private begin(): void {
    this.cues = [];
    this.t0 = performance.now();
    this.curTarget.set(0, 1, -1.5);
    this.steps = this.script();
    this.next = 0;
    this.t = 0;
    this.playing = true;
    this.setTourHeld(true);
    (globalThis as unknown as { showcaseDone?: boolean }).showcaseDone = false;
    document.body.classList.add('atelier-showcase');
    if (this.overlay) this.overlay.style.display = 'block';
    this.overlay?.querySelector<HTMLElement>('[data-exit]')?.style.setProperty('display', this.record ? 'none' : 'block');
    this.setCaption('', '');
    this.endCard!.style.opacity = '0';
    if (this.mode === 'mr') {
      // Start from wherever the headset is, expressed in the studio's frame.
      const d = emulatedDevice()!;
      this.toLocal(this.eye.set(d.position.x, d.position.y, d.position.z), this.toPos);
      this.headLocal.copy(this.toPos);
      this.toTarget.set(this.toPos.x, 1.05, this.toPos.z - 1.5);
      this.curTarget.copy(this.toTarget);
      this.moveT = MOVE;
      Object.assign(this.lastFrame, this.world.getSystem(RoomPlacementSystem)!.studioFrame);
    }
  }

  stop(): void {
    if (!this.playing) return;
    this.playing = false;
    this.hemT = -1;
    this.setTourHeld(false);
    const room = this.world.getSystem(RoomPlacementSystem);
    if (room) room.hold = false;
    if (this.seatedByTour) {
      this.seatedByTour = false;
      access.set('seated', false);
    }
    this.world.getSystem(MorningSystem)?.endSample();
    if (this.mode === 'flat') {
      const cam = this.world.camera;
      cam.position.copy(this.savedPos);
      cam.quaternion.copy(this.savedQuat);
    }
    document.body.classList.remove('atelier-showcase');
    if (this.overlay) this.overlay.style.display = 'none';
    (globalThis as unknown as { showcaseDone?: boolean }).showcaseDone = true;
  }

  private setTourHeld(held: boolean): void {
    const tour = this.world.getSystem(OnboardingSystem);
    if (tour) tour.held = held;
  }

  /** The tour. Times are seconds from the start; the narration follows them. */
  private script(): Step[] {
    const a = () => this.atelier;
    const closet = () => this.world.getSystem(ClosetSystem)!;
    const stylist = () => this.world.getSystem(StylistSystem)!;
    const boutique = () => this.world.getSystem(BoutiqueSystem)!;
    const accessSys = () => this.world.getSystem(AccessSystem)!;
    const morning = () => this.world.getSystem(MorningSystem)!;
    const room = () => this.world.getSystem(RoomPlacementSystem)!;
    const mr = this.mode === 'mr';
    const dress = Math.max(0, LOOKS.findIndex((l) => l.id === 'velvet-hour'));
    // Scenes follow the narration (src/atelier/tour-timing.ts): the camera
    // arrives as a line starts, the caption shows what is said, and each
    // action lands on its word (the hem moves on "knee").
    return [
      {
        at: 0,
        shot: 'intro',
        act: () => {
          accessSys().togglePanel(false);
          closet().backToBrowse();
        },
      },
      said(0, '7:40 am'),
      {
        at: scene(1),
        shot: 'wide',
        sfx: 'reveal',
        act: () => {
          if (mr) room().hold = false;
        },
      },
      said(1, 'Your room becomes a studio'),
      {
        at: scene(2),
        shot: 'stylist',
        act: () => {
          morning().useSample();
          closet().backToBrowse();
        },
      },
      said(2, 'Dressed for your real day'),
      { at: word(2, 'dresses', 0.62), sfx: 'sparkle', act: () => morning().dressToday() },
      said(3, 'Refine in plain words'),
      { at: word(3, 'dressier', 0.66), sfx: 'sparkle', act: () => void stylist().refine('dressier') },
      {
        at: scene(4),
        shot: 'rack',
        act: () => {
          stylist().keep();
          closet().setMode(false);
        },
      },
      said(4, 'Tap a look'),
      { at: word(4, 'dress', 0.6), sfx: 'swish', act: () => a().wearLook(dress) },
      { at: scene(5), shot: 'hem' },
      said(5, 'Mark it on yourself'),
      { at: word(5, 'knee', 0.72), sfx: 'sparkle', act: () => this.world.getSystem(MarkSystem)?.demo('hem', 52) },
      said(6, 'Or pull a pin'),
      { at: word(6, 'pull', 0.12), sfx: 'pin', act: () => this.startHem() },
      { at: scene(7), shot: 'board' },
      said(7, 'Drop a fabric'),
      { at: line(7, 0.38), shot: 'form' },
      { at: word(7, 'satin', 0.78), sfx: 'settle', act: () => a().applyFabric('navy-satin') },
      { at: word(7, 'silk', 0.98), sfx: 'settle', act: () => a().applyFabric('ivory-silk') },
      { at: scene(8), shot: 'stylist' },
      said(8, 'Lay out tomorrow'),
      { at: word(8, 'lay', 0.35), sfx: 'swish', act: () => morning().layOutTomorrow() },
      said(9, 'Wear what you own'),
      {
        at: word(9, 'builds', 0.78),
        sfx: 'sparkle',
        act: () => {
          const item = closet().leastWornItem();
          if (item) stylist().styleAround(item.id);
        },
      },
      {
        at: scene(10),
        shot: 'boutique',
        act: () => {
          stylist().keep();
          closet().openBoutique();
          boutique().open(1);
        },
      },
      said(10, 'Shop against your closet'),
      { at: word(10, 'counts', 0.5), sfx: 'swish', act: () => boutique().tryOn(1) },
      { at: scene(11), act: () => boutique().close(true) },
      said(11, 'Sit down, it comes to you'),
      {
        at: word(11, 'sit', 0.3),
        sfx: mr ? 'settle' : undefined,
        act: () => {
          if (mr && !access.settings.seated) {
            this.seatedByTour = true;
            access.set('seated', true);
          }
        },
      },
      { at: word(11, 'sit', 0.3) + 0.15, shot: 'seated' },
      {
        at: scene(12),
        sfx: mr ? 'settle' : undefined,
        act: () => {
          if (this.seatedByTour) {
            this.seatedByTour = false;
            access.set('seated', false);
          }
          accessSys().togglePanel(true);
        },
      },
      { at: scene(12) + 0.3, shot: 'access' },
      said(12, 'Accessible by design'),
      {
        at: scene(13),
        shot: 'end',
        act: () => accessSys().togglePanel(false),
      },
      said(13, 'Get dressed for your real day'),
      { at: word(13, 'get', 0.2), sfx: 'settle', act: () => a().turnForm(1) },
      // "Open it in your Quest browser today": the end card with the address.
      { at: word(13, 'open', 0.45), sfx: 'sparkle', act: () => this.showEnd() },
    ];
  }

  private startHem(): void {
    const piece = this.atelier.currentPieces[0];
    if (!piece) return;
    this.atelier.checkpoint();
    this.hemFrom = piece.hem;
    this.hemT = 0;
  }

  update(delta: number): void {
    if (this.pendingMR) {
      const room = this.world.getSystem(RoomPlacementSystem);
      const inXR = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
      if (inXR && (room?.hold || room?.isPlaced)) {
        if (this.waitForGo) {
          this.ready = true;
          return;
        }
        this.pendingMR = false;
        this.begin();
      }
      return;
    }
    if (!this.playing) return;
    if (this.mode === 'mr') this.t = (performance.now() - this.t0) / 1000;
    else this.t += Math.min(delta, 0.1);
    while (this.next < this.steps.length && this.steps[this.next].at <= this.t) {
      const s = this.steps[this.next++];
      if (s.shot) this.moveTo(s.shot);
      if (s.title !== undefined) this.setCaption(s.title, s.sub ?? '');
      if (s.sfx) this.cues.push({ t: Math.round(this.t * 1000) / 1000, kind: s.sfx });
      try {
        s.act?.();
      } catch (err) {
        console.warn('[showcase] step failed', err);
      }
    }
    // Hem: pulled up over ~2.4 s, rebuilt about 15 times a second.
    if (this.hemT >= 0) {
      const piece = this.atelier.currentPieces[0];
      const before = this.hemT;
      this.hemT += delta;
      if (piece && Math.floor(before * 15) !== Math.floor(this.hemT * 15)) {
        const k = Math.min(1, this.hemT / 2.4);
        const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        piece.hem = this.hemFrom + 0.24 * ease;
        this.atelier.refreshPiece(0);
        this.atelier.showTape('hem', 1.5);
      }
      if (this.hemT >= 2.4) this.hemT = -1;
    }
    if (this.mode === 'mr') {
      this.rebase();
      this.updateHead(delta);
      if (this.t > TOTAL) this.stop();
      return;
    }
    // Camera: eased move to the shot, then a slow drift.
    const cam = this.world.camera;
    if (this.moveT < MOVE) {
      this.moveT = Math.min(MOVE, this.moveT + delta);
      const k = this.moveT / MOVE;
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      cam.position.lerpVectors(this.fromPos, this.toPos, e);
      this.curTarget.lerpVectors(this.fromTarget, this.toTarget, e);
    } else {
      cam.position.x += Math.sin(this.t * 0.35) * 0.0009;
      cam.position.z -= 0.0006;
    }
    cam.lookAt(this.curTarget);
    if (this.t > TOTAL) this.stop();
  }

  /** Mixed-reality cut: ease the emulated headset between head poses. */
  private updateHead(delta: number): void {
    const d = emulatedDevice();
    if (!d) return;
    if (this.moveT < MOVE) {
      this.moveT = Math.min(MOVE, this.moveT + delta);
      const k = this.moveT / MOVE;
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      this.headLocal.lerpVectors(this.fromPos, this.toPos, e);
      this.curTarget.lerpVectors(this.fromTarget, this.toTarget, e);
    } else {
      this.headLocal.copy(this.toPos);
    }
    // A person's head is never perfectly still.
    this.eye.copy(this.headLocal);
    this.eye.x += Math.sin(this.t * 0.9) * 0.006;
    this.eye.y += Math.sin(this.t * 1.7) * 0.004;
    this.toWorld(this.eye, this.eye);
    this.toWorld(this.curTarget, this.look);
    d.position.set(this.eye.x, this.eye.y, this.eye.z);
    this.m4.lookAt(this.eye, this.look, this.up);
    this.q.setFromRotationMatrix(this.m4);
    d.quaternion.set(this.q.x, this.q.y, this.q.z, this.q.w);
    // Keep the emulated controllers out of the shot (below and behind the head).
    d.controllers?.left?.position?.set(this.eye.x - 0.25, this.eye.y - 0.8, this.eye.z + 0.25);
    d.controllers?.right?.position?.set(this.eye.x + 0.25, this.eye.y - 0.8, this.eye.z + 0.25);
  }

  /**
   * The studio was (re)placed: keep the head where it is in the room by
   * re-expressing the head and look poses in the new studio frame.
   */
  private rebase(): void {
    const f = this.world.getSystem(RoomPlacementSystem)!.studioFrame;
    const o = this.lastFrame;
    if (f.x === o.x && f.y === o.y && f.z === o.z && f.yaw === o.yaw) return;
    const c = Math.cos(o.yaw);
    const sn = Math.sin(o.yaw);
    for (const v of [this.headLocal, this.curTarget, this.fromPos, this.toPos, this.fromTarget, this.toTarget]) {
      // Old frame -> room -> new frame.
      const x = v.x * c + v.z * sn + o.x;
      const z = -v.x * sn + v.z * c + o.z;
      this.toLocal(this.eye.set(x, v.y + o.y, z), v);
    }
    Object.assign(o, f);
  }

  /** Studio frame -> room (world) coordinates. */
  private toWorld(local: Vector3, out: Vector3): Vector3 {
    const f = this.world.getSystem(RoomPlacementSystem)!.studioFrame;
    const c = Math.cos(f.yaw);
    const s = Math.sin(f.yaw);
    const x = local.x;
    const z = local.z;
    return out.set(x * c + z * s + f.x, local.y + f.y, -x * s + z * c + f.z);
  }

  /** Room (world) -> studio frame coordinates. */
  private toLocal(world: Vector3, out: Vector3): Vector3 {
    const f = this.world.getSystem(RoomPlacementSystem)!.studioFrame;
    const c = Math.cos(f.yaw);
    const s = Math.sin(f.yaw);
    const dx = world.x - f.x;
    const dz = world.z - f.z;
    return out.set(c * dx - s * dz, world.y - f.y, s * dx + c * dz);
  }

  private moveTo(key: ShotKey): void {
    const shot: Shot = this.mode === 'mr' ? MR_SHOTS[key] : SHOTS[key];
    if (this.mode === 'mr') {
      this.fromPos.copy(this.headLocal);
      this.fromTarget.copy(this.curTarget);
      this.toPos.set(...shot.pos);
      this.toTarget.set(...shot.target);
      this.moveT = 0;
      return;
    }
    this.fromPos.copy(this.world.camera.position);
    this.fromTarget.copy(this.curTarget);
    this.toPos.set(...shot.pos);
    this.toTarget.set(...shot.target);
    this.moveT = 0;
  }

  private jump(key: ShotKey): void {
    const shot: Shot = SHOTS[key];
    this.world.camera.position.set(...shot.pos);
    this.curTarget.set(...shot.target);
    this.toPos.set(...shot.pos);
    this.toTarget.set(...shot.target);
    this.moveT = MOVE;
    this.world.camera.lookAt(this.curTarget);
  }

  // ---------------------------------------------------------------- overlay

  private setCaption(title: string, sub: string): void {
    const c = this.caption;
    if (!c) return;
    c.style.opacity = '0';
    setTimeout(() => {
      c.querySelector('[data-title]')!.textContent = title;
      c.querySelector('[data-sub]')!.textContent = sub;
      c.style.opacity = title ? '1' : '0';
    }, title ? 260 : 0);
  }

  private showEnd(): void {
    this.setCaption('', '');
    if (this.endCard) this.endCard.style.opacity = '1';
  }

  private buildOverlay(): void {
    const style = document.createElement('style');
    style.textContent = `
      body.atelier-showcase #make-it-you, body.atelier-showcase #studio-options { display: none !important; }
      .atelier-sc { position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; display: none;
        font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; }
      .atelier-sc [data-cap] { position: absolute; left: 50%; bottom: 7%; transform: translateX(-50%);
        width: min(860px, 88vw); text-align: center; transition: opacity 0.35s ease; opacity: 0;
        background: linear-gradient(180deg, rgba(28,24,20,0.0), rgba(28,24,20,0.72) 30%);
        padding: 28px 28px 22px; border-radius: 18px; }
      .atelier-sc [data-title] { font-family: Didot, "Bodoni 72", Georgia, "Times New Roman", serif;
        font-size: clamp(28px, 4.2vw, 54px); color: #f6e7c4; letter-spacing: 1px; }
      .atelier-sc [data-sub] { margin-top: 8px; font-size: clamp(15px, 1.7vw, 22px); color: #f6efe2; line-height: 1.35; }
      .atelier-sc [data-mark] { position: absolute; left: 28px; top: 22px; font-size: 13px; letter-spacing: 6px;
        font-weight: 700; color: #6b5432; }
      .atelier-sc [data-exit] { position: absolute; right: 20px; top: 18px; pointer-events: auto; cursor: pointer;
        border: none; border-radius: 999px; padding: 8px 14px; background: rgba(28,24,20,0.85); color: #f6efe2;
        font-weight: 700; }
      .atelier-sc [data-end] { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center;
        justify-content: center; background: rgba(28,24,20,0.86); opacity: 0; transition: opacity 0.8s ease; color: #f6efe2; }
      .atelier-sc [data-end] .w { font-family: Didot, "Bodoni 72", Georgia, serif; font-size: clamp(48px, 8vw, 104px);
        letter-spacing: 18px; color: #f6e7c4; }
      .atelier-sc [data-end] .u { margin-top: 18px; font-size: clamp(18px, 2.2vw, 28px); color: #e2c27d; font-weight: 700; }
      .atelier-sc [data-end] .s { margin-top: 10px; font-size: clamp(14px, 1.5vw, 19px); color: #d8cfbf; }`;
    document.head.appendChild(style);
    const o = document.createElement('div');
    o.className = 'atelier-sc';
    o.setAttribute('aria-live', 'polite');
    o.innerHTML = `
      <div data-mark>ATELIER</div>
      <button type="button" data-exit>Exit tour &#10005;</button>
      <div data-cap><div data-title></div><div data-sub></div></div>
      <div data-end><div class="w">ATELIER</div><div class="u">atelier-mr.vercel.app</div>
        <div class="s">Built with IWSDK for Meta Quest. Open it in the Quest browser today;<br>on the Meta Horizon Store in February 2027.</div></div>`;
    o.querySelector('[data-exit]')!.addEventListener('click', () => this.stop());
    document.body.appendChild(o);
    this.overlay = o;
    this.caption = o.querySelector<HTMLDivElement>('[data-cap]')!;
    this.endCard = o.querySelector<HTMLDivElement>('[data-end]')!;
  }
}
