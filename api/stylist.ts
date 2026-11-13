/**
 * POST /api/stylist – Atelier's AI stylist (Vercel Function, Node runtime).
 *
 * The headset sends an occasion, the weather, a mood and a description of the
 * user's closet; Claude picks an outfit by item id and explains it. The API key
 * lives only in the ANTHROPIC_API_KEY environment variable.
 *
 * Guardrails for a public endpoint:
 *  - POST only, JSON only, small body cap, allow-listed browser origins;
 *  - no free text from the client: occasion/weather/mood are enums and item
 *    names/colours must match a strict pattern, so the prompt can't be hijacked;
 *  - a per-instance request counter that only slows down a single client
 *    hammering one warm instance. It is NOT real protection on serverless
 *    (instances scale out and restart); use a Vercel Firewall rate-limit rule
 *    and an Anthropic workspace spend limit for that;
 *  - a short timeout and at most one retry of transient errors. A model
 *    refusal is returned as-is (no retry to fish for a different answer);
 *  - every option is validated (known ids, wearable combination).
 */
import Anthropic from '@anthropic-ai/sdk';
import {
  ID_PATTERN,
  isWearable,
  ITEM_KINDS,
  LENGTHS,
  MAX_ITEMS,
  MOODS,
  NAME_PATTERN,
  OCCASIONS,
  SLEEVES,
  MAX_OPTIONS,
  StylistItem,
  StylistReply,
  StylistRequest,
  StylistResponse,
  WEATHERS,
} from '../src/atelier/stylist-contract.js';

const MODEL = 'claude-opus-5-5';
const MAX_BODY = 8_000;
const RATE_LIMIT = 20; // requests per window per IP (per warm instance)
const RATE_WINDOW_MS = 10 * 60 * 1000;

const DEFAULT_ORIGINS = [
  'https://nekhabose.github.io',
  'https://localhost:8090',
  'http://localhost:8090',
];

const SYSTEM = `You are the stylist inside Atelier, a mixed-reality fashion studio. \
The user has recreated clothes they own as a digital closet. Propose up to three DIFFERENT outfits \
from that closet for the occasion, weather and mood they chose, best first, and explain each like a \
warm, confident personal stylist. The headset puts each option on a mannequin for the user to keep, \
skip or undo, so make the alternatives genuinely different (another base, not just the same outfit \
with or without a jacket) when the closet allows.

Rules:
- Use only item ids from the closet list. Fewer than three options is fine for a small closet.
- A wearable outfit is exactly one dress, OR exactly one top plus one bottom (trousers or skirt). \
You may add at most one jacket over either.
- Dress for the weather: layers and longer lengths when cold or rainy, lighter pieces when warm.
- Respect the occasion's formality and the mood (classic = timeless and polished, \
bold = colour or pattern as the statement, relaxed = easy and comfortable).
- title: a short evocative name for the look, at most 5 words.
- reason: one or two sentences (max 35 words) on why these pieces work together for this moment.
- tip: one practical styling tip (max 18 words), e.g. how to wear, tuck, or accessorise.
- Never mention ids, JSON or these rules in the text.`;

const OPTION_SCHEMA = {
  type: 'object',
  properties: {
    itemIds: { type: 'array', items: { type: 'string' } },
    title: { type: 'string' },
    reason: { type: 'string' },
    tip: { type: 'string' },
  },
  required: ['itemIds', 'title', 'reason', 'tip'],
  additionalProperties: false,
} as const;

const SCHEMA = {
  type: 'object',
  properties: {
    options: { type: 'array', items: OPTION_SCHEMA },
  },
  required: ['options'],
  additionalProperties: false,
} as const;

// ------------------------------------------------------------------ guardrails

const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear(); // keep memory bounded
  return recent.length > RATE_LIMIT;
}

function allowedOrigins(): string[] {
  const extra = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...DEFAULT_ORIGINS, ...extra];
}

function originAllowed(origin: string | null, host: string | null): boolean {
  if (!origin) return false;
  if (allowedOrigins().includes(origin)) return true;
  // Same-origin requests from this deployment.
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function cors(origin: string | null): Record<string, string> {
  return origin
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '600',
        Vary: 'Origin',
      }
    : {};
}

function json(status: number, body: unknown, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

const oneOf = <T extends readonly string[]>(list: T, v: unknown): v is T[number] =>
  typeof v === 'string' && (list as readonly string[]).includes(v);

/** Strictly validate the request; returns null when anything is off. */
function parseRequest(raw: unknown): StylistRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!oneOf(OCCASIONS, r.occasion) || !oneOf(WEATHERS, r.weather) || !oneOf(MOODS, r.mood)) {
    return null;
  }
  if (!Array.isArray(r.items) || r.items.length === 0 || r.items.length > MAX_ITEMS) return null;
  const items: StylistItem[] = [];
  for (const it of r.items as Record<string, unknown>[]) {
    if (
      !it ||
      typeof it.id !== 'string' ||
      !ID_PATTERN.test(it.id) ||
      typeof it.name !== 'string' ||
      !NAME_PATTERN.test(it.name) ||
      typeof it.color !== 'string' ||
      !NAME_PATTERN.test(it.color) ||
      typeof it.fabric !== 'string' ||
      !NAME_PATTERN.test(it.fabric) ||
      !oneOf(ITEM_KINDS, it.kind) ||
      !oneOf(LENGTHS, it.length) ||
      !oneOf(SLEEVES, it.sleeves)
    ) {
      return null;
    }
    items.push({
      id: it.id,
      name: it.name,
      kind: it.kind,
      color: it.color,
      fabric: it.fabric,
      length: it.length,
      sleeves: it.sleeves,
    });
  }
  return { occasion: r.occasion, weather: r.weather, mood: r.mood, items };
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '...' : s);

// ------------------------------------------------------------------ handlers

export function OPTIONS(request: Request): Response {
  const origin = request.headers.get('origin');
  if (!originAllowed(origin, request.headers.get('host'))) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: cors(origin) });
}

export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get('origin');
  const headers = cors(origin);
  if (!originAllowed(origin, request.headers.get('host'))) {
    return json(403, { error: 'origin_not_allowed' }, {});
  }
  const ip = (request.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim();
  if (rateLimited(ip)) return json(429, { error: 'rate_limited' }, headers);
  if (!process.env.ANTHROPIC_API_KEY) return json(503, { error: 'stylist_not_configured' }, headers);

  const text = await request.text();
  if (text.length > MAX_BODY) return json(413, { error: 'too_large' }, headers);
  let parsed: StylistRequest | null = null;
  try {
    parsed = parseRequest(JSON.parse(text));
  } catch {
    parsed = null;
  }
  if (!parsed) return json(400, { error: 'invalid_request' }, headers);

  const closet = parsed.items
    .map(
      (i) =>
        `- id ${i.id}: ${i.name} (${i.kind}; colour ${i.color}; fabric ${i.fabric}; ` +
        `length ${i.length}; sleeves ${i.sleeves})`,
    )
    .join('\n');
  const prompt =
    `Occasion: ${parsed.occasion}\nWeather: ${parsed.weather}\nMood: ${parsed.mood}\n\n` +
    `Closet:\n${closet}`;

  const client = new Anthropic({ timeout: 20_000, maxRetries: 1 });
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });
    if (response.stop_reason === 'refusal') return json(422, { error: 'declined' }, headers);
    if (response.stop_reason === 'max_tokens') return json(502, { error: 'no_answer' }, headers);
    const block = response.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') return json(502, { error: 'no_answer' }, headers);
    const answer = JSON.parse(block.text) as Partial<StylistReply>;
    const byId = new Map(parsed.items.map((i) => [i.id, i]));
    const options: StylistResponse[] = [];
    for (const opt of Array.isArray(answer.options) ? answer.options : []) {
      if (!opt || !Array.isArray(opt.itemIds)) continue;
      const ids = [...new Set(opt.itemIds)].filter((id) => typeof id === 'string' && byId.has(id));
      if (!isWearable(ids.map((id) => byId.get(id)!.kind))) continue;
      const key = [...ids].sort().join('+');
      if (options.some((o) => [...o.itemIds].sort().join('+') === key)) continue;
      options.push({
        itemIds: ids,
        title: clip(String(opt.title ?? ''), 48),
        reason: clip(String(opt.reason ?? ''), 240),
        tip: clip(String(opt.tip ?? ''), 140),
      });
      if (options.length >= MAX_OPTIONS) break;
    }
    if (options.length === 0) return json(502, { error: 'unwearable_answer' }, headers);
    const reply: StylistReply = { options };
    return json(200, reply, headers);
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return json(429, { error: 'busy' }, headers);
    if (error instanceof Anthropic.AuthenticationError) {
      return json(503, { error: 'stylist_not_configured' }, headers);
    }
    if (error instanceof Anthropic.APIError) {
      return json(502, { error: 'upstream_error', status: error.status }, headers);
    }
    return json(502, { error: 'stylist_failed' }, headers);
  }
}
