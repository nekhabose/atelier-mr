/**
 * MarkSystem – "Mark it on yourself".
 *
 * Tap "Mark on me" on the studio panel (in the headset), then pinch your own
 * clothes where you want the garment to end, the way a tailor pins cloth on
 * the client: at your knee for a hem, at your wrist for a sleeve, just below
 * your collarbone for a neckline. The form takes the measurement, scaled from
 * your height to its own, and the tape measure shows it for a moment.
 *
 * Marking stays on for a few marks (it closes 12 s after the last one, or
 * with "Done marking"). With controllers, touch the spot with the controller
 * and pull the trigger.
 */
import { createSystem, Matrix4, UIKitMLAsset, Vector3, VisibilityState } from '@iwsdk/core';
import { AtelierSystem } from './atelier-system.js';
import { MeSystem } from './me-system.js';
import { RoomPlacementSystem } from './room-system.js';
import { access } from './atelier/access.js';
import { BodyMark, heightFromEyes, MarkMiss, markFromBody, markText } from './atelier/body-mark.js';
import { sfx } from './atelier/sfx.js';

const WINDOW = 12;
const SIDES = ['left', 'right'] as const;

export class MarkSystem extends createSystem({}) {
  /** Seconds of marking left (0 = off). */
  armed = 0;
  /** The last mark, for scripted checks. */
  last?: { param: string; cm: number; value: number; text: string } | { miss: MarkMiss };
  private atelier!: AtelierSystem;
  private inXR = false;
  private label?: { setProperties(p: Record<string, unknown>): void };
  private head = new Vector3();
  private fwd = new Vector3();
  private point = new Vector3();
  private m = new Matrix4();

  init(): void {
    this.atelier = this.world.getSystem(AtelierSystem)!;
    const panel = this.world.getSceneObject<UIKitMLAsset>('atelier-panel');
    const button = panel?.getElementById('mark-button');
    this.label = panel?.getElementById('mark-label') ?? undefined;
    if (button) {
      const onClick = () => (this.armed > 0 ? this.disarm('Marking done.') : this.arm());
      button.addEventListener('click', onClick);
      this.cleanupFuncs.push(() => button.removeEventListener('click', onClick));
      button.setProperties({ display: 'none' });
    }
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        this.inXR = state !== VisibilityState.NonImmersive;
        // Your body is only there in the headset.
        button?.setProperties({ display: this.inXR ? 'flex' : 'none' });
        if (!this.inXR && this.armed > 0) this.disarm();
      }),
    );
  }

  /** Start marking. */
  arm(): void {
    if (this.atelier.currentPieces.length === 0) {
      this.atelier.setHint('Dress the form first, then mark the length on yourself.');
      return;
    }
    this.armed = WINDOW;
    this.label?.setProperties({ text: 'Done marking' });
    sfx.tick();
    this.atelier.setHint(
      'Pinch your clothes where you want it: at your knee for a hem, your wrist for a sleeve, below your collarbone for a neckline.',
    );
  }

  disarm(hint?: string): void {
    this.armed = 0;
    this.label?.setProperties({ text: 'Mark on me' });
    if (hint) this.atelier.setHint(hint);
  }

  /** Your height: from your profile, else from your eye height (standing). */
  private height(eyeY: number, floorY: number): number {
    const cm = this.world.getSystem(MeSystem)?.profile?.heightCm;
    if (cm) return cm / 100;
    return access.settings.seated ? 1.7 : heightFromEyes(eyeY, floorY);
  }

  /**
   * Turn a point on your body (world space) into a measurement on the form.
   * Returns what the panel says. Also used by scripted checks.
   */
  markAt(point: Vector3): string {
    const cam = this.world.camera;
    cam.getWorldPosition(this.head);
    cam.getWorldDirection(this.fwd);
    this.fwd.y = 0;
    if (this.fwd.lengthSq() < 1e-6) this.fwd.set(0, 0, -1);
    this.fwd.normalize();
    const floorY = this.world.getSystem(RoomPlacementSystem)?.studioFrame.y ?? 0;
    const result = markFromBody({
      point,
      head: this.head,
      // Right of the view direction, on the floor plane.
      right: { x: -this.fwd.z, z: this.fwd.x },
      floorY,
      height: this.height(this.head.y, floorY),
    });
    if (typeof result === 'string') {
      this.last = { miss: result };
      // Out in front: a ray pinch at a panel, not a mark. Let it be.
      if (result === 'far') return '';
      const text = 'That is above the collar. Pinch lower to mark a neckline.';
      sfx.tick();
      this.atelier.setHint(text);
      return text;
    }
    return this.apply(result);
  }

  /** The guided tour: a mark as if pinched on a 1.72 m body. */
  demo(param: BodyMark['param'], cm: number): string {
    return this.apply({ param, value: cm / 100, cm });
  }

  private apply(mark: BodyMark): string {
    const set = this.atelier.setMeasure(mark.param, mark.value);
    if (!set) {
      const text = `This look has no ${mark.param === 'neck' ? 'neckline' : mark.param} to mark.`;
      this.atelier.setHint(text);
      return text;
    }
    let text = markText(mark);
    if (Math.abs(set.value - mark.value) > 0.015) {
      text += `. This ${set.piece.kind} goes only that far, so it stops there`;
    }
    text += '. Mark again, or Undo.';
    this.last = { param: mark.param, cm: mark.cm, value: set.value, text };
    sfx.success();
    this.atelier.setHint(text);
    this.armed = WINDOW;
    return text;
  }

  /** Where the pinch is: the index fingertip for hands, the grip for controllers. */
  private pinchPoint(side: (typeof SIDES)[number]): Vector3 | null {
    const xr = this.input.xr;
    if (xr.isPrimary('hand', side)) {
      const space = xr.visualAdapters.hand[side].getIndexTipSpace();
      const frame = this.world.renderer.xr.getFrame();
      const ref = this.world.renderer.xr.getReferenceSpace();
      const pose = space && frame && ref ? frame.getPose(space, ref) : undefined;
      if (pose) {
        const p = pose.transform.position;
        // Tracking space is the player rig's local space.
        this.player.updateMatrixWorld();
        return this.point.set(p.x, p.y, p.z).applyMatrix4(this.m.copy(this.player.matrixWorld));
      }
    }
    const grip = this.player.gripSpaces[side];
    if (!grip) return null;
    grip.getWorldPosition(this.point);
    return this.point;
  }

  update(delta: number): void {
    if (this.armed <= 0 || !this.inXR) return;
    this.armed -= delta;
    if (this.armed <= 0) {
      this.disarm('Marking done. Tap Mark on me to mark again.');
      return;
    }
    for (const side of SIDES) {
      if (!this.input.xr.getSelectState(side).start) continue;
      const p = this.pinchPoint(side);
      if (p) this.markAt(p);
    }
  }
}
