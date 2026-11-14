/**
 * StartSystem – the flat start page. Owns the side panel (src/atelier/
 * side-panel.ts): its welcome section says what Atelier is in one line, with
 * one big "Enter the studio" button and the 90-second tour for anyone without
 * a headset. The panel hides inside the immersive session and during the tour.
 *
 * The camera's view is shifted so the studio sits in the middle of the space
 * beside the panel, not behind it.
 */
import { createSystem, VisibilityState } from '@iwsdk/core';
import { sidePanel, sidePanelInset, sideSection } from './atelier/side-panel.js';

export class StartSystem extends createSystem({}) {
  private flat = true;
  private emulatorChecked = false;

  init(): void {
    const panel = sidePanel();
    const card = sideSection('atelier-welcome', 0);
    card.setAttribute('aria-label', 'Welcome to Atelier');
    const xr = this.world.xrEnabled;
    card.innerHTML = `
      <div class="as-title">Atelier</div>
      <div class="as-lead">A fitting room in your own room. Dress, tailor and plan your clothes with your hands.</div>
      <button type="button" data-enter class="as-btn as-btn-main as-wide">
        ${xr ? 'Enter the studio' : 'Open on Meta Quest to enter'}
      </button>
      <button type="button" data-tour class="as-btn as-wide" style="margin-top:8px">Watch the 90-second tour</button>
      <div class="as-note">${
        xr ? 'Put your controllers down: everything works with a pinch.' : 'On this screen you can explore the studio and play the tour.'
      }</div>`;
    const enter = card.querySelector<HTMLButtonElement>('[data-enter]')!;
    if (xr) enter.addEventListener('click', () => this.world.launchXR());
    else enter.disabled = true;
    card.querySelector('[data-tour]')!.addEventListener('click', () => {
      (globalThis as unknown as { showcase?: { start(): void } }).showcase?.start();
    });

    // After the engine's own resize handler has set its aspect.
    const onResize = () => requestAnimationFrame(() => this.frame());
    window.addEventListener('resize', onResize);
    const observer = new MutationObserver(() => this.frame());
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        this.flat = state === VisibilityState.NonImmersive;
        panel.style.display = this.flat ? 'flex' : 'none';
        // The studio set is for the flat page; in the headset your room is the set.
        const set = this.world.getSceneObject('studio-set');
        if (set) set.visible = this.flat;
        this.frame();
      }),
      () => {
        window.removeEventListener('resize', onResize);
        observer.disconnect();
        panel.remove();
      },
    );
  }

  /**
   * The desktop XR emulator adds its own "Enter XR" pill; on the flat page the
   * panel's "Enter the studio" does the same, so the pill waits until then.
   */
  private emulatorButton(show: boolean): void {
    for (const el of document.body.children) {
      const host = el as HTMLElement;
      if (host.shadowRoot && /Enter XR/i.test(host.shadowRoot.textContent ?? '')) {
        host.style.display = show ? '' : 'none';
      }
    }
    // The emulator can add it after we start: check again shortly.
    if (!show && !this.emulatorChecked) {
      this.emulatorChecked = true;
      setTimeout(() => this.frame(), 1500);
      setTimeout(() => this.frame(), 4000);
    }
  }

  /** Centre the 3D view in the space beside the panel (flat page only). */
  private frame(): void {
    const cam = this.world.camera;
    const touring = document.body.classList.contains('atelier-showcase');
    const inset = this.flat && !touring ? sidePanelInset() : 0;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.emulatorButton(inset === 0);
    if (w <= 0 || h <= 0) return;
    if (inset > 0) {
      // A virtual view wider by the panel's width, of which the screen shows
      // the left part: the centre of projection moves right by half the
      // panel, into the middle of the free space. The aspect is the virtual
      // view's, so nothing stretches.
      cam.aspect = (w + inset) / h;
      cam.setViewOffset(w + inset, h, 0, 0, w, h);
    } else {
      cam.aspect = w / h;
      if (cam.view) cam.clearViewOffset();
    }
    cam.updateProjectionMatrix();
  }
}
