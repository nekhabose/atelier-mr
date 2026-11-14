import { describe, expect, it } from 'vitest';
import { decodeLook, encodeLook } from '../src/atelier/share';
import { LOOKS, cloneLook } from '../src/atelier/looks';
import { RANGES } from '../src/atelier/garments';

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

describe('share links', () => {
  it('round-trips every designer look', () => {
    for (const look of LOOKS) {
      const pieces = cloneLook(look);
      const back = decodeLook(encodeLook(look.name, pieces))!;
      expect(back.name).toBe(look.name);
      expect(back.pieces.length).toBe(pieces.length);
      back.pieces.forEach((p, i) => {
        expect(p.kind).toBe(pieces[i].kind);
        expect(p.fabric).toBe(pieces[i].fabric);
        expect(p.hem).toBeCloseTo(pieces[i].hem, 3);
      });
    }
  });

  it('rejects malformed data', () => {
    expect(decodeLook('')).toBeNull();
    expect(decodeLook('not-base64-json')).toBeNull();
    expect(decodeLook(b64({ v: 2, p: [] }))).toBeNull();
    expect(decodeLook(b64({ v: 1, p: [[9, 'navy-satin', 0, 0, 0, 0, 0, 0]] }))).toBeNull();
    expect(decodeLook('A'.repeat(5000))).toBeNull();
  });

  it('clamps measurements and strips unsafe characters from names', () => {
    const look = decodeLook(b64({ v: 1, n: '<img onerror=x>Gala', p: [[0, 'navy-satin', 99, -5, 0.2, 7, 0.1, 0]] }))!;
    const r = RANGES.dress;
    expect(look.pieces[0].hem).toBe(r.hem!.max);
    expect(look.pieces[0].neck).toBe(r.neck!.min);
    expect(look.pieces[0].fit).toBe(r.fit!.max);
    expect(look.name).not.toMatch(/[<>=]/);
  });

  it('drops pieces with unknown fabric ids', () => {
    expect(decodeLook(b64({ v: 1, n: 'x', p: [[0, '../../etc', 0.5, 0, 0, 0, 0, 0]] }))).toBeNull();
  });
});
