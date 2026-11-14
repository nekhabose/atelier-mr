import { describe, expect, it } from 'vitest';
import { heightFromEyes, markFromBody, BodyMark } from '../src/atelier/body-mark';
import { describeDay, forecastUrl, parseForecast, weatherFor } from '../src/atelier/weather';
import { calendarDays, occasionFor } from '../src/atelier/calendar';
import { costPerWear, itemsOnForm, leastWorn, recordWear, WearInfo, wearLine } from '../src/atelier/wear';
import { blockers, clearanceText, findClearance, Obstacle, overlaps, toWorld } from '../src/atelier/clearance';
import { piece } from '../src/atelier/looks';

describe('mark it on yourself', () => {
  // A 1.72 m person standing at the origin, facing -Z (right is +X).
  const base = { head: { x: 0, y: 0.935 * 1.72, z: 0 }, right: { x: 1, z: 0 }, floorY: 0, height: 1.72 };
  const mark = (x: number, y: number, z = -0.12, extra: Partial<typeof base> = {}) =>
    markFromBody({ ...base, ...extra, point: { x, y, z } });

  it('reads a pinch at the knee as a hem at that height', () => {
    const m = mark(0.08, 0.5) as BodyMark;
    expect(m.param).toBe('hem');
    expect(m.value).toBeCloseTo(0.5, 2);
    expect(m.cm).toBe(50);
  });

  it('scales to your height: a 1.60 m knee mark lands at the form knee', () => {
    const h = 1.6;
    const m = mark(0.07, 0.465, -0.1, { height: h, head: { x: 0, y: 0.935 * h, z: 0 } }) as BodyMark;
    expect(m.param).toBe('hem');
    expect(m.value).toBeCloseTo(0.5, 2);
    expect(m.cm).toBe(47);
  });

  it('reads a pinch at the side, at the wrist, as a sleeve length', () => {
    const m = mark(0.26, 0.86, -0.02) as BodyMark;
    expect(m.param).toBe('sleeve');
    expect(m.value).toBeGreaterThan(0.45);
    expect(m.value).toBeLessThanOrEqual(0.6);
  });

  it('reads a pinch high on the chest as a neckline depth', () => {
    const m = mark(0.0, 1.35) as BodyMark;
    expect(m.param).toBe('neck');
    expect(m.value).toBeCloseTo(0.082, 2);
  });

  it('refuses pinches above the collar or away from you', () => {
    expect(mark(0, 1.5)).toBe('high');
    expect(mark(0, 1.0, -1.1)).toBe('far');
  });

  it('estimates height from eye height, within adult limits', () => {
    expect(heightFromEyes(1.608, 0)).toBeCloseTo(1.72, 2);
    expect(heightFromEyes(0.9, 0)).toBe(1.45);
  });
});

describe('local weather', () => {
  it('maps the day to the stylist weather', () => {
    expect(weatherFor(0, 27, 0)).toBe('warm');
    expect(weatherFor(2, 17, 10)).toBe('mild');
    expect(weatherFor(3, 8, 10)).toBe('cold');
    expect(weatherFor(61, 15, 80)).toBe('rainy');
    expect(weatherFor(73, 1, 90)).toBe('cold');
  });

  it('sends only a rounded location', () => {
    const url = forecastUrl(51.50735, -0.12776);
    expect(url).toContain('latitude=51.5&longitude=-0.1');
    expect(url).not.toContain('51.507');
  });

  it('parses an Open-Meteo response and skips gaps', () => {
    const f = parseForecast(
      {
        daily: {
          time: ['2026-11-14', '2026-11-15', '2026-11-16'],
          weather_code: [61, 1, null],
          temperature_2m_max: [9.4, 13, 12],
          temperature_2m_min: [4, 6, 5],
          precipitation_probability_max: [85, 5, 10],
        },
      },
      '2026-11-14',
    )!;
    expect(f.days).toHaveLength(2);
    expect(f.days[0].weather).toBe('rainy');
    expect(describeDay(f.days[0])).toBe('9°C, rain likely');
    expect(describeDay(f.days[1])).toBe('13°C, clear');
    expect(parseForecast({ error: true }, '2026-11-14')).toBeNull();
  });
});

describe('calendar file', () => {
  const ics = [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'DTSTART;TZID=Europe/London:20261116T100000',
    'SUMMARY:Interview with Studio',
    ' Nord',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART;VALUE=DATE:20261121',
    'SUMMARY:Maya\\, birthday party',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART:20261102T090000',
    'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231T000000Z',
    'SUMMARY:Team standup',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART:20261119T190000',
    'SUMMARY:Dinner date',
    'STATUS:CANCELLED',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART:20261120T190000',
    'SUMMARY:Project update',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  it('turns the coming days into occasions, the most important per day', () => {
    const { days } = calendarDays(ics, '2026-11-14', 8);
    const by = Object.fromEntries(days.map((d) => [d.date, d.occasion]));
    // Monday has both a standup and the interview: the interview wins.
    expect(by['2026-11-16']).toBe('interview');
    expect(by['2026-11-18']).toBe('work');
    expect(by['2026-11-21']).toBe('party');
    // Cancelled events and unrelated words ("update" is not a date) are ignored.
    expect(by['2026-11-19']).toBeUndefined();
    expect(by['2026-11-20']).toBeUndefined();
    expect(days.every((d) => !('summary' in d))).toBe(true);
  });

  it('matches whole words only', () => {
    expect(occasionFor('Flight to Lisbon')?.occasion).toBe('travel');
    expect(occasionFor('Quarterly update')).toBeNull();
    expect(occasionFor('Brunch with Sam')?.occasion).toBe('weekend');
  });
});

describe('wear and cost per wear', () => {
  const top = piece({ kind: 'top', fabric: 'closet:cotton:white' });
  const skirt = piece({ kind: 'skirt', fabric: 'closet:check:camel' });
  const items = (): WearInfo[] => [
    { id: 'a', name: 'White top', piece: top, price: 30, added: '2026-10-01' },
    { id: 'b', name: 'Camel skirt', piece: skirt, price: 90, added: '2026-09-01' },
  ];

  it('finds the closet pieces on the form even after tailoring', () => {
    const list = items();
    expect(itemsOnForm(list, [{ ...top, hem: top.hem - 0.05 }]).sort()).toEqual(['a']);
    expect(itemsOnForm(list, [top, skirt]).sort()).toEqual(['a', 'b']);
  });

  it('logs a wear once per day and divides the price by wears', () => {
    const [a] = items();
    expect(costPerWear(a)).toBe('$30, not worn yet');
    expect(recordWear(a, '2026-11-13')).toBe(true);
    expect(recordWear(a, '2026-11-13')).toBe(false);
    recordWear(a, '2026-11-14');
    expect(costPerWear(a)).toBe('$15 a wear');
    expect(wearLine(a, '2026-11-14')).toBe('Worn 2 times, last today. $15 a wear.');
  });

  it('picks the least worn piece: never worn and oldest first', () => {
    const list = items();
    expect(leastWorn(list, '2026-11-14')?.id).toBe('b');
    recordWear(list[1], '2026-11-14');
    expect(leastWorn(list, '2026-11-14')?.id).toBe('a');
  });

  it('breaks ties in favour of a piece not on the form', () => {
    const list = items().map((i) => ({ ...i, added: '2026-11-14' }));
    expect(leastWorn(list, '2026-11-14')?.id).toBe('a');
    expect(leastWorn(list, '2026-11-14', ['a'])?.id).toBe('b');
  });
});

describe('furniture-aware placement', () => {
  const table: Obstacle = { x: -0.6, z: -1.5, hx: 0.5, hz: 0.3, yaw: 0, label: 'table' };
  const form = [{ x: 0, z: -1.55, r: 0.36 }];

  it('rotates frames like three.js', () => {
    const w = toWorld({ x: 1, z: 2, yaw: Math.PI / 2 }, 0, -1);
    // Facing -X after a quarter turn: one metre ahead is x - 1.
    expect(w.x).toBeCloseTo(0);
    expect(w.z).toBeCloseTo(2);
  });

  it('detects a circle overlapping a rotated rectangle', () => {
    expect(overlaps(0, -1.5, 0.2, table)).toBe(true);
    expect(overlaps(0.2, -1.5, 0.2, table)).toBe(false);
    const turned = { ...table, yaw: Math.PI / 2 };
    // Now 0.6 m deep along x: reaches from -0.9 to -0.3.
    expect(overlaps(-0.05, -1.5, 0.2, turned)).toBe(false);
  });

  it('slides the studio sideways until the form is clear', () => {
    const frame = { x: 0, z: 0, yaw: 0 };
    expect(blockers(form, frame, [table])).toEqual(['table']);
    const c = findClearance(form, frame, [table]);
    expect(c.clear).toBe(true);
    expect(c.dx).toBeGreaterThan(0);
    expect(blockers(form, { x: c.dx, z: c.dz, yaw: 0 }, [table])).toEqual([]);
    expect(clearanceText(c)).toBe('Moved the studio 30 cm right to clear your table.');
  });

  it('leaves a clear spot alone and reports when nothing is clear', () => {
    expect(findClearance(form, { x: 3, z: 0, yaw: 0 }, [table]).blockedBy).toEqual([]);
    const wall: Obstacle = { x: 0, z: -1.5, hx: 3, hz: 1.5, yaw: 0, label: 'sofa' };
    const c = findClearance(form, { x: 0, z: 0, yaw: 0 }, [wall]);
    expect(c.clear).toBe(false);
    expect(clearanceText(c)).toContain('Your sofa is in the way');
  });
});

describe('mark it on yourself: ray pinches are not marks', () => {
  it('ignores a pinch held out in front to point at a panel', () => {
    const r = markFromBody({
      head: { x: 0, y: 1.6, z: 0 },
      right: { x: 1, z: 0 },
      floorY: 0,
      height: 1.72,
      point: { x: 0.15, y: 1.15, z: -0.4 },
    });
    expect(r).toBe('far');
  });
});
