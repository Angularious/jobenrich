/**
 * Per-visitor, per-step rate limiter. Uses Supabase (shared across all
 * serverless instances, so the limit is truly per-user) when configured, else
 * an in-memory per-instance Map. On any Supabase error it **fails degraded** to
 * the in-memory store — acceptable: worst case the limit reverts to its old
 * soft per-instance behavior, the global spend cap still backstops cost.
 */
import { getSupabase } from "./supabase";

const store = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

function inMemory(key: string, limit: number, windowMs: number): RateLimitResult {
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

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb.rpc("jobenrich_check_rate_limit", {
        p_key: key,
        p_limit: limit,
        p_window_secs: Math.round(windowMs / 1000),
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error("empty check_rate_limit result");
      return {
        allowed: Boolean(row.allowed),
        remaining: Number(row.remaining ?? 0),
        resetAt: new Date(row.reset_at).getTime(),
      };
    } catch (err) {
      console.error("[rateLimit] Supabase failed, using in-memory:", err);
    }
  }
  return inMemory(key, limit, windowMs);
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
