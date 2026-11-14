/**
 * Read a calendar file (.ics, as exported by Google Calendar, Outlook or
 * Apple Calendar) on the device and turn the coming days into occasions for
 * the stylist: an interview, a party, a trip, work, a relaxed day.
 *
 * Only the date and the kind of day are kept; event titles never leave this
 * function. Handles folded lines, all-day and timed events (UTC, local or
 * TZID), and simple daily or weekly repeats (INTERVAL, BYDAY, COUNT, UNTIL).
 */
import type { Occasion } from './stylist-contract.js';

export interface CalendarDay {
  /** Local date, YYYY-MM-DD. */
  date: string;
  occasion: Occasion;
  /** The kind of event that decided it ("interview", "party"...). */
  cue: string;
}

/** Keyword → occasion, most important first. */
const CUES: { occasion: Occasion; words: string[] }[] = [
  { occasion: 'interview', words: ['interview', 'pitch', 'presentation', 'keynote', 'panel', 'board meeting', 'demo day'] },
  { occasion: 'travel', words: ['flight', 'airport', 'train to', 'trip', 'travel', 'hotel'] },
  { occasion: 'party', words: ['party', 'wedding', 'gala', 'birthday', 'drinks', 'launch', 'reception', 'celebration'] },
  { occasion: 'date', words: ['date', 'dinner', 'anniversary', 'theatre', 'theater', 'concert', 'opera'] },
  { occasion: 'work', words: ['meeting', 'standup', 'stand-up', 'sync', 'review', 'client', '1:1', 'one on one', 'office', 'workshop', 'call', 'sprint', 'retro'] },
  { occasion: 'weekend', words: ['brunch', 'gym', 'hike', 'park', 'market', 'yoga', 'picnic', 'beach'] },
];
const RANK: Occasion[] = CUES.map((c) => c.occasion);

/** The occasion an event title suggests, if any. */
export function occasionFor(summary: string): { occasion: Occasion; cue: string } | null {
  const s = ` ${summary.toLowerCase()} `;
  for (const c of CUES) {
    for (const w of c.words) {
      // Whole words only ("update" is not a date, "brunch" is not "run").
      const re = new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`);
      if (re.test(s)) return { occasion: c.occasion, cue: w };
    }
  }
  return null;
}

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return ymd(new Date(y, m - 1, d + n));
}

/** Unfold continuation lines (RFC 5545 3.1). */
function unfold(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
}

/** DTSTART value → local date. UTC times are converted to this device's day. */
function startDate(value: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, hh, mm, , z] = m;
  if (hh !== undefined && z) {
    return ymd(new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm)));
  }
  return `${y}-${mo}-${d}`;
}

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

interface RawEvent {
  date: string;
  summary: string;
  rrule?: string;
}

/** Dates a (possibly repeating) event falls on within [from, to). */
function occurrences(ev: RawEvent, from: string, to: string): string[] {
  if (!ev.rrule) return ev.date >= from && ev.date < to ? [ev.date] : [];
  const rule = Object.fromEntries(
    ev.rrule.split(';').map((p) => {
      const [k, v] = p.split('=');
      return [k.toUpperCase(), v ?? ''];
    }),
  );
  const freq = rule.FREQ;
  if (freq !== 'DAILY' && freq !== 'WEEKLY') return ev.date >= from && ev.date < to ? [ev.date] : [];
  const interval = Math.max(1, Number(rule.INTERVAL) || 1);
  const count = rule.COUNT ? Number(rule.COUNT) : Infinity;
  const until = rule.UNTIL ? startDate(rule.UNTIL) ?? '9999-12-31' : '9999-12-31';
  const days = rule.BYDAY ? rule.BYDAY.split(',').map((d) => BYDAY.indexOf(d.slice(-2))) : null;
  const out: string[] = [];
  const [y, m, d] = ev.date.split('-').map(Number);
  const startDay = new Date(y, m - 1, d).getDay();
  let n = 0;
  // Walk day by day from the first occurrence (bounded to about two years).
  for (let i = 0; i < 800; i++) {
    const day = new Date(y, m - 1, d + i);
    const date = ymd(day);
    if (date > until || date >= to || n >= count) break;
    let hit: boolean;
    if (freq === 'DAILY') {
      hit = i % interval === 0;
    } else {
      // Day counting (not milliseconds), so daylight-saving changes cannot shift it.
      const weeks = Math.floor((startDay + i) / 7);
      hit = weeks % interval === 0 && (days ? days.includes(day.getDay()) : day.getDay() === startDay);
    }
    if (!hit) continue;
    n++;
    if (date >= from) out.push(date);
  }
  return out;
}

/** Read the VEVENTs of an .ics file. */
export function parseEvents(text: string): RawEvent[] {
  const events: RawEvent[] = [];
  let cur: Partial<RawEvent> | null = null;
  let cancelled = false;
  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') {
      cur = {};
      cancelled = false;
      continue;
    }
    if (line === 'END:VEVENT') {
      if (cur?.date && !cancelled) events.push({ date: cur.date, summary: cur.summary ?? '', rrule: cur.rrule });
      cur = null;
      continue;
    }
    if (!cur) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const name = line.slice(0, colon).split(';')[0].toUpperCase();
    const value = line.slice(colon + 1);
    if (name === 'DTSTART') cur.date = startDate(value) ?? undefined;
    else if (name === 'SUMMARY') cur.summary = value.replace(/\\([,;\\])/g, '$1').replace(/\\n/gi, ' ');
    else if (name === 'RRULE') cur.rrule = value;
    else if (name === 'STATUS' && value.trim().toUpperCase() === 'CANCELLED') cancelled = true;
  }
  return events;
}

/**
 * The coming `days` days from `from` that the calendar says something about:
 * each gets the most important occasion among its events.
 */
export function calendarDays(text: string, from: string, days = 14): { days: CalendarDay[]; events: number } {
  const to = addDays(from, days);
  const best = new Map<string, CalendarDay>();
  let events = 0;
  for (const ev of parseEvents(text)) {
    const hit = occasionFor(ev.summary);
    for (const date of occurrences(ev, from, to)) {
      events++;
      if (!hit) continue;
      const prev = best.get(date);
      if (!prev || RANK.indexOf(hit.occasion) < RANK.indexOf(prev.occasion)) {
        best.set(date, { date, occasion: hit.occasion, cue: hit.cue });
      }
    }
  }
  return { days: [...best.values()].sort((a, b) => a.date.localeCompare(b.date)), events };
}

const KEY = 'atelier.calendar.v1';

export interface SavedCalendar {
  imported: string;
  days: CalendarDay[];
}

export function loadCalendar(): SavedCalendar | null {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) ?? 'null') as SavedCalendar | null;
    return c && Array.isArray(c.days) ? c : null;
  } catch {
    return null;
  }
}

export function saveCalendar(c: SavedCalendar | null): void {
  try {
    if (c) localStorage.setItem(KEY, JSON.stringify(c));
    else localStorage.removeItem(KEY);
  } catch {
    /* fine for this visit */
  }
}
