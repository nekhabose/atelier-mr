import { describe, expect, it, vi } from 'vitest';
import { govern, MAX_TIER, newGovernor } from '../src/atelier/quality';
import { wallPlan } from '../src/atelier/clearance';
import { guardSystems, health, record } from '../src/atelier/safety';

describe('quality governor', () => {
  it('steps down after 1.5 s behind a 72 Hz refresh, one tier at a time', () => {
    const g = newGovernor();
    expect(govern(g, 55, 0.5, 72)).toBe(0);
    expect(govern(g, 55, 0.5, 72)).toBe(0);
    expect(govern(g, 55, 0.5, 72)).toBe(1);
    for (let i = 0; i < 3; i++) govern(g, 50, 0.5, 72);
    expect(g.tier).toBe(2);
    for (let i = 0; i < 10; i++) govern(g, 30, 0.5, 72);
    expect(g.tier).toBe(MAX_TIER);
  });

  it('holds at 61-62 fps on a 72 Hz headset (the 60 fps floor) and recovers after 10 s on time', () => {
    const g = newGovernor();
    for (let i = 0; i < 20; i++) govern(g, 62, 0.5, 72);
    expect(g.tier).toBe(0);
    g.tier = 2;
    for (let i = 0; i < 19; i++) govern(g, 72, 0.5, 72);
    expect(g.tier).toBe(2);
    govern(g, 72, 0.5, 72);
    expect(g.tier).toBe(1);
  });

  it('uses the best rate seen when the device does not report one (a 60 Hz display is fine)', () => {
    const g = newGovernor();
    for (let i = 0; i < 40; i++) govern(g, 58 + (i % 3), 0.5);
    expect(g.tier).toBe(0);
    for (let i = 0; i < 4; i++) govern(g, 30, 0.5);
    expect(g.tier).toBe(1);
  });

  it('a short hitch does not change quality', () => {
    const g = newGovernor();
    govern(g, 40, 0.5, 72);
    govern(g, 72, 0.5, 72);
    govern(g, 40, 0.5, 72);
    expect(g.tier).toBe(0);
  });
});

describe('placement in rooms of any size', () => {
  it('backs up to a wall at a comfortable distance, fits a small room, ignores far walls', () => {
    expect(wallPlan(2.2, false)).toBe('snap');
    expect(wallPlan(1.2, false)).toBe('snug');
    expect(wallPlan(0.2, false)).toBe('none');
    expect(wallPlan(3.5, false)).toBe('none');
    expect(wallPlan(Infinity, false)).toBe('none');
  });

  it('seated always lays out around the chair', () => {
    expect(wallPlan(1.2, true)).toBe('none');
    expect(wallPlan(2.2, true)).toBe('none');
  });
});

describe('safety nets', () => {
  it('a system that throws does not stop the others, and is recorded once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const calls: string[] = [];
    class Broken {
      update() {
        throw new Error('boom');
      }
    }
    class Fine {
      update() {
        calls.push('fine');
      }
    }
    const systems = [new Broken(), new Fine()];
    expect(guardSystems(systems)).toBe(2);
    // Guarding twice wraps nothing new.
    expect(guardSystems(systems)).toBe(0);
    const before = health.caught;
    for (let frame = 0; frame < 3; frame++) for (const s of systems) s.update();
    expect(calls).toEqual(['fine', 'fine', 'fine']);
    expect(health.caught - before).toBe(3);
    expect(health.log.filter((e) => e.where === 'Broken')).toHaveLength(1);
    warn.mockRestore();
  });

  it('records each source at most once a minute', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(record('test-source', new Error('a'))).toBe(true);
    expect(record('test-source', new Error('b'))).toBe(false);
    warn.mockRestore();
  });
});

import { movedFrame, placementText, searchPlacement, blockers as hits, LayoutFootprint, Obstacle as Ob } from '../src/atelier/clearance';

describe('placement search in cluttered rooms', () => {
  // Studio frame at the viewer, facing -Z. Footprints: the form ahead, a rail left, a board right.
  const full: LayoutFootprint = { layout: 'full', circles: [{ x: 0, z: -1.55, r: 0.36 }, { x: -1.1, z: -1.3, r: 0.3 }, { x: 1.1, z: -1.3, r: 0.3 }] };
  const small: LayoutFootprint = { layout: 'small', circles: [{ x: 0, z: -0.95, r: 0.36 }, { x: -0.8, z: -0.6, r: 0.22 }, { x: 0.8, z: -0.6, r: 0.22 }] };
  const frame = { x: 0, z: 0, yaw: 0 };
  const me = { x: 0, z: 0 };

  it('turns about you as three.js does', () => {
    const f = movedFrame(frame, me, Math.PI / 2, 0, 0);
    expect(f.yaw).toBeCloseTo(Math.PI / 2);
    expect(f.x).toBeCloseTo(0);
  });

  it('slides or turns away from a table in front, keeping the full layout', () => {
    const table: Ob = { x: 0, z: -1.7, hx: 0.4, hz: 0.3, yaw: 0, label: 'table' };
    const p = searchPlacement([full, small], frame, me, [table]);
    expect(p.clear).toBe(true);
    expect(p.layout).toBe('full');
    expect(hits(full.circles, movedFrame(frame, me, p.dyaw, p.dx, p.dz), [table])).toEqual([]);
    expect(placementText(p)).toMatch(/^Moved the studio \(.+\) to clear your table\.$/);
  });

  it('falls back to the small layout when only it fits, and never into a wall', () => {
    // A sofa across the back and walls 2.1 m apart: the full studio cannot fit at any turn.
    const sofa: Ob = { x: 0, z: -2.1, hx: 2.5, hz: 0.6, yaw: 0, label: 'couch' };
    const left: Ob = { x: -1.05, z: -1, hx: 0.05, hz: 3, yaw: 0, label: 'wall' };
    const right: Ob = { x: 1.05, z: -1, hx: 0.05, hz: 3, yaw: 0, label: 'wall' };
    const p = searchPlacement([full, small], frame, me, [sofa, left, right]);
    expect(p.clear).toBe(true);
    expect(p.layout).toBe('small');
    expect(hits(small.circles, movedFrame(frame, me, p.dyaw, p.dx, p.dz), [sofa, left, right], me)).toEqual([]);
    expect(placementText(p)).toContain('Switched to the small layout');
  });

  it('says so when nothing fits', () => {
    const everywhere: Ob = { x: 0, z: -1, hx: 4, hz: 4, yaw: 0, label: 'bed' };
    const p = searchPlacement([full, small], frame, me, [everywhere]);
    expect(p.clear).toBe(false);
    expect(placementText(p)).toBe('Your bed is in the way here. Face a clearer spot and tap Move studio.');
  });
});

describe('placement search: nothing fits in front', () => {
  const full: LayoutFootprint = { layout: 'full', circles: [{ x: 0, z: -1.55, r: 0.36 }, { x: -1.1, z: -1.3, r: 0.3 }, { x: 1.1, z: -1.3, r: 0.3 }] };
  it('sets the studio to one side and says which', () => {
    // A big table filling the space in front (2.4 m wide); room at both sides.
    const table: Ob = { x: 0, z: -1.8, hx: 1.2, hz: 0.9, yaw: 0, label: 'table' };
    const p = searchPlacement([full], { x: 0, z: 0, yaw: 0 }, { x: 0, z: 0 }, [table]);
    expect(p.clear).toBe(true);
    expect(Math.abs(p.dyaw)).toBeGreaterThanOrEqual(1.05);
    expect(placementText(p)).toMatch(/^Nothing fits in front of you, so the studio is on your (left|right), clear of your table\.$/);
  });
});

import { resultLines, summarise } from '../src/atelier/device-check';

describe('device check summary', () => {
  it('reports average, 1% low, worst frame and the share below 60 fps', () => {
    const times = new Float32Array(1000).fill(1 / 72);
    for (let i = 0; i < 10; i++) times[i * 100] = 1 / 40; // 1% slow frames
    times[550] = 0.05; // one 50 ms hitch
    const s = summarise(times, 1000);
    expect(s.frames).toBe(1000);
    expect(s.avgFps).toBeGreaterThanOrEqual(70);
    expect(s.avgFps).toBeLessThanOrEqual(72);
    expect(s.worstMs).toBe(50);
    expect(s.under60).toBe(1.1);
    expect(s.lowFps).toBeGreaterThanOrEqual(40);
    expect(summarise(times, 0).frames).toBe(0);
  });

  it('writes plain result lines', () => {
    const lines = resultLines({
      when: '2026-11-15 10:00', device: 'Meta Quest 3', refreshHz: 72, frames: 2150, avgFps: 71, lowFps: 64, worstMs: 31,
      under60: 0.4, drawCalls: 190, triangles: 184000, tier: 0, features: ['hand-tracking', 'plane-detection'], planes: 9, meshes: 12, anchored: true, errors: 0,
    });
    expect(lines[0]).toBe('Meta Quest 3 at 72 Hz');
    expect(lines[1]).toBe('71 fps average, 64 fps 1% low, worst frame 31 ms');
    expect(lines[3]).toContain('quality full');
  });
});
