/**
 * Accessibility settings, shared by every system and the 2D start page.
 *
 *  - largeText: panels are drawn larger and a little closer.
 *  - highContrast: panel text turns pure white / bright gold on the dark panels.
 *  - calmMotion: no bouncing, sliding or spinning animations (things just appear).
 *  - readAloud: panel changes are spoken (Web Speech API, where available).
 *  - voice: spoken commands ("style me", "undo", "shorter"...), where the
 *    browser supports speech recognition.
 *
 * Defaults follow the operating system's "reduce motion" and "more contrast"
 * preferences. Stored on this device only.
 */
export interface AccessSettings {
  largeText: boolean;
  highContrast: boolean;
  calmMotion: boolean;
  readAloud: boolean;
  voice: boolean;
}

export type AccessKey = keyof AccessSettings;

export const ACCESS_LABELS: Record<AccessKey, string> = {
  largeText: 'Large text',
  highContrast: 'High contrast',
  calmMotion: 'Calm motion',
  readAloud: 'Read aloud',
  voice: 'Voice commands',
};

const KEY = 'atelier.access.v1';

function prefers(query: string): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia(query).matches;
  } catch {
    return false;
  }
}

function load(): AccessSettings {
  const base: AccessSettings = {
    largeText: false,
    highContrast: prefers('(prefers-contrast: more)'),
    calmMotion: prefers('(prefers-reduced-motion: reduce)'),
    readAloud: false,
    voice: false,
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw) as Partial<Record<AccessKey, unknown>>;
    for (const k of Object.keys(base) as AccessKey[]) {
      if (typeof saved[k] === 'boolean') base[k] = saved[k] as boolean;
    }
  } catch {
    /* storage unavailable or corrupt: defaults */
  }
  return base;
}

const state: AccessSettings = load();
const listeners = new Set<(s: Readonly<AccessSettings>, changed: AccessKey | null) => void>();

export const access = {
  get settings(): Readonly<AccessSettings> {
    return state;
  },
  get calmMotion(): boolean {
    return state.calmMotion;
  },
  set(key: AccessKey, value: boolean): void {
    if (state[key] === value) return;
    state[key] = value;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* fine: applies for this visit */
    }
    for (const fn of listeners) fn(state, key);
  },
  toggle(key: AccessKey): boolean {
    this.set(key, !state[key]);
    return state[key];
  },
  /** Subscribe; called once immediately. Returns the unsubscribe function. */
  subscribe(fn: (s: Readonly<AccessSettings>, changed: AccessKey | null) => void): () => void {
    listeners.add(fn);
    fn(state, null);
    return () => listeners.delete(fn);
  },
};
