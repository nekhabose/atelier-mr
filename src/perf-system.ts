/**
 * PerfSystem – GPU savings that matter on a headset, and a meter to prove it.
 *
 * Shadows on demand: the studio is still most of the time, but three.js
 * redraws every shadow caster into the shadow map every frame. Here the shadow
 * map is redrawn only when a visible caster moved, appeared, disappeared or
 * was rebuilt (a cheap fingerprint of the casters' world matrices, checked
 * once per frame without allocating).
 *
 * Quality governor (in the headset): the judging floor is 60 fps on Quest.
 * When the frame rate stays under 85% of the display's refresh rate (61 fps
 * on a 72 Hz Quest) for 1.5 s, quality steps down
 * one tier, and steps back up after 10 s at the device's refresh rate.
 * First, though, a headset running above 72 Hz is asked for the next lower
 * rate it supports (Meta's WebXR samples target 72 Hz: 13.7 ms a frame
 * instead of 11.1 at 90), and detail is cut only if it still falls behind:
 *   tier 0  everything on;
 *   tier 1  depth occlusion off, shadows redrawn at most 4 times a second;
 *   tier 2  also lighter worn garments (about half the triangles) with
 *           standard shading (no sheen or clearcoat; sheer fabrics cut out
 *           instead of blended).
 * The studio stays fully usable at every tier.
 *
 * Meter (?perf): frames per second, frame time, draw calls, triangles,
 * shadow-map redraws per second and the quality tier, on the flat page and
 * inside the headset. The same numbers are on `globalThis.perfStats`.
 */
import { createSystem, DepthSensingSystem, Mesh, MeshBasicMaterial, Object3D, VisibilityState } from '@iwsdk/core';
import { AtelierSystem } from './atelier-system.js';
import { makeLabel } from './atelier/labels.js';
import { DOWN_AFTER, govern, lowerRate, MAX_TIER, newGovernor } from './atelier/quality.js';

const METER_INTERVAL = 0.5;
/** Seconds into a session before the governor may lower the refresh rate. */
const REFRESH_GRACE_S = 6;

export interface PerfStats {
  fps: number;
  frameMs: number;
  worstFrameMs: number;
  drawCalls: number;
  triangles: number;
  shadowRedrawsPerSec: number;
  shadowSkipRatio: number;
  foveation: number | null;
  /** Quality tier set by the governor (0 = full). */
  tier: number;
  /** The headset's refresh rate (Hz) in a session, after any step down; null on the page. */
  refreshHz: number | null;
}

type RatedSession = XRSession & {
  frameRate?: number;
  supportedFrameRates?: Float32Array;
  updateTargetFrameRate?: (rate: number) => Promise<void>;
};

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
    tier: 0,
    refreshHz: null,
  };
  /** Set false to hold the current quality tier (tests, comparisons). */
  governor = true;
  private gov = newGovernor();
  /** The refresh rate the governor asked for in this session, if any. */
  private askedHz?: number;
  /** When this session started (clock seconds): no refresh change in its first seconds. */
  private sessionAt = 0;
  private clock = 0;
  private lastShadow = -Infinity;
  private shadowGap = 0;
  private shadowDirty = false;
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
        // Each session finds its own level.
        this.gov = newGovernor();
        this.askedHz = undefined;
        this.sessionAt = this.clock;
        if (state === VisibilityState.NonImmersive && this.stats.tier !== 0) this.setTier(0);
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

  /** Set the quality tier (0 = full). */
  setTier(tier: number): void {
    const t = Math.max(0, Math.min(MAX_TIER, Math.round(tier)));
    this.stats.tier = t;
    const depth = this.world.getSystem(DepthSensingSystem);
    if (depth) depth.config.enableOcclusion.value = t < 1;
    this.shadowGap = t >= 1 ? 0.25 : 0;
    this.world.getSystem(AtelierSystem)?.setGarmentDetail(t >= 2);
    this.gov.tier = t;
    this.gov.lowT = 0;
    this.gov.highT = 0;
  }

  /** Called twice a second in the headset with the measured frame rate. */
  private govern(fps: number, window: number): void {
    const session = this.world.renderer.xr.getSession() as RatedSession | null;
    this.stats.refreshHz = session?.frameRate ?? null;
    const tier = govern(this.gov, fps, window, this.askedHz ?? session?.frameRate);
    // Falling behind: a lower refresh rate first, then less detail (and still
    // behind at the lightest detail: a lower rate too).
    const wantsLess = tier > this.stats.tier || (this.stats.tier === MAX_TIER && this.gov.lowT >= DOWN_AFTER);
    if (wantsLess && this.lowerRefresh(session)) return;
    if (tier !== this.stats.tier) this.setTier(tier);
  }

  /** Ask the headset for its next lower refresh rate (not below 72 Hz). */
  private lowerRefresh(session: RatedSession | null): boolean {
    // A slow first few seconds (shaders compiling) is not a reason to give up
    // the higher rate for the whole session: cut detail then (it comes back).
    if (this.clock - this.sessionAt < REFRESH_GRACE_S) return false;
    const rate = lowerRate(session?.supportedFrameRates, this.askedHz ?? session?.frameRate);
    if (!session?.updateTargetFrameRate || rate === null) return false;
    this.askedHz = rate;
    session.updateTargetFrameRate(rate).catch(() => {});
    // Start measuring again against the new rate, at the same detail.
    this.gov = newGovernor();
    this.gov.tier = this.stats.tier;
    console.info(`[atelier] behind at ${session.frameRate} Hz: asked the headset for ${rate} Hz before cutting detail`);
    return true;
  }

  update(delta: number): void {
    const renderer = this.world.renderer;
    this.clock += delta;
    if (!this.shadowsOnDemand) {
      renderer.shadowMap.needsUpdate = true;
      this.redraws++;
    } else {
      this.acc = 0;
      this.world.scene.traverseVisible(this.visit);
      if (this.acc !== this.fingerprint) {
        this.fingerprint = this.acc;
        this.shadowDirty = true;
      }
      // At lower tiers moving shadows are redrawn a few times a second.
      if (this.shadowDirty && this.clock - this.lastShadow >= this.shadowGap) {
        this.shadowDirty = false;
        this.lastShadow = this.clock;
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
      if (this.governor && xr.isPresenting) this.govern(s.fps, this.windowT);
      this.frames = 0;
      this.windowT = 0;
      this.worst = 0;
      this.redraws = 0;
      if (this.meterOn) this.paintMeter();
    }
  }

  private text(): string {
    const s = this.stats;
    return `${s.fps} fps  ${s.frameMs} ms (worst ${s.worstFrameMs})  |  ${s.drawCalls} calls  ${Math.round(s.triangles / 1000)}k tris  |  shadows ${s.shadowRedrawsPerSec}/s  |  quality ${['full', 'reduced', 'light'][s.tier]}${s.refreshHz ? `  |  ${Math.round(s.refreshHz)} Hz` : ''}`;
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
