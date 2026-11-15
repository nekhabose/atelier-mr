/**
 * Safety nets: the studio keeps running, and your work is kept, when
 * something goes wrong. Runtime only (DOM).
 *
 *  - guardSystems(): three.js asks for the next frame only after the frame
 *    callback returns, so one system throwing in update() would freeze the
 *    whole view. Every registered system's update is wrapped: the error is
 *    recorded (once a minute per system) and the frame goes on.
 *  - Errors anywhere else (error / unhandledrejection) are recorded too.
 *  - Graphics reset (WebGL context lost): you are told; if the context is not
 *    back within 4 s the page reloads, and your studio comes back from the
 *    device (everything is saved as you go).
 *  - Entering the headset view: if no session has started 8 s after asking,
 *    you get a plain explanation instead of nothing.
 *
 * `globalThis.atelierHealth` shows the log for scripted checks and ?perf.
 */

export interface HealthEntry {
  t: number;
  where: string;
  message: string;
}

const LOG_SIZE = 30;
const log: HealthEntry[] = [];
const lastBySource = new Map<string, number>();
let notice: (text: string) => void = () => {};

export const health = {
  log,
  /** Frames in which a guarded system threw (and the frame went on). */
  caught: 0,
  contextLost: 0,
};
(globalThis as unknown as { atelierHealth: typeof health }).atelierHealth = health;

/** Record an error; returns false if this source was recorded in the last minute. */
export function record(where: string, err: unknown): boolean {
  const now = performance.now();
  const last = lastBySource.get(where) ?? -Infinity;
  if (now - last < 60_000) return false;
  lastBySource.set(where, now);
  const message = err instanceof Error ? err.message : String(err);
  log.push({ t: Math.round(now), where, message: message.slice(0, 300) });
  if (log.length > LOG_SIZE) log.shift();
  console.warn(`[atelier] ${where}:`, err);
  return true;
}

/** Where to tell the user (the studio hint in the headset, a toast on the page). */
export function setNotice(fn: (text: string) => void): void {
  notice = fn;
}

interface Updatable {
  constructor: { name: string };
  update?: (delta: number, time: number) => void;
}

const guarded = new WeakSet<object>();

/** Wrap every system's update so one failure cannot stop the frame loop. */
export function guardSystems(systems: readonly Updatable[]): number {
  let n = 0;
  for (const system of systems) {
    if (guarded.has(system) || typeof system.update !== 'function') continue;
    const update = system.update.bind(system);
    const name = system.constructor.name || 'system';
    system.update = (delta: number, time: number) => {
      try {
        update(delta, time);
      } catch (err) {
        health.caught++;
        if (record(name, err)) notice('Something hiccuped, and the studio carried on. Your work is saved.');
      }
    };
    guarded.add(system);
    n++;
  }
  return n;
}

let handlersInstalled = false;

/** Record errors that escape everything else. */
export function installGlobalHandlers(): void {
  if (handlersInstalled) return;
  handlersInstalled = true;
  addEventListener('error', (e) => {
    record(`page:${(e.filename ?? '').split('/').pop() ?? ''}`, e.error ?? e.message);
  });
  addEventListener('unhandledrejection', (e) => {
    record('promise', e.reason);
  });
}

/** Handle the GPU context being lost and (usually) restored. */
export function watchContext(canvas: HTMLCanvasElement): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault(); // allow a restore
    health.contextLost++;
    record('webgl', 'context lost');
    notice('The display was reset. Your studio is saved; it will be back in a moment.');
    timer = setTimeout(() => location.reload(), 4000);
  });
  canvas.addEventListener('webglcontextrestored', () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    notice('Display restored.');
  });
}

/**
 * After asking for the headset view: if no session has started within
 * `ms`, explain what to check (the request itself only logs its error).
 */
export function expectSession(isActive: () => boolean, ms = 8000): void {
  setTimeout(() => {
    if (isActive()) return;
    record('xr', 'no session after request');
    notice(
      'The headset view did not start. Use the Meta Quest Browser, allow immersive mode and hand tracking when asked, then tap Enter the studio again.',
    );
  }, ms);
}

/** A small paper toast on the flat page. */
export function toast(text: string): void {
  let el = document.getElementById('atelier-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'atelier-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.style.cssText =
      'position:fixed;right:16px;bottom:16px;z-index:40;max-width:360px;padding:12px 16px;border-radius:12px;' +
      'background:#f4ede1;color:#2a231c;border:1px solid #d8ccb6;box-shadow:0 8px 24px rgba(60,44,28,0.18);' +
      'font:14px/1.4 -apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;transition:opacity .3s';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.opacity = '1';
  clearTimeout((el as unknown as { _t?: number })._t);
  (el as unknown as { _t?: number })._t = window.setTimeout(() => {
    if (el) el.style.opacity = '0';
  }, 6000);
}
