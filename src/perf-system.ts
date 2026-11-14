/**
 * PerfSystem – GPU savings that matter on a headset, and a meter to prove it.
 *
 * Shadows on demand: the studio is still most of the time, but three.js
 * redraws every shadow caster into the shadow map every frame. Here the shadow
 * map is redrawn only when a visible caster moved, appeared, disappeared or
 * was rebuilt (a cheap fingerprint of the casters' world matrices, checked
 * once per frame without allocating).
 *
 * Meter (?perf): frames per second, frame time, draw calls, triangles and
 * shadow-map redraws per second, on the flat page and inside the headset.
 * The same numbers are on `globalThis.perfStats` for scripted checks.
 */
import { createSystem, Mesh, MeshBasicMaterial, Object3D, VisibilityState } from '@iwsdk/core';
import { makeLabel } from './atelier/labels.js';

const METER_INTERVAL = 0.5;

export interface PerfStats {
  fps: number;
  frameMs: number;
  worstFrameMs: number;
  drawCalls: number;
  triangles: number;
  shadowRedrawsPerSec: number;
  shadowSkipRatio: number;
  foveation: number | null;
}

export class PerfSystem extends createSystem({}) {
  stats: PerfStats = {
    fps: 0,
    frameMs: 0,
    worstFrameMs: 0,
    drawCalls: 0,
    triangles: 0,
    shadowRedrawsPerSec: 0,
    shadowSkipRatio: 0,
    foveation: null,
  };
  /** Set false to compare with three.js's default (redraw every frame). */
  shadowsOnDemand = true;
  private fingerprint = 0;
  private acc = 0;
  private visit!: (o: Object3D) => void;
  private windowT = 0;
  private frames = 0;
  private worst = 0;
  private redraws = 0;
  private meterOn = false;
  private dom?: HTMLDivElement;
  private label?: Mesh;

  init(): void {
    const renderer = this.world.renderer;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    this.visit = (o: Object3D) => {
      if (!o.castShadow || !(o as Mesh).isMesh) return;
      const e = o.matrixWorld.elements;
      // Position, basis and identity (a rebuilt garment is a new mesh).
      this.acc += e[12] * 1.31 + e[13] * 2.17 + e[14] * 3.07 + e[0] * 0.71 + e[2] * 0.53 + e[5] * 0.37 + e[8] * 0.29 + e[10] * 0.19 + o.id * 0.001;
    };
    this.meterOn = new URLSearchParams(location.search).has('perf');
    (globalThis as unknown as { perfStats: PerfStats }).perfStats = this.stats;
    if (this.meterOn) this.buildDom();
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        renderer.shadowMap.needsUpdate = true;
        if (this.dom) this.dom.style.display = state === VisibilityState.NonImmersive ? 'block' : 'none';
        if (this.label) this.label.visible = state !== VisibilityState.NonImmersive;
      }),
      () => this.dom?.remove(),
    );
  }

  /** Force one shadow redraw (e.g. after a lighting change). */
  invalidateShadows(): void {
    this.world.renderer.shadowMap.needsUpdate = true;
  }

  update(delta: number): void {
    const renderer = this.world.renderer;
    if (!this.shadowsOnDemand) {
      renderer.shadowMap.needsUpdate = true;
      this.redraws++;
    } else {
      this.acc = 0;
      this.world.scene.traverseVisible(this.visit);
      if (this.acc !== this.fingerprint) {
        this.fingerprint = this.acc;
        renderer.shadowMap.needsUpdate = true;
        this.redraws++;
      }
    }

    // Meter window.
    this.frames++;
    this.windowT += delta;
    if (delta > this.worst) this.worst = delta;
    if (this.windowT >= METER_INTERVAL) {
      const s = this.stats;
      s.fps = Math.round(this.frames / this.windowT);
      s.frameMs = Math.round((this.windowT / this.frames) * 10000) / 10;
      s.worstFrameMs = Math.round(this.worst * 10000) / 10;
      s.drawCalls = renderer.info.render.calls;
      s.triangles = renderer.info.render.triangles;
      s.shadowRedrawsPerSec = Math.round(this.redraws / this.windowT);
      s.shadowSkipRatio = Math.round((1 - this.redraws / this.frames) * 100) / 100;
      const xr = renderer.xr as unknown as { isPresenting: boolean; getFoveation?: () => number | undefined };
      s.foveation = xr.isPresenting ? xr.getFoveation?.() ?? null : null;
      this.frames = 0;
      this.windowT = 0;
      this.worst = 0;
      this.redraws = 0;
      if (this.meterOn) this.paintMeter();
    }
  }

  private text(): string {
    const s = this.stats;
    return `${s.fps} fps  ${s.frameMs} ms (worst ${s.worstFrameMs})  |  ${s.drawCalls} calls  ${Math.round(s.triangles / 1000)}k tris  |  shadows ${s.shadowRedrawsPerSec}/s`;
  }

  private buildDom(): void {
    const d = document.createElement('div');
    d.id = 'perf-meter';
    d.setAttribute('aria-hidden', 'true');
    d.style.cssText =
      'position:fixed;left:12px;top:12px;z-index:30;padding:6px 10px;border-radius:8px;background:rgba(0,0,0,0.75);color:#9ef5a0;font:12px/1.3 ui-monospace,Menlo,monospace;pointer-events:none';
    document.body.appendChild(d);
    this.dom = d;
  }

  private paintMeter(): void {
    const text = this.text();
    if (this.dom) this.dom.textContent = text;
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) return;
    // In the headset: a small tag above the studio panel, redrawn twice a second.
    const panel = this.world.getSceneObject('atelier-panel');
    if (!panel) return;
    if (this.label) {
      this.label.removeFromParent();
      const mat = this.label.material as MeshBasicMaterial;
      mat.map?.dispose();
      mat.dispose();
      this.label.geometry.dispose();
    }
    this.label = makeLabel(text, { width: 4.6, fontSize: 30, color: '#9ef5a0', background: 'rgba(0,0,0,0.8)', pill: true });
    this.label.position.set(0, 2.6, 0.02);
    panel.add(this.label);
  }
}
