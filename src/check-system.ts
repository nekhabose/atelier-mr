/**
 * CheckSystem – a 30-second device check for any headset, no setup needed.
 *
 * Open the app with ?check (atelier-mr.vercel.app/?check), tap Enter the
 * studio and wait. Once the studio has settled, the check runs the heaviest
 * things Atelier does, on its own: wearing looks, tailoring step by step,
 * changing fabrics, turning the form, the stylist planning an outfit, the
 * boutique try-on. It records every frame time (into a preallocated buffer,
 * nothing allocated per frame) and then shows a results card above the form:
 * average and 1%-low frame rate, the worst frame, the share of frames slower
 * than 60 fps, the quality tier, the refresh rate, and what the headset
 * granted (hands, planes, meshes, anchors, depth, gaze). Take a screenshot
 * (Meta button + trigger). The same results wait on the start page after you
 * leave, with a button to copy them.
 */
import {
  CanvasTexture,
  createSystem,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { AtelierSystem } from './atelier-system.js';
import { BoutiqueSystem } from './boutique-system.js';
import { ClosetSystem } from './closet-system.js';
import { RoomPlacementSystem } from './room-system.js';
import { StylistSystem } from './stylist-system.js';
import { sideSection } from './atelier/side-panel.js';
import { INK, PAPER, THREAD } from './atelier/palette.js';
import { CheckResult, resultLines, summarise } from './atelier/device-check.js';

const DURATION = 30;
const MAX_FRAMES = 4000;
const KEY = 'atelier.devicecheck.v1';

export class CheckSystem extends createSystem({}) {
  /** Running, finished or idle (for scripted checks). */
  state: 'idle' | 'waiting' | 'running' | 'done' = 'idle';
  result: CheckResult | null = null;
  private enabled = false;
  private t = 0;
  private n = 0;
  private times = new Float32Array(MAX_FRAMES);
  private next = 0;
  private card?: Mesh;
  private head = new Vector3();
  private steps: { at: number; act: () => void }[] = [];

  init(): void {
    this.showSaved();
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        if (!this.enabled) return;
        if (state === VisibilityState.Visible && this.state === 'idle') this.state = 'waiting';
        if (state === VisibilityState.NonImmersive && this.state !== 'idle') this.showSaved();
      }),
    );
    if (new URLSearchParams(location.search).has('check')) this.arm();
  }

  /** Run the check the next time the headset view starts (?check does this). */
  arm(): void {
    this.enabled = true;
    this.state = this.world.visibilityState.peek() === VisibilityState.Visible ? 'waiting' : 'idle';
    const a = () => this.world.getSystem(AtelierSystem)!;
    const closet = () => this.world.getSystem(ClosetSystem)!;
    const stylist = () => this.world.getSystem(StylistSystem)!;
    const boutique = () => this.world.getSystem(BoutiqueSystem)!;
    const nudges = Array.from({ length: 12 }, (_, i) => ({
      at: 7 + i * 0.15,
      act: () => void a().nudge('hem', i < 6 ? 1 : -1),
    }));
    this.steps = [
      { at: 1, act: () => a().wearLook(1) },
      { at: 4, act: () => a().wearLook(5) },
      ...nudges,
      { at: 10, act: () => a().applyFabric('navy-satin') },
      { at: 12, act: () => a().applyFabric('ivory-silk') },
      { at: 14, act: () => a().turnForm(1) },
      { at: 17, act: () => void stylist().styleMe() },
      { at: 21, act: () => stylist().keep() },
      {
        at: 22,
        act: () => {
          closet().openBoutique();
          boutique().open(1);
        },
      },
      { at: 23.5, act: () => boutique().tryOn(1) },
      { at: 26, act: () => boutique().close(true) },
    ];
  }

  update(delta: number): void {
    if (this.state === 'waiting') {
      const room = this.world.getSystem(RoomPlacementSystem);
      if (room?.isPlaced && !room.revealing) {
        this.state = 'running';
        this.t = 0;
        this.n = 0;
        this.next = 0;
        this.world.getSystem(AtelierSystem)?.setHint('Device check running: 30 seconds. Please wait and keep looking at the studio.');
      }
      return;
    }
    if (this.state !== 'running') return;
    this.t += delta;
    if (this.n < MAX_FRAMES) this.times[this.n++] = delta;
    while (this.next < this.steps.length && this.steps[this.next].at <= this.t) {
      this.steps[this.next++].act();
    }
    if (this.t >= DURATION) this.finish();
  }

  private finish(): void {
    this.state = 'done';
    const renderer = this.world.renderer;
    const session = renderer.xr.getSession() as (XRSession & { frameRate?: number; enabledFeatures?: string[] }) | null;
    const room = this.world.getSystem(RoomPlacementSystem);
    const stats = (globalThis as unknown as { perfStats?: { drawCalls: number; triangles: number; tier: number } }).perfStats;
    const health = (globalThis as unknown as { atelierHealth?: { log: unknown[] } }).atelierHealth;
    const ua = navigator.userAgent;
    const device = /Quest 3S/.test(ua) ? 'Meta Quest 3S' : /Quest 3/.test(ua) ? 'Meta Quest 3' : /Quest Pro/.test(ua) ? 'Meta Quest Pro' : /Quest 2/.test(ua) ? 'Meta Quest 2' : /Quest/.test(ua) ? 'Meta Quest' : 'This device';
    this.result = {
      when: new Date().toISOString().slice(0, 16).replace('T', ' '),
      device,
      refreshHz: session?.frameRate ? Math.round(session.frameRate) : null,
      ...summarise(this.times, this.n),
      drawCalls: stats?.drawCalls ?? renderer.info.render.calls,
      triangles: stats?.triangles ?? renderer.info.render.triangles,
      tier: stats?.tier ?? 0,
      features: [...(session?.enabledFeatures ?? [])].filter((f) => !['local', 'local-floor', 'viewer'].includes(f)),
      planes: room?.queries.planes.entities.size ?? 0,
      meshes: room?.queries.meshes.entities.size ?? 0,
      anchored: room?.anchored ?? false,
      errors: health?.log.length ?? 0,
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.result));
    } catch {
      /* the card still shows */
    }
    console.info('[atelier] device check', this.result);
    this.showCard(this.result);
    this.world.getSystem(AtelierSystem)?.setHint('Device check done. Take a screenshot: Meta button, then the trigger.');
  }

  /** A paper card above the form with the results, facing you. */
  private showCard(r: CheckResult): void {
    const lines = resultLines(r);
    const W = 1024;
    const H = 520;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.roundRect(8, 8, W - 16, H - 16, 28);
    ctx.fill();
    ctx.strokeStyle = '#d8ccb6';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = THREAD;
    ctx.fillRect(48, 112, 120, 6);
    ctx.fillStyle = INK;
    ctx.font = '600 54px Georgia, "Times New Roman", serif';
    ctx.fillText('Atelier device check', 48, 92);
    ctx.font = '500 34px -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
    lines.forEach((line, i) => ctx.fillText(line.length > 58 ? `${line.slice(0, 57)}...` : line, 48, 178 + i * 52));
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    const card = new Mesh(new PlaneGeometry(0.9, (0.9 * H) / W), new MeshBasicMaterial({ map: tex, transparent: true }));
    card.name = 'device-check-card';
    card.userData.iwsdkRuntimeOnly = true;
    card.raycast = () => {};
    const form = this.world.getSceneObject('dress-form');
    if (!form) return;
    form.add(card);
    card.position.set(0, 2.15, 0.15);
    this.world.camera.getWorldPosition(this.head);
    card.lookAt(this.head);
    this.card = card;
  }

  /** On the start page: the last results and a button to copy them. */
  private showSaved(): void {
    let r: CheckResult | null = null;
    try {
      r = JSON.parse(localStorage.getItem(KEY) ?? 'null') as CheckResult | null;
    } catch {
      r = null;
    }
    if (!r) return;
    let box = document.getElementById('device-check');
    if (!box) box = sideSection('device-check', 4, 'Device check', true, `Last run ${r.when}.`);
    box.querySelector('[data-check]')?.remove();
    const body = document.createElement('div');
    body.dataset.check = '';
    const text = ['Atelier device check', ...resultLines(r)].join('\n');
    body.innerHTML = `<pre style="white-space:pre-wrap;font:12.5px/1.45 ui-monospace,Menlo,monospace;margin:10px 0 0;color:#2a231c"></pre>
      <button type="button" class="as-btn as-wide">Copy the results</button>`;
    body.querySelector('pre')!.textContent = text;
    const button = body.querySelector('button')!;
    button.addEventListener('click', () => {
      void navigator.clipboard?.writeText(text).then(
        () => (button.textContent = 'Copied'),
        () => (button.textContent = 'Select the text above and copy it'),
      );
    });
    box.appendChild(body);
  }
}
