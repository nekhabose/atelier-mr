/**
 * OnboardingSystem – a three-step ghost-hand tour.
 *
 * A translucent hand demonstrates each gesture on the real target, looping
 * until the user does it themselves:
 *   1. pinch a look on the rail to wear it
 *   2. pinch a tailoring pin and pull
 *   3. carry a fabric swatch onto the form
 * Progress comes from AtelierSystem's action counters, so any way of doing
 * the step counts. The tour can be skipped and is remembered in localStorage;
 * the panel's Tour button replays it.
 */
import {
  createSystem,
  Entity,
  Grabbed,
  Group,
  Mesh,
  MeshBasicMaterial,
  TorusGeometry,
  UIKit,
  Object3D,
  UIKitMLAsset,
  Vector3,
} from '@iwsdk/core';
import { AtelierSystem } from './atelier-system.js';
import { RoomPlacementSystem } from './room-system.js';
import { DressForm, FabricSwatch, RackLook, TailorPin } from './atelier-components.js';
import { createGhostHand, GhostHand } from './atelier/ghost-hand.js';
import { makeLabel } from './atelier/labels.js';

const STORAGE_KEY = 'atelier.tour.v1';
const DEMO_LOOK = 1; // Riviera Sundress
const DEMO_SWATCH = 1;
const LOOP = 3.8;

type StepKey = 'wear' | 'tailor' | 'fabric' | 'style';
const STEPS: { key: StepKey; chip: string; hint: string }[] = [
  {
    key: 'wear',
    chip: 'STEP 1 OF 4  ·  PINCH A LOOK',
    hint: 'Step 1 of 4: pinch any outfit on the brass rail to dress the form.',
  },
  {
    key: 'tailor',
    chip: 'STEP 2 OF 4  ·  PULL A PIN',
    hint: 'Step 2 of 4: pinch a coloured pin and pull it to tailor the cut.',
  },
  {
    key: 'fabric',
    chip: 'STEP 3 OF 4  ·  DROP A FABRIC',
    hint: 'Step 3 of 4: pinch a fabric swatch and drop it on the outfit.',
  },
  {
    key: 'style',
    chip: 'STEP 4 OF 4  ·  ASK THE STYLIST',
    hint: 'Step 4 of 4: tap Ask stylist, pick a moment, then Style me.',
  },
];

const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const seg = (t: number, a: number, b: number) => ease((t - a) / (b - a));

export class OnboardingSystem extends createSystem({
  looks: { required: [RackLook] },
  pins: { required: [TailorPin] },
  swatches: { required: [FabricSwatch] },
  forms: { required: [DressForm] },
  grabbed: { required: [Grabbed] },
}) {
  /** -1 inactive, 0..2 current step, 3 finished. */
  step = -1;
  private t = 0;
  private hand!: GhostHand;
  private holder!: Group;
  private chips: Mesh[] = [];
  private pulse!: Mesh;
  private pulseMat!: MeshBasicMaterial;
  private atelier?: AtelierSystem;
  private baseline = 0;
  private tourLabel?: UIKit.Text;

  private target = new Vector3();
  private end = new Vector3();
  private start = new Vector3();
  private toUser = new Vector3();
  private cam = new Vector3();
  private pos = new Vector3();
  private look = new Vector3();
  private pp = new Vector3();

  init(): void {
    this.atelier = this.world.getSystem(AtelierSystem);

    this.holder = new Group();
    this.holder.name = 'onboarding';
    this.hand = createGhostHand();
    this.holder.add(this.hand.root);
    for (const s of STEPS) {
      const chip = makeLabel(s.chip, {
        width: 0.5,
        fontSize: 34,
        color: '#2b2118',
        background: 'rgba(226,194,125,0.95)',
        pill: true,
        letterSpacing: 2,
      });
      chip.visible = false;
      chip.raycast = () => {};
      this.chips.push(chip);
      this.holder.add(chip);
    }
    this.pulseMat = new MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.pulse = new Mesh(new TorusGeometry(0.035, 0.003, 8, 40), this.pulseMat);
    this.pulse.raycast = () => {};
    this.pulse.renderOrder = 12;
    this.holder.add(this.pulse);
    this.world.createTransformEntity(this.holder);
    this.hand.setOpacity(0);

    const panel = this.world.getSceneObject<UIKitMLAsset>('atelier-panel');
    const tourButton = panel?.getElementById('tour-button');
    this.tourLabel = panel?.getElementById<UIKit.Text>('tour-label') ?? undefined;
    if (tourButton) {
      const onTour = () => (this.active ? this.finish(true) : this.begin());
      tourButton.addEventListener('click', onTour);
      this.cleanupFuncs.push(() => tourButton.removeEventListener('click', onTour));
    }

    let seen = false;
    try {
      seen = localStorage.getItem(STORAGE_KEY) === 'done';
    } catch {
      /* storage unavailable */
    }
    if (seen) this.setInactive();
    else this.begin();
  }

  get active(): boolean {
    return this.step >= 0 && this.step < STEPS.length;
  }

  /** Start (or replay) the tour from step 1. */
  begin(): void {
    this.goTo(0);
    this.tourLabel?.setProperties({ text: 'Skip tour' });
  }

  /** End the tour; `skipped` only changes the message. */
  finish(skipped = false): void {
    this.step = STEPS.length;
    this.setInactive();
    try {
      localStorage.setItem(STORAGE_KEY, 'done');
    } catch {
      /* ignore */
    }
    this.atelier?.setHint(
      skipped
        ? 'Tour skipped. Tap Tour any time to see the gestures again.'
        : 'Tour complete - the studio is yours. Save looks you love and log today\'s outfit.',
    );
  }

  private setInactive(): void {
    this.hand.setOpacity(0);
    this.pulseMat.opacity = 0;
    for (const c of this.chips) c.visible = false;
    this.tourLabel?.setProperties({ text: 'Tour' });
  }

  private goTo(step: number): void {
    if (step >= STEPS.length) {
      this.finish(false);
      return;
    }
    this.step = step;
    this.t = 0;
    this.baseline = this.counter(STEPS[step].key);
    this.chips.forEach((c, i) => (c.visible = i === step));
    this.atelier?.setHint(STEPS[step].hint);
  }

  private counter(key: StepKey): number {
    const a = this.atelier;
    if (!a) return 0;
    if (key === 'style') return a.styleCount;
    return key === 'wear' ? a.wearCount : key === 'tailor' ? a.tailorCount : a.fabricCount;
  }

  private findLook(): Entity | undefined {
    let first: Entity | undefined;
    for (const e of this.queries.looks.entities) {
      first ??= e;
      if (e.getValue(RackLook, 'lookIndex') === DEMO_LOOK) return e;
    }
    return first;
  }

  private findPin(): Entity | undefined {
    let first: Entity | undefined;
    for (const e of this.queries.pins.entities) {
      if (!e.object3D?.visible) continue;
      first ??= e;
      if (e.getValue(TailorPin, 'param') === 'hem') return e;
    }
    return first;
  }

  private findSwatch(): Entity | undefined {
    let first: Entity | undefined;
    for (const e of this.queries.swatches.entities) {
      first ??= e;
      if (e.getValue(FabricSwatch, 'fabricIndex') === DEMO_SWATCH) return e;
    }
    return first;
  }

  /** Fill this.target / this.end for the current step. Returns false if no target. */
  private resolveTargets(key: StepKey): boolean {
    if (key === 'style') {
      // Point at Ask stylist, or at Style me once the stylist is open.
      const panel = this.world.getSceneObject<UIKitMLAsset>('closet-panel');
      const id = this.atelier?.stylistOpen ? 'style-button' : 'stylist-button';
      const button = panel?.getElementById(id) as unknown as Object3D | undefined;
      if (!button?.getWorldPosition) return false;
      button.getWorldPosition(this.target);
      this.end.copy(this.target);
      return true;
    }
    if (key === 'wear') {
      const e = this.findLook();
      if (!e?.object3D) return false;
      e.object3D.getWorldPosition(this.target);
      this.target.y -= 0.17;
      this.end.copy(this.target).addScaledVector(this.toUser, 0.06);
      return true;
    }
    if (key === 'tailor') {
      const e = this.findPin();
      if (!e?.object3D) return false;
      e.object3D.getWorldPosition(this.target);
      this.end.copy(this.target);
      this.end.y -= 0.16;
      return true;
    }
    const e = this.findSwatch();
    let form: Entity | undefined;
    for (const f of this.queries.forms.entities) form = f;
    if (!e?.object3D || !form?.object3D) return false;
    e.object3D.getWorldPosition(this.target);
    form.object3D.getWorldPosition(this.end);
    this.end.y += 1.12;
    this.world.camera.getWorldPosition(this.cam);
    this.pos.copy(this.cam).sub(this.end);
    this.pos.y = 0;
    this.pos.normalize();
    this.end.addScaledVector(this.pos, 0.2);
    return true;
  }

  update(delta: number): void {
    if (!this.active) return;
    // Let the opening reveal play before the ghost hand appears.
    if (this.world.getSystem(RoomPlacementSystem)?.revealing) {
      this.hand.setOpacity(0);
      this.pulseMat.opacity = 0;
      this.chips[this.step].visible = false;
      return;
    }
    const step = STEPS[this.step];

    // Advance when the user has done the step themselves.
    if (this.counter(step.key) > this.baseline) {
      this.goTo(this.step + 1);
      return;
    }

    // Stay out of the way while the user is holding something.
    if (this.queries.grabbed.entities.size > 0) {
      this.hand.setOpacity(0);
      this.pulseMat.opacity = 0;
      this.chips[this.step].visible = false;
      this.t = 0;
      return;
    }

    this.world.camera.getWorldPosition(this.cam);
    if (!this.resolveTargets(step.key)) {
      this.hand.setOpacity(0);
      return;
    }
    this.toUser.copy(this.cam).sub(this.target);
    this.toUser.y = 0;
    if (this.toUser.lengthSq() < 1e-6) this.toUser.set(0, 0, 1);
    this.toUser.normalize();
    // Re-resolve now that toUser is fresh (the wear step uses it).
    this.resolveTargets(step.key);
    this.start.copy(this.target).addScaledVector(this.toUser, 0.24);
    this.start.y += 0.05;

    this.t = (this.t + delta) % LOOP;
    const t = this.t;
    // Timeline: fade in → approach → pinch → drag → release → fade out → rest.
    const fadeIn = seg(t, 0, 0.3);
    const approach = seg(t, 0.2, 1.1);
    const pinch = seg(t, 1.1, 1.4) * (1 - seg(t, 2.5, 2.8));
    const drag = seg(t, 1.45, 2.45);
    const fadeOut = 1 - seg(t, 2.9, 3.3);
    const opacity = fadeIn * fadeOut;

    this.pos.copy(this.start).lerp(this.target, approach);
    if (drag > 0) this.pos.copy(this.target).lerp(this.end, drag);

    // Aim the fingers from the user toward the target, slightly downward.
    const root = this.hand.root;
    this.look.copy(this.toUser).negate();
    this.look.y = -0.35;
    root.position.copy(this.pos);
    this.look.add(this.pos);
    root.lookAt(this.look);
    this.hand.setPinch(pinch);
    root.updateMatrixWorld(true);
    // Shift so the pinch point (between thumb and index tips) sits on the path.
    this.hand.pinchPoint(this.pp);
    root.position.add(this.pos.sub(this.pp));
    this.hand.setOpacity(opacity);

    // A ring pulses at the target as the pinch closes.
    const pulse = seg(t, 1.1, 1.7);
    this.pulse.position.copy(this.target).addScaledVector(this.toUser, 0.01);
    this.pulse.lookAt(this.cam);
    this.pulse.scale.setScalar(1 + pulse * 1.6);
    this.pulseMat.opacity = pulse > 0 && pulse < 1 ? 0.9 * (1 - pulse) : 0;

    // The step chip floats above the target, facing the user.
    const chip = this.chips[this.step];
    chip.visible = true;
    chip.position.copy(this.target).addScaledVector(this.toUser, 0.12);
    chip.position.y += step.key === 'tailor' ? 0.14 : 0.3;
    if (step.key === 'fabric') chip.position.y += -0.08;
    chip.lookAt(this.cam);
  }
}
