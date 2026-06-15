/**
 * Level 1 rate limiter — in-memory module-level Map.
 *
 * Caveat (intentional, per the demo-site audit): this does NOT persist across
 * serverless instances or redeployments. A redeploy resets all counters and
 * concurrent instances keep separate counters. Acceptable for a low-traffic
 * demo; move to Upstash Redis (Level 2) once the site sustains 50+ daily users.
 */
const store = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (entry.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count += 1;
  return { allowed: true, remaining: limit - entry.count, resetAt: entry.resetAt };
}

/** Human-readable "in N hours / minutes" for rate-limit error messages. */
export function retryAfter(resetAt: number): string {
  const ms = Math.max(0, resetAt - Date.now());
  const mins = Math.ceil(ms / 60000);
  if (mins >= 60) {
    const hrs = Math.round(mins / 60);
    return `${hrs} hour${hrs === 1 ? "" : "s"}`;
  }
  return `${mins} minute${mins === 1 ? "" : "s"}`;
}
