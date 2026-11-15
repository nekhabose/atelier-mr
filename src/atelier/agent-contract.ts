/**
 * Shared contract for the stylist agent: the tools it may call, their exact
 * input schemas, the limits of a run, and the validation every tool input
 * passes before it touches the studio. Dependency-free (apart from the
 * stylist vocabulary) so the /api/agent function imports the same
 * definitions the headset executes.
 *
 * The agent can only do what your hands can: read the day, read the closet,
 * dress the form from your own pieces and tailor it. Every action is undoable
 * as one step, and you keep or undo the result.
 */
import { ITEM_KINDS, MOODS, Mood } from './stylist-contract.js';

export const AGENT_GOALS = ['today', 'tomorrow'] as const;
export type AgentGoal = (typeof AGENT_GOALS)[number];

export const AGENT_TOOLS = [
  'check_weather',
  'check_calendar',
  'recall_preferences',
  'search_closet',
  'put_on_form',
  'tailor',
  'finish',
] as const;
export type AgentToolName = (typeof AGENT_TOOLS)[number];

/** Model calls in one run (the server refuses a longer history). */
export const MAX_AGENT_TURNS = 6;
/** Tool calls the headset will execute in one run. */
export const MAX_TOOL_CALLS = 16;
export const MAX_RESULT_CHARS = 3000;
export const MAX_AGENT_BODY = 160_000;
export const TAILOR_MEASURES = ['hem', 'sleeve', 'neckline'] as const;
export type TailorMeasure = (typeof TAILOR_MEASURES)[number];
export const MAX_TAILOR_CM = 20;
export const TOOL_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** One tool call, as the headset executes it (live or on-device). */
export interface AgentToolCall {
  id: string;
  name: AgentToolName;
  input: Record<string, unknown>;
}

/** What the headset sends back for one tool call. */
export interface AgentToolResult {
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

/** One past model turn: its content blocks, echoed unchanged, and the results. */
export interface AgentTurn {
  assistant: unknown[];
  results: AgentToolResult[];
}

/** POST /api/agent */
export interface AgentRequest {
  goal: AgentGoal;
  /** The day being dressed for, local date YYYY-MM-DD. */
  date: string;
  mood: Mood;
  /** What you asked for, in your own words (said or typed), when you did. */
  request?: string;
  turns: AgentTurn[];
}

/** A request in your own words: short plain text only. */
export const MAX_REQUEST = 140;
const REQUEST_PATTERN = /^[\p{L}\p{N} ,.'!?:-]+$/u;

/** The request cleaned for sending, or null when it is empty or not plain words. */
export function cleanRequest(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t || t.length > MAX_REQUEST || !REQUEST_PATTERN.test(t)) return null;
  return t;
}

/** What /api/agent returns: the model's content blocks for this turn. */
export interface AgentReply {
  content: unknown[];
  stop_reason: string | null;
}

const DAY = { type: 'string', enum: ['today', 'tomorrow'] } as const;
const NOTE = {
  type: 'string',
  description: 'Why, in at most 12 words, shown to the user on the plan card.',
} as const;

/**
 * The tool definitions sent to Claude. Strict schemas (enums, required
 * fields, no extra properties); ranges and ids are checked by validateCall.
 */
export const AGENT_TOOL_DEFS = [
  {
    name: 'check_weather',
    description:
      "The forecast for the day you are dressing the user for: high and low in degrees C, chance of rain and a one-word summary (warm, mild, cold or rainy). Says so when no forecast is on the user's device.",
    input_schema: {
      type: 'object',
      properties: { day: DAY },
      required: ['day'],
      additionalProperties: false,
    },
  },
  {
    name: 'check_calendar',
    description:
      "What is on the user's calendar that day, as an occasion: work, interview, date, weekend, party or travel. Only the kind of event is known on the device, never titles, places or people.",
    input_schema: {
      type: 'object',
      properties: { day: DAY },
      required: ['day'],
      additionalProperties: false,
    },
  },
  {
    name: 'recall_preferences',
    description:
      'What the user kept or undid in earlier runs with you, as short preference notes (lengths, colours, fabrics they like or reject). Empty for a new user.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    name: 'search_closet',
    description:
      "The user's own clothes. Each line: id, name, kind, colour, fabric, length, sleeves, times worn, days since last worn, and whether it is on the form now. Only these pieces can be put on the form. Pass an empty list for every kind.",
    input_schema: {
      type: 'object',
      properties: { kinds: { type: 'array', items: { type: 'string', enum: [...ITEM_KINDS] } } },
      required: ['kinds'],
      additionalProperties: false,
    },
  },
  {
    name: 'put_on_form',
    description:
      'Dress the mannequin in pieces from the closet, replacing what is on it: exactly one dress, OR one top and one bottom (trousers or skirt); at most one jacket over either. Returns the measurements on the form.',
    input_schema: {
      type: 'object',
      properties: {
        item_ids: { type: 'array', items: { type: 'string' }, description: 'Closet ids from search_closet.' },
        title: { type: 'string', description: 'A short name for the look, at most 5 words.' },
        note: NOTE,
      },
      required: ['item_ids', 'title', 'note'],
      additionalProperties: false,
    },
  },
  {
    name: 'tailor',
    description: `Adjust the outfit on the form like a tailor, in whole centimetres from -${MAX_TAILOR_CM} to ${MAX_TAILOR_CM}. hem: positive is longer (lower). sleeve: positive is longer. neckline: positive is deeper. Only after put_on_form.`,
    input_schema: {
      type: 'object',
      properties: {
        measure: { type: 'string', enum: [...TAILOR_MEASURES] },
        change_cm: { type: 'integer' },
        note: NOTE,
      },
      required: ['measure', 'change_cm', 'note'],
      additionalProperties: false,
    },
  },
  {
    name: 'finish',
    description:
      'End the run and present the outfit on the form. The user then keeps it or undoes everything you did.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'The look, at most 5 words.' },
        reason: {
          type: 'string',
          description: 'Why this outfit for this day, at most 35 words, naming the weather and the occasion.',
        },
        tip: { type: 'string', description: 'One practical styling tip, at most 18 words.' },
      },
      required: ['title', 'reason', 'tip'],
      additionalProperties: false,
    },
  },
] as const;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}...` : s);
/** Plain words for the plan card (no markup, no control characters). */
export const plain = (v: unknown, n: number): string =>
  typeof v === 'string' ? clip(v.replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim(), n) : '';

export type ValidCall =
  | { name: 'check_weather' | 'check_calendar'; day: 'today' | 'tomorrow' }
  | { name: 'recall_preferences' }
  | { name: 'search_closet'; kinds: string[] }
  | { name: 'put_on_form'; itemIds: string[]; title: string; note: string }
  | { name: 'tailor'; measure: TailorMeasure; cm: number; note: string }
  | { name: 'finish'; title: string; reason: string; tip: string };

/**
 * Check one tool call before it runs. Returns the call in a typed form, or a
 * short error for the model (sent back as an error tool result).
 */
export function validateCall(name: string, input: unknown): ValidCall | { error: string } {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  switch (name) {
    case 'check_weather':
    case 'check_calendar':
      return i.day === 'today' || i.day === 'tomorrow' ? { name, day: i.day } : { error: 'day must be today or tomorrow' };
    case 'recall_preferences':
      return { name };
    case 'search_closet': {
      const kinds = Array.isArray(i.kinds) ? i.kinds : [];
      if (!kinds.every((k) => (ITEM_KINDS as readonly unknown[]).includes(k))) return { error: 'unknown kind' };
      return { name, kinds: kinds as string[] };
    }
    case 'put_on_form': {
      const ids = Array.isArray(i.item_ids) ? i.item_ids : [];
      if (ids.length === 0 || ids.length > 3 || !ids.every((id) => typeof id === 'string' && /^[a-z0-9]{1,16}$/.test(id))) {
        return { error: 'item_ids must be 1 to 3 closet ids' };
      }
      return { name, itemIds: [...new Set(ids as string[])], title: plain(i.title, 40) || 'Your look', note: plain(i.note, 90) };
    }
    case 'tailor': {
      const cm = i.change_cm;
      if (!(TAILOR_MEASURES as readonly unknown[]).includes(i.measure)) return { error: 'measure must be hem, sleeve or neckline' };
      if (typeof cm !== 'number' || !Number.isInteger(cm) || cm === 0 || Math.abs(cm) > MAX_TAILOR_CM) {
        return { error: `change_cm must be a whole number from -${MAX_TAILOR_CM} to ${MAX_TAILOR_CM}, not 0` };
      }
      return { name, measure: i.measure as TailorMeasure, cm, note: plain(i.note, 90) };
    }
    case 'finish':
      return { name, title: plain(i.title, 40) || 'Your look', reason: plain(i.reason, 260), tip: plain(i.tip, 140) };
    default:
      return { error: `unknown tool ${name}` };
  }
}

export const isGoal = (v: unknown): v is AgentGoal => v === 'today' || v === 'tomorrow';
export const isMood = (v: unknown): v is Mood => (MOODS as readonly unknown[]).includes(v);
