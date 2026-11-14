/**
 * ShowcaseSystem – a guided, captioned tour of the whole journey on the flat
 * page (desktop or Quest browser before entering), with gentle camera moves.
 *
 * For judges without a headset, and for recording the demo video:
 *   - "Watch the tour" on the start page, or open the page with ?showcase;
 *   - ?showcase=record starts automatically without the exit button and sets
 *     `window.showcaseDone` when the end card has shown.
 *
 * It drives the real systems (rail, tailoring, fabrics, stylist, boutique,
 * accessibility panel): nothing in the tour is pre-rendered.
 */
import { createSystem, Quaternion, Vector3, VisibilityState } from '@iwsdk/core';
import { AtelierSystem } from './atelier-system.js';
import { ClosetSystem } from './closet-system.js';
import { StylistSystem } from './stylist-system.js';
import { BoutiqueSystem } from './boutique-system.js';
import { AccessSystem } from './access-system.js';
import { OnboardingSystem } from './onboarding-system.js';

interface Shot {
  pos: [number, number, number];
  target: [number, number, number];
}

interface Step {
  at: number;
  title?: string;
  sub?: string;
  shot?: Shot;
  act?: () => void;
}

const MOVE = 1.6;
const SHOTS: Record<string, Shot> = {
  wide: { pos: [0, 1.5, 0.75], target: [0, 1.0, -1.45] },
  rack: { pos: [-0.25, 1.38, -0.15], target: [-1.05, 1.15, -1.35] },
  form: { pos: [0.18, 1.28, -0.42], target: [0, 0.95, -1.55] },
  hem: { pos: [0.1, 0.95, -0.55], target: [0, 0.62, -1.55] },
  board: { pos: [0.3, 1.35, -0.3], target: [1.05, 1.15, -1.3] },
  stylist: { pos: [-0.05, 1.32, 0.05], target: [-0.3, 0.92, -1.2] },
  boutique: { pos: [-0.2, 1.35, 0.1], target: [-0.75, 0.98, -1.2] },
  access: { pos: [0.2, 1.18, -0.12], target: [0.52, 0.8, -0.8] },
  end: { pos: [0, 1.6, 1.0], target: [0, 1.0, -1.5] },
};
const TOTAL = 49;

export class ShowcaseSystem extends createSystem({}) {
  /** Whether the tour is playing. */
  playing = false;
  /** Seconds into the tour. */
  t = 0;
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

  init(): void {
    this.buildOverlay();
    const params = new URLSearchParams(location.search);
    if (params.has('showcase')) {
      this.record = params.get('showcase') === 'record';
      setTimeout(() => this.start(), this.record ? 2500 : 1200);
    }
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        if (state !== VisibilityState.NonImmersive && this.playing) this.stop();
      }),
      () => this.overlay?.remove(),
    );
  }

  private get atelier() {
    return this.world.getSystem(AtelierSystem)!;
  }

  start(): void {
    if (this.playing || this.world.visibilityState.peek() !== VisibilityState.NonImmersive) return;
    const cam = this.world.camera;
    this.savedPos.copy(cam.position);
    this.savedQuat.copy(cam.quaternion);
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
    this.jump(SHOTS.wide);
  }

  stop(): void {
    if (!this.playing) return;
    this.playing = false;
    this.hemT = -1;
    this.setTourHeld(false);
    const cam = this.world.camera;
    cam.position.copy(this.savedPos);
    cam.quaternion.copy(this.savedQuat);
    document.body.classList.remove('atelier-showcase');
    if (this.overlay) this.overlay.style.display = 'none';
    (globalThis as unknown as { showcaseDone?: boolean }).showcaseDone = true;
  }

  private setTourHeld(held: boolean): void {
    const tour = this.world.getSystem(OnboardingSystem);
    if (tour) tour.held = held;
  }

  /** The tour. Times are seconds from the start. */
  private script(): Step[] {
    const a = () => this.atelier;
    const closet = () => this.world.getSystem(ClosetSystem)!;
    const stylist = () => this.world.getSystem(StylistSystem)!;
    const boutique = () => this.world.getSystem(BoutiqueSystem)!;
    const accessSys = () => this.world.getSystem(AccessSystem)!;
    return [
      {
        at: 0,
        shot: SHOTS.wide,
        title: 'Atelier',
        sub: 'A hands-first fashion studio, placed in your room on Meta Quest.',
        act: () => {
          accessSys().togglePanel(false);
          closet().backToBrowse();
          a().wearLook(0);
        },
      },
      { at: 4, shot: SHOTS.rack, title: 'Tap a look', sub: 'The form wears it, life-size.' },
      { at: 5.2, act: () => a().wearLook(1) },
      {
        at: 8.5,
        shot: SHOTS.hem,
        title: 'Tailor with a pinch',
        sub: 'Pull a gold pin: the hem is real geometry, recut as you pull.',
      },
      { at: 9.6, act: () => this.startHem() },
      { at: 13, shot: SHOTS.board, title: 'Drop a fabric', sub: 'Swatches re-skin the garment: satin, velvet, denim, wool.' },
      { at: 14.4, shot: SHOTS.form, act: () => a().applyFabric('bordeaux-velvet') },
      { at: 16.4, act: () => a().applyFabric('navy-satin') },
      {
        at: 18.5,
        shot: SHOTS.stylist,
        title: 'Ask the AI stylist',
        sub: 'It plans from your closet and dresses the form. Keep it, see the next idea, or undo.',
        act: () => {
          stylist().open();
          stylist().choose({ occasion: 'date', weather: 'mild', mood: 'bold' });
          void stylist().styleMe();
        },
      },
      {
        at: 24,
        title: 'Refine in plain words',
        sub: 'Warmer. Dressier. More colour. Every change lands on the form.',
      },
      { at: 24.8, act: () => void stylist().refine('dressier') },
      {
        at: 29,
        shot: SHOTS.boutique,
        title: 'Shop against your closet',
        sub: 'New outfits it unlocks, cost per outfit, and an honest buy-or-skip verdict.',
        act: () => {
          stylist().keep();
          closet().openBoutique();
          boutique().open(1);
        },
      },
      { at: 31.2, act: () => boutique().tryOn(1) },
      {
        at: 35.5,
        shot: SHOTS.access,
        title: 'Accessible by design',
        sub: 'Large text, high contrast, calm motion, read aloud, voice, and tailoring by tap.',
        act: () => {
          boutique().close(true);
          accessSys().togglePanel(true);
        },
      },
      {
        at: 40.5,
        shot: SHOTS.end,
        title: 'Share it. Come back tomorrow.',
        sub: 'Looks travel by link. Your studio stays anchored in your room.',
        act: () => {
          accessSys().togglePanel(false);
          a().turnForm(1);
        },
      },
      { at: 42.5, act: () => a().turnForm(1) },
      { at: 44.5, act: () => this.showEnd() },
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
    if (!this.playing) return;
    this.t += Math.min(delta, 0.1);
    while (this.next < this.steps.length && this.steps[this.next].at <= this.t) {
      const s = this.steps[this.next++];
      if (s.shot) this.moveTo(s.shot);
      if (s.title !== undefined) this.setCaption(s.title, s.sub ?? '');
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
      }
      if (this.hemT >= 2.4) this.hemT = -1;
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

  private moveTo(shot: Shot): void {
    this.fromPos.copy(this.world.camera.position);
    this.fromTarget.copy(this.curTarget);
    this.toPos.set(...shot.pos);
    this.toTarget.set(...shot.target);
    this.moveT = 0;
  }

  private jump(shot: Shot): void {
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
      .atelier-sc { position: fixed; inset: 0; z-index: 20; pointer-events: none; display: none;
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
        <div class="s">Built with IWSDK for Meta Quest. Open it in the Quest browser.</div></div>`;
    o.querySelector('[data-exit]')!.addEventListener('click', () => this.stop());
    document.body.appendChild(o);
    this.overlay = o;
    this.caption = o.querySelector<HTMLDivElement>('[data-cap]')!;
    this.endCard = o.querySelector<HTMLDivElement>('[data-end]')!;
  }
}
