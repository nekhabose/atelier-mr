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
