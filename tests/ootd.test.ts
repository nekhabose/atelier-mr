import { describe, expect, it } from 'vitest';
import { currentStreak, lapsedStreak, logToday, OotdState } from '../src/atelier/ootd';

const fresh = (): OotdState => ({ streak: 0, best: 0, log: [] });

describe('outfit of the day streak', () => {
  it('counts consecutive days and keeps the best', () => {
    const s = fresh();
    expect(logToday(s, 'A', '2026-11-10')).toBe(true);
    expect(logToday(s, 'B', '2026-11-11')).toBe(true);
    expect(logToday(s, 'C', '2026-11-12')).toBe(true);
    expect(currentStreak(s, '2026-11-12')).toBe(3);
    expect(s.best).toBe(3);
  });

  it('logging twice in a day renames instead of extending', () => {
    const s = fresh();
    logToday(s, 'A', '2026-11-10');
    expect(logToday(s, 'B', '2026-11-10')).toBe(false);
    expect(s.log).toEqual([{ date: '2026-11-10', name: 'B' }]);
  });

  it('a missed day resets the streak and reports the lapse', () => {
    const s = fresh();
    logToday(s, 'A', '2026-11-10');
    logToday(s, 'B', '2026-11-11');
    expect(currentStreak(s, '2026-11-14')).toBe(0);
    expect(lapsedStreak(s, '2026-11-14')).toBe(2);
    logToday(s, 'C', '2026-11-14');
    expect(currentStreak(s, '2026-11-14')).toBe(1);
    expect(s.best).toBe(2);
  });

  it('crosses month ends', () => {
    const s = fresh();
    logToday(s, 'A', '2026-11-30');
    logToday(s, 'B', '2026-12-01');
    expect(currentStreak(s, '2026-12-01')).toBe(2);
  });
});
