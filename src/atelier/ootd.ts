/**
 * Outfit of the Day: log what you wear each day and keep a streak.
 * Runtime-only (localStorage). Dates are the user's local calendar days.
 */
const STORAGE_KEY = 'atelier.ootd.v1';

export interface OotdEntry {
  date: string;
  name: string;
}

export interface OotdState {
  lastDate?: string;
  streak: number;
  best: number;
  log: OotdEntry[];
}

export function localDate(d = new Date()): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function yesterday(today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  return localDate(new Date(y, m - 1, d - 1));
}

export function loadOotd(): OotdState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as OotdState;
      if (typeof s.streak === 'number' && Array.isArray(s.log)) return s;
    }
  } catch {
    /* start fresh */
  }
  return { streak: 0, best: 0, log: [] };
}

function save(s: OotdState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

/** The streak as it stands today (0 once a day has been missed). */
export function currentStreak(s: OotdState, today = localDate()): number {
  if (!s.lastDate) return 0;
  return s.lastDate === today || s.lastDate === yesterday(today) ? s.streak : 0;
}

/** A streak that lapsed (last log before yesterday), for a gentle nudge. */
export function lapsedStreak(s: OotdState, today = localDate()): number {
  if (!s.lastDate || s.lastDate === today || s.lastDate === yesterday(today)) return 0;
  return s.streak;
}

export function loggedToday(s: OotdState, today = localDate()): boolean {
  return s.lastDate === today;
}

/**
 * Log today's outfit. Logging again on the same day just renames the entry.
 * Returns whether this call extended the streak.
 */
export function logToday(s: OotdState, name: string, today = localDate()): boolean {
  let extended = false;
  if (s.lastDate === today) {
    const entry = s.log.find((e) => e.date === today);
    if (entry) entry.name = name;
  } else {
    s.streak = s.lastDate === yesterday(today) ? s.streak + 1 : 1;
    s.lastDate = today;
    s.log.push({ date: today, name });
    s.log = s.log.slice(-60);
    extended = true;
  }
  s.best = Math.max(s.best, s.streak);
  save(s);
  return extended;
}
