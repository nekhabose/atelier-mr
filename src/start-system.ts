/**
 * StartSystem – the flat start page's welcome card: what Atelier is in one
 * line, one big "Enter the studio" button, and the 1-minute tour for anyone
 * without a headset. Hidden inside the immersive session and during the tour.
 */
import { createSystem, VisibilityState } from '@iwsdk/core';

export class StartSystem extends createSystem({}) {
  private card?: HTMLDivElement;

  init(): void {
    const card = document.createElement('div');
    card.id = 'atelier-welcome';
    card.setAttribute('role', 'region');
    card.setAttribute('aria-label', 'Welcome to Atelier');
    card.style.cssText = [
      'position:fixed', 'left:16px', 'top:16px', 'z-index:10', 'width:320px', 'max-width:calc(100vw - 32px)',
      'padding:18px 20px', 'border-radius:18px', 'background:rgba(28,24,20,0.92)', 'color:#f6efe2',
      'font:14px/1.45 "Helvetica Neue",Helvetica,Arial,sans-serif', 'box-shadow:0 10px 34px rgba(0,0,0,0.28)',
      'box-sizing:border-box',
    ].join(';');
    const xr = this.world.xrEnabled;
    card.innerHTML = `
      <div style="font-family:Didot,'Bodoni 72',Georgia,serif;font-size:34px;letter-spacing:8px;color:#f6e7c4">ATELIER</div>
      <div style="margin-top:4px;color:#d8cfbf">A fashion studio in your room: dress, tailor and style your own clothes with your hands.</div>
      <button type="button" data-enter style="display:block;width:100%;margin-top:14px;cursor:pointer;border:none;border-radius:999px;padding:12px 14px;background:#e2c27d;color:#2b2118;font-weight:800;font-size:16px">
        ${xr ? 'Enter the studio' : 'Open on Meta Quest to enter'}
      </button>
      <button type="button" data-tour style="display:block;width:100%;margin-top:8px;cursor:pointer;border-radius:999px;padding:9px 14px;background:transparent;color:#f6efe2;border:1px solid #8a7656;font-weight:700">
        &#9654; Watch the 1-minute tour
      </button>
      <div style="margin-top:10px;font-size:12px;color:#bfb4a0">${
        xr ? 'Put your controllers down: everything works with a pinch.' : 'On this screen you can explore the studio and play the tour.'
      }</div>`;
    const enter = card.querySelector<HTMLButtonElement>('[data-enter]')!;
    if (xr) enter.addEventListener('click', () => this.world.launchXR());
    else enter.disabled = true;
    card.querySelector('[data-tour]')!.addEventListener('click', () => {
      (globalThis as unknown as { showcase?: { start(): void } }).showcase?.start();
    });
    document.body.appendChild(card);
    this.card = card;
    const style = document.createElement('style');
    style.textContent = 'body.atelier-showcase #atelier-welcome { display: none !important; }';
    document.head.appendChild(style);
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        card.style.display = state === VisibilityState.NonImmersive ? 'block' : 'none';
      }),
      () => {
        card.remove();
        style.remove();
      },
    );
  }
}
