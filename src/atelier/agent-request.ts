/**
 * A request in your own words ("a dinner date tonight, something red",
 * "what should I wear to a wedding tomorrow, it's cold"), read on the device:
 * the day, the occasion, the weather, the mood and any colours. The live
 * agent reads the words themselves; the on-device agent plans from this.
 */
import type { AgentGoal } from './agent-contract.js';
import { occasionFor } from './calendar.js';
import type { Mood, Occasion, Weather } from './stylist-contract.js';

export interface ParsedRequest {
  goal: AgentGoal;
  occasion?: Occasion;
  /** The word that decided the occasion ("wedding"). */
  cue?: string;
  weather?: Weather;
  mood?: Mood;
  /** Closet colour keys asked for, in order. */
  colors: string[];
}

const has = (s: string, words: string[]) => words.some((w) => new RegExp(`(^|[^a-z])${w}([^a-z]|$)`).test(s));

const WEATHER: [Weather, string[]][] = [
  ['rainy', ['rain', 'rainy', 'raining', 'wet', 'showers', 'storm']],
  ['cold', ['cold', 'chilly', 'freezing', 'snow', 'winter', 'frosty']],
  ['warm', ['hot', 'warm', 'heat', 'sunny', 'summer', 'humid']],
  ['mild', ['mild', 'spring', 'autumn', 'fall']],
];
const MOOD: [Mood, string[]][] = [
  ['bold', ['bold', 'statement', 'stand out', 'colourful', 'colorful', 'sparkle', 'sparkly', 'glam', 'glamorous', 'fun']],
  ['relaxed', ['relaxed', 'comfy', 'comfortable', 'casual', 'easy', 'chill', 'cosy', 'cozy']],
  ['classic', ['classic', 'elegant', 'timeless', 'simple', 'polished', 'sharp', 'smart', 'minimal']],
];
/** Colour words to the closet's colour keys. */
const COLOURS: [string, string[]][] = [
  ['red', ['red', 'crimson', 'scarlet']],
  ['burgundy', ['burgundy', 'wine', 'oxblood', 'garnet', 'maroon']],
  ['pink', ['pink', 'blush', 'rose']],
  ['black', ['black', 'noir']],
  ['white', ['white']],
  ['cream', ['cream', 'ivory', 'beige', 'nude']],
  ['brown', ['brown', 'chocolate', 'cocoa', 'mocha']],
  ['camel', ['camel', 'tan']],
  ['green', ['green', 'emerald', 'olive', 'sage']],
  ['blue', ['blue']],
  ['navy', ['navy']],
  ['grey', ['grey', 'gray', 'charcoal']],
  ['gold', ['gold', 'golden', 'champagne']],
  ['silver', ['silver', 'metallic']],
];

export function parseRequest(text: string): ParsedRequest {
  const s = ` ${text.toLowerCase().replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ')} `;
  const out: ParsedRequest = { goal: has(s, ['tomorrow']) ? 'tomorrow' : 'today', colors: [] };
  const occ = occasionFor(text) ?? (has(s, ['job', 'hiring']) ? { occasion: 'interview' as Occasion, cue: 'interview' } : null);
  if (occ) {
    out.occasion = occ.occasion;
    out.cue = occ.cue;
  } else if (has(s, ['work', 'office'])) {
    out.occasion = 'work';
    out.cue = 'work';
  } else if (has(s, ['weekend', 'saturday', 'sunday', 'errands', 'coffee'])) {
    out.occasion = 'weekend';
    out.cue = 'the weekend';
  }
  out.weather = WEATHER.find(([, w]) => has(s, w))?.[0];
  out.mood = MOOD.find(([, w]) => has(s, w))?.[0];
  for (const [key, words] of COLOURS) if (has(s, words)) out.colors.push(key);
  return out;
}

/** Is this a request for an outfit (and not a tailoring instruction)? */
export function isStylingRequest(text: string): boolean {
  const s = ` ${text.toLowerCase().replace(/[^a-z' ]/g, ' ')} `;
  if (has(s, ['shorter', 'longer', 'sleeve', 'sleeves', 'hem', 'neckline', 'waist', 'tighter', 'looser', 'midi length'])) return false;
  const p = parseRequest(text);
  return (
    !!p.occasion ||
    !!p.weather ||
    has(s, ['wear', 'wearing', 'dress me', 'outfit', 'what should i', 'going to', 'tonight', 'tomorrow', 'get me ready'])
  );
}

/** "a date, cold, something red" (for the plan card and the reason). */
export function requestWords(p: ParsedRequest): string {
  const parts: string[] = [];
  if (p.cue) {
    const article = p.cue === 'the weekend' || p.cue.endsWith('s') ? '' : /^[aeiou]/.test(p.cue) ? 'an ' : 'a ';
    parts.push(`${article}${p.cue}`);
  }
  if (p.weather) parts.push(p.weather);
  if (p.mood) parts.push(`${p.mood} mood`);
  if (p.colors.length) parts.push(`something ${p.colors.join(' or ')}`);
  return parts.join(', ');
}
