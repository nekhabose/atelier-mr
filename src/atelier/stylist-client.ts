/**
 * Client for /api/stylist (Vercel Function). Every call has a hard timeout
 * and resolves to null on any failure, so callers always have their offline
 * answer ready and never wait on the network in the headset.
 */
export const STYLIST_ENDPOINT: string = import.meta.env.VITE_STYLIST_URL || 'api/stylist';
export const STYLIST_TIMEOUT_MS = 8_000;

export async function postStylist<T>(body: object, timeoutMs = STYLIST_TIMEOUT_MS): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(STYLIST_ENDPOINT, {
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
