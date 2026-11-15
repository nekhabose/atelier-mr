/**
 * Client for /api/stylist (Vercel Function). Every call has a hard timeout
 * and resolves to null on any failure, so callers always have their offline
 * answer ready and never wait on the network in the headset.
 */
export const STYLIST_ENDPOINT: string = import.meta.env.VITE_STYLIST_URL || 'api/stylist';
export const STYLIST_TIMEOUT_MS = 8_000;

/** The stylist agent's turn endpoint, beside the stylist's. */
export const AGENT_ENDPOINT: string = STYLIST_ENDPOINT.replace(/stylist$/, 'agent');
/** One agent turn may take longer than a single stylist answer. */
export const AGENT_TIMEOUT_MS = 20_000;

export function postStylist<T>(body: object, timeoutMs = STYLIST_TIMEOUT_MS): Promise<T | null> {
  return postJson<T>(STYLIST_ENDPOINT, body, timeoutMs);
}

export function postAgent<T>(body: object, timeoutMs = AGENT_TIMEOUT_MS): Promise<T | null> {
  return postJson<T>(AGENT_ENDPOINT, body, timeoutMs);
}

async function postJson<T>(url: string, body: object, timeoutMs: number): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
