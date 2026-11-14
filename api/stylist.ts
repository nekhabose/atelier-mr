/**
 * POST /api/stylist – Atelier's AI stylist (Vercel Function, Node runtime).
 *
 * Two modes, both answered with schema-validated JSON:
 *  - style: occasion, weather, mood and the user's closet in; up to three
 *    ranked outfits (closet item ids + explanation) out.
 *  - refine: the outfit on the form plus "warmer" / "dressier" / "colour" in;
 *    a short list of garment edits (length, sleeves, material, colour, an
 *    optional closet jacket) out, which the headset applies to the form.
 *  - boutique: a candidate piece plus precomputed facts (new outfits it
 *    unlocks with the closet, cost per outfit, near-duplicate) in; a verdict
 *    (buy / maybe / skip), a reason and the best pairing out.
 * The API key lives only in the ANTHROPIC_API_KEY environment variable.
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
  COLOR_KEYS,
  KEEP,
  MATERIAL_KEYS,
  MAX_EDITS,
  PieceEdit,
  REFINES,
  RefineReply,
  RefineRequest,
  BoutiqueReply,
  BoutiqueRequest,
  VERDICTS,
  StylistItem,
  StylistReply,
  StylistRequest,
  StylistResponse,
  WEATHERS,
} from '../src/atelier/stylist-contract.js';

const MODEL = 'claude-opus-5-5';
const MAX_BODY = 8_000;
const RATE_LIMIT = 40; // requests per window per IP (per warm instance)
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

const REFINE_SYSTEM = `You are the stylist inside Atelier, a mixed-reality fashion studio. \
An outfit you proposed is on a mannequin. The user asks you to make it warmer, dressier, or add colour. \
Change it with a few concrete garment edits that are applied to the mannequin, and say what you did.

Rules:
- Edit only the outfit pieces listed (ids p0, p1, ...). Use "keep" for anything you leave alone.
- At most ${MAX_EDITS} edits, and only edits that serve the request. Fewer is better.
- length and sleeves use the given vocabulary; material and color must come from the allowed lists.
- addItemId: optionally layer ONE jacket from the closet list (by id) when the outfit has no jacket and \
it serves the request; otherwise "".
- warmer: longer hems and sleeves, warmer materials (wool, knit), a jacket. dressier: refined materials \
(satin, wool), cleaner lengths, structure. colour: one confident colour or pattern, keep the rest calm.
- summary: one sentence (max 30 words), first person, naming what you changed, e.g. \
"Warmer: I layered your black wool jacket and let the skirt down to midi."`;

const EDIT_SCHEMA = {
  type: 'object',
  properties: {
    piece: { type: 'string' },
    length: { type: 'string', enum: [...LENGTHS, KEEP] },
    sleeves: { type: 'string', enum: [...SLEEVES, KEEP] },
    material: { type: 'string', enum: [...MATERIAL_KEYS, KEEP] },
    color: { type: 'string', enum: [...COLOR_KEYS, KEEP] },
  },
  required: ['piece', 'length', 'sleeves', 'material', 'color'],
  additionalProperties: false,
} as const;

const REFINE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    addItemId: { type: 'string' },
    edits: { type: 'array', items: EDIT_SCHEMA },
  },
  required: ['summary', 'addItemId', 'edits'],
  additionalProperties: false,
} as const;

const BOUTIQUE_SYSTEM = `You are the boutique stylist inside Atelier, a mixed-reality fashion studio. \
The user is shopping against their own closet: should they buy this piece? Decide like an honest \
personal stylist who would rather they buy less, better.

Rules:
- The numbers you are given (new outfits it unlocks with the closet, cost per outfit, near-duplicate) \
are computed facts. Use them; never invent or change numbers.
- verdict: "buy" only when it clearly earns its place (several new outfits, fair cost per outfit, not a \
duplicate); "maybe" when useful but not essential; "skip" for duplicates or pieces that add little.
- itemIds: the best outfit with it - "new" plus closet ids. A wearable outfit is exactly one dress, OR one \
top plus one bottom (trousers or skirt), plus at most one jacket.
- reason: one or two sentences, max 35 words, naming which owned pieces it works with and quoting the \
number of new outfits. Warm, direct, no hype.`;

const BOUTIQUE_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: [...VERDICTS] },
    reason: { type: 'string' },
    itemIds: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'reason', 'itemIds'],
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

/** Validate a list of described pieces; null when anything is off. */
function parseItems(raw: unknown, max: number): StylistItem[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > max) return null;
  const items: StylistItem[] = [];
  for (const it of raw as Record<string, unknown>[]) {
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
  return items;
}

/** Strictly validate a style request; returns null when anything is off. */
function parseRequest(raw: unknown): StylistRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!oneOf(OCCASIONS, r.occasion) || !oneOf(WEATHERS, r.weather) || !oneOf(MOODS, r.mood)) {
    return null;
  }
  const items = parseItems(r.items, MAX_ITEMS);
  if (!items) return null;
  return { occasion: r.occasion, weather: r.weather, mood: r.mood, items };
}

/** Strictly validate a boutique request. */
function parseBoutique(raw: unknown): BoutiqueRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.mode !== 'boutique' || !oneOf(OCCASIONS, r.occasion)) return null;
  const items = parseItems(r.items, MAX_ITEMS);
  const cand = parseItems([r.candidate], 1);
  const num = (v: unknown, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;
  if (!items || !cand || cand[0].id !== 'new' || items.some((i) => i.id === 'new')) return null;
  if (!num(r.price, 100_000) || !num(r.newOutfits, 10_000) || !num(r.costPerOutfit, 100_000)) return null;
  if (typeof r.duplicate !== 'string' || (r.duplicate !== '' && !NAME_PATTERN.test(r.duplicate))) return null;
  return {
    mode: 'boutique',
    occasion: r.occasion,
    candidate: cand[0],
    price: r.price as number,
    newOutfits: r.newOutfits as number,
    costPerOutfit: r.costPerOutfit as number,
    duplicate: r.duplicate,
    items,
  };
}

/** Strictly validate a refine request. */
function parseRefine(raw: unknown): RefineRequest | null {
  const base = parseRequest(raw);
  const r = raw as Record<string, unknown>;
  if (!base || r.mode !== 'refine' || !oneOf(REFINES, r.refine)) return null;
  const outfit = parseItems(r.outfit, 4);
  if (!outfit || !outfit.every((i, n) => i.id === `p${n}`)) return null;
  return { ...base, mode: 'refine', refine: r.refine, outfit };
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '...' : s);

const line = (i: StylistItem) =>
  `- id ${i.id}: ${i.name} (${i.kind}; colour ${i.color}; fabric ${i.fabric}; ` +
  `length ${i.length}; sleeves ${i.sleeves})`;

function failure(error: unknown, headers: Record<string, string>): Response {
  if (error instanceof Anthropic.RateLimitError) return json(429, { error: 'busy' }, headers);
  if (error instanceof Anthropic.AuthenticationError) {
    return json(503, { error: 'stylist_not_configured' }, headers);
  }
  if (error instanceof Anthropic.APIError) {
    return json(502, { error: 'upstream_error', status: error.status }, headers);
  }
  return json(502, { error: 'stylist_failed' }, headers);
}

/** Ask Claude for a few concrete edits to the outfit on the form. */
async function refine(req: RefineRequest, headers: Record<string, string>): Promise<Response> {
  const prompt =
    `Request: ${req.refine}\nOccasion: ${req.occasion}\nWeather: ${req.weather}\nMood: ${req.mood}\n\n` +
    `Outfit on the mannequin:\n${req.outfit.map(line).join('\n')}\n\n` +
    `Closet (jackets may be added):\n${req.items.map(line).join('\n')}`;
  const client = new Anthropic({ timeout: 20_000, maxRetries: 1 });
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 3000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: REFINE_SCHEMA } },
      system: REFINE_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    });
    if (response.stop_reason === 'refusal') return json(422, { error: 'declined' }, headers);
    if (response.stop_reason === 'max_tokens') return json(502, { error: 'no_answer' }, headers);
    const block = response.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') return json(502, { error: 'no_answer' }, headers);
    const answer = JSON.parse(block.text) as Partial<RefineReply>;
    const ids = new Set(req.outfit.map((i) => i.id));
    const edits: PieceEdit[] = [];
    for (const e of Array.isArray(answer.edits) ? answer.edits : []) {
      if (
        e &&
        ids.has(e.piece) &&
        oneOf([...LENGTHS, KEEP] as const, e.length) &&
        oneOf([...SLEEVES, KEEP] as const, e.sleeves) &&
        oneOf([...MATERIAL_KEYS, KEEP] as const, e.material) &&
        oneOf([...COLOR_KEYS, KEEP] as const, e.color)
      ) {
        edits.push({ piece: e.piece, length: e.length, sleeves: e.sleeves, material: e.material, color: e.color });
      }
      if (edits.length >= MAX_EDITS) break;
    }
    const jacket = req.items.find((i) => i.id === answer.addItemId && i.kind === 'jacket');
    const hasJacket = req.outfit.some((i) => i.kind === 'jacket');
    const reply: RefineReply = {
      summary: clip(String(answer.summary ?? ''), 200),
      addItemId: jacket && !hasJacket ? jacket.id : '',
      edits,
    };
    if (reply.edits.length === 0 && !reply.addItemId) return json(502, { error: 'no_edits' }, headers);
    return json(200, reply, headers);
  } catch (error) {
    return failure(error, headers);
  }
}

/** Buy, maybe or skip: Claude judges a boutique piece against the closet. */
async function boutique(req: BoutiqueRequest, headers: Record<string, string>): Promise<Response> {
  const facts =
    `Occasion this boutique dresses for: ${req.occasion}\n` +
    `Candidate: ${line(req.candidate)}\nPrice: $${req.price}\n` +
    `New outfits it unlocks with the closet: ${req.newOutfits}\n` +
    `Cost per new outfit: $${req.costPerOutfit}\n` +
    `Near-duplicate already owned: ${req.duplicate || 'none'}\n\n` +
    `Closet:\n${req.items.map(line).join('\n')}`;
  const client = new Anthropic({ timeout: 20_000, maxRetries: 1 });
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 3000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: BOUTIQUE_SCHEMA } },
      system: BOUTIQUE_SYSTEM,
      messages: [{ role: 'user', content: facts }],
    });
    if (response.stop_reason === 'refusal') return json(422, { error: 'declined' }, headers);
    if (response.stop_reason === 'max_tokens') return json(502, { error: 'no_answer' }, headers);
    const block = response.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') return json(502, { error: 'no_answer' }, headers);
    const answer = JSON.parse(block.text) as Partial<BoutiqueReply>;
    if (!oneOf(VERDICTS, answer.verdict)) return json(502, { error: 'no_answer' }, headers);
    const kinds = new Map(req.items.map((i) => [i.id, i.kind as string]));
    kinds.set('new', req.candidate.kind);
    const ids = [...new Set(Array.isArray(answer.itemIds) ? answer.itemIds : [])].filter(
      (id): id is string => typeof id === 'string' && kinds.has(id),
    );
    const pairing = ids.includes('new') && isWearable(ids.map((id) => kinds.get(id)!)) ? ids : [];
    const reply: BoutiqueReply = {
      verdict: answer.verdict,
      reason: clip(String(answer.reason ?? ''), 240),
      itemIds: pairing,
    };
    return json(200, reply, headers);
  } catch (error) {
    return failure(error, headers);
  }
}

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
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  if (body && typeof body === 'object' && (body as Record<string, unknown>).mode === 'boutique') {
    const req = parseBoutique(body);
    if (!req) return json(400, { error: 'invalid_request' }, headers);
    return boutique(req, headers);
  }
  if (body && typeof body === 'object' && (body as Record<string, unknown>).mode === 'refine') {
    const req = parseRefine(body);
    if (!req) return json(400, { error: 'invalid_request' }, headers);
    return refine(req, headers);
  }
  const parsed = parseRequest(body);
  if (!parsed) return json(400, { error: 'invalid_request' }, headers);

  const closet = parsed.items.map(line).join('\n');
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
    return failure(error, headers);
  }
}

// Exported for unit tests (tests/api-validation.test.ts); not HTTP handlers.
export { parseBoutique, parseRefine, parseRequest };
