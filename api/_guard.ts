/**
 * Guardrails shared by Atelier's functions (/api/stylist, /api/agent). The
 * leading underscore keeps Vercel from serving this file as a route.
 */

const DEFAULT_ORIGINS = [
  'https://nekhabose.github.io',
  'https://localhost:8090',
  'http://localhost:8090',
];

/**
 * A per-instance request counter that only slows down a single client
 * hammering one warm instance. It is NOT real protection on serverless
 * (instances scale out and restart); use a Vercel Firewall rate-limit rule
 * and an Anthropic workspace spend limit for that.
 */
export function makeLimiter(limit: number, windowMs: number): (ip: string) => boolean {
  const hits = new Map<string, number[]>();
  return (ip: string) => {
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(ip, recent);
    if (hits.size > 5000) hits.clear(); // keep memory bounded
    return recent.length > limit;
  };
}

function allowedOrigins(): string[] {
  const extra = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...DEFAULT_ORIGINS, ...extra];
}

export function originAllowed(origin: string | null, host: string | null): boolean {
  if (!origin) return false;
  if (allowedOrigins().includes(origin)) return true;
  // Same-origin requests from this deployment.
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function cors(origin: string | null): Record<string, string> {
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

export function json(status: number, body: unknown, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

export const clientIp = (request: Request) => (request.headers.get('x-forwarded-for') ?? 'local').split(',')[0].trim();

export function preflight(request: Request): Response {
  const origin = request.headers.get('origin');
  if (!originAllowed(origin, request.headers.get('host'))) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: cors(origin) });
}
