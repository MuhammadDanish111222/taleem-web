import "server-only";

export const TEST_GENERATOR_RATE_LIMIT = { requests: 8, windowMs: 60_000 } as const;
const hits = new Map<string, number[]>();

/** Best-effort, process-local abuse guard for a stateless BFF. */
export function takeTestGenerationSlot(uid: string, now = Date.now()): boolean {
  const cutoff = now - TEST_GENERATOR_RATE_LIMIT.windowMs;
  const active = (hits.get(uid) ?? []).filter((at) => at > cutoff);
  if (active.length >= TEST_GENERATOR_RATE_LIMIT.requests) {
    hits.set(uid, active);
    return false;
  }
  active.push(now);
  hits.set(uid, active);
  return true;
}

export function clearTestGenerationRateLimitForTests() { hits.clear(); }
