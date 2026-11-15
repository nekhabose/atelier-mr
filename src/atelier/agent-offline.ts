/**
 * The stylist agent on the device: when the live agent is not configured,
 * offline, slow or declines, this planner decides the same kind of run and
 * emits the same tool calls (check the weather and calendar, recall your
 * preferences, search the closet, put an outfit on the form, tailor it,
 * finish). The headset executes them through the same tools, so the plan
 * card, Keep and Undo behave exactly as with the live agent.
 */
import type { AgentGoal, AgentToolCall } from './agent-contract.js';
import { AgentMemory, outfitTraits, traitScore } from './agent-memory.js';
import { ParsedRequest, requestWords } from './agent-request.js';
import type { Mood, Occasion, StylistItem, Weather } from './stylist-contract.js';
import { planOffline } from './stylist-engine.js';

/** A closet piece as search_closet reports it. */
export interface AgentPiece extends StylistItem {
  worn: number;
  /** Days since last worn; null when never worn. */
  daysSince: number | null;
  onForm: boolean;
}

/** The day, as check_weather and check_calendar report it. */
export interface AgentDay {
  occasion: Occasion;
  cue?: string;
  weather?: Weather;
}

export interface OfflineInput {
  goal: AgentGoal;
  day: AgentDay;
  mood: Mood;
  pieces: AgentPiece[];
  memory: AgentMemory;
  /** What you asked for in your own words, read on the device. */
  request?: ParsedRequest;
  seed?: number;
}

const OCCASION_NOTE: Record<Occasion, string> = {
  work: 'a workday',
  interview: 'an interview',
  date: 'a date',
  weekend: 'a relaxed day',
  party: 'a party',
  travel: 'travel',
};
const WEATHER_NOTE: Record<Weather, string> = {
  warm: 'a warm day',
  mild: 'a mild day',
  cold: 'the cold',
  rainy: 'the rain',
};

/** Colours close enough to count when you ask for one ("red" takes burgundy). */
const FAMILY: Record<string, string[]> = {
  red: ['red', 'burgundy', 'pink'],
  burgundy: ['burgundy', 'red'],
  pink: ['pink', 'red'],
  brown: ['brown', 'camel'],
  camel: ['camel', 'brown', 'cream'],
  cream: ['cream', 'white'],
  white: ['white', 'cream'],
  blue: ['blue', 'navy'],
  navy: ['navy', 'blue'],
  grey: ['grey', 'silver'],
  silver: ['silver', 'grey'],
  gold: ['gold', 'camel'],
  green: ['green'],
  black: ['black'],
};
const matches = (asked: string[], color: string) => asked.some((a) => (FAMILY[a] ?? [a]).includes(color.toLowerCase()));

/** Freshness: favour pieces you have not worn lately. */
function freshness(outfit: AgentPiece[]): number {
  let s = 0;
  for (const p of outfit) {
    if (p.daysSince === null) s += 0.3;
    else if (p.daysSince >= 14) s += 0.2;
    else if (p.daysSince <= 2) s -= 0.3;
  }
  return s / outfit.length;
}

/** The run, as tool calls. */
export function planAgentOffline(input: OfflineInput): AgentToolCall[] {
  const { goal, day, mood, pieces, memory } = input;
  let n = 0;
  const call = (name: AgentToolCall['name'], args: Record<string, unknown>): AgentToolCall => ({
    id: `on-device-${++n}`,
    name,
    input: args,
  });
  const calls: AgentToolCall[] = [
    call('check_weather', { day: goal }),
    call('check_calendar', { day: goal }),
    call('recall_preferences', {}),
    call('search_closet', { kinds: [] }),
  ];
  // Your words come first: the occasion, weather and mood you named.
  const req = input.request;
  const occasion = req?.occasion ?? day.occasion;
  const weather: Weather = req?.weather ?? day.weather ?? 'mild';
  const plan = planOffline(pieces, occasion, weather, req?.mood ?? mood, req?.colors.length ? 16 : 8, input.seed ?? Date.now());
  if (plan.options.length === 0) {
    calls.push(
      call('finish', {
        title: 'Your closet needs more',
        reason: 'I need a dress, or a top and a bottom, in your closet to dress you. Add pieces with New piece.',
        tip: '',
      }),
    );
    return calls;
  }
  const byId = new Map(pieces.map((p) => [p.id, p]));
  let best = plan.options[0];
  let bestScore = -Infinity;
  plan.options.forEach((option, rank) => {
    const outfit = option.itemIds.map((id) => byId.get(id)!);
    // What you kept or undid before: the average score of this outfit's traits.
    const traits = outfitTraits(outfit);
    let s = -rank * 0.25 + (0.8 * traitScore(memory, traits)) / traits.length + freshness(outfit);
    // Tomorrow: repeat as few of today's pieces as the closet allows, never all of them.
    if (goal === 'tomorrow') {
      const repeats = outfit.filter((p) => p.onForm).length;
      s -= 0.8 * repeats + (repeats === outfit.length ? 3 : 0);
    }
    // A colour you asked for wins over almost everything else.
    if (req?.colors.length && outfit.some((p) => matches(req.colors, p.color))) s += 2;
    if (s > bestScore) {
      bestScore = s;
      best = option;
    }
  });
  const outfit = best.itemIds.map((id) => byId.get(id)!);
  const named = req?.weather ?? day.weather;
  const why = named ? `For ${OCCASION_NOTE[occasion]} and ${WEATHER_NOTE[named]}` : `For ${OCCASION_NOTE[occasion]}`;
  calls.push(call('put_on_form', { item_ids: best.itemIds, title: best.title, note: why }));

  // Tailor where the day asks for it, or where you have kept that change before.
  const base = outfit.find((p) => p.kind === 'dress' || p.kind === 'skirt');
  const short = base && (base.length === 'mini' || base.length === 'knee');
  const sleeved = outfit.find((p) => (p.kind === 'top' || p.kind === 'dress') && p.sleeves === 'long');
  const jacket = outfit.some((p) => p.kind === 'jacket');
  if (short && (weather === 'rainy' || weather === 'cold')) {
    calls.push(call('tailor', { measure: 'hem', change_cm: 8, note: `A longer hem for ${WEATHER_NOTE[weather]}` }));
  } else if (sleeved && weather === 'warm' && !jacket) {
    calls.push(call('tailor', { measure: 'sleeve', change_cm: -15, note: 'Shorter sleeves for the heat' }));
  } else if (short && (memory.traits['tailor:hem-longer'] ?? 0) >= 2) {
    calls.push(call('tailor', { measure: 'hem', change_cm: 5, note: 'You have kept longer hems before' }));
  }

  const asked = req ? requestWords(req) : '';
  // Say so when the closet has nothing in the colour you asked for.
  const missing = req?.colors.length && !pieces.some((p) => matches(req.colors, p.color)) ? `There is nothing ${req.colors.join(' or ')} in your closet yet, so I kept to what suits the day. ` : '';
  const lead = asked ? `You asked for ${asked}. ${missing}` : named ? '' : 'No forecast on this device, so I assumed a mild day. ';
  calls.push(call('finish', { title: best.title, reason: `${lead}${best.reason}`, tip: best.tip }));
  return calls;
}
