/**
 * Daily spending cap. Uses Supabase (shared across all serverless instances)
 * when configured, else an in-memory per-instance counter. On any Supabase
 * error it **fails degraded** to the in-memory counter, so the site never goes
 * down — worst case the cap reverts to its old soft per-instance behavior.
 *
 * Last line of defense: if rate limiting is bypassed, this stops the financial
 * bleed.
 */
import { getSupabase } from "./supabase";

let dailySpend = { usd: 0, resetAt: getNextMidnightUTC() };

function getNextMidnightUTC(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}

function rollover() {
  if (Date.now() > dailySpend.resetAt) {
    dailySpend = { usd: 0, resetAt: getNextMidnightUTC() };
  }
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

/** Configured cap (USD). Editable via Vercel env without a code change. */
export function spendCapUsd(): number {
  const v = Number(process.env.DAILY_SPEND_CAP_USD);
  return Number.isFinite(v) && v > 0 ? v : 40;
}

/** True if adding `costUsd` would stay within today's cap. */
export async function withinCap(costUsd: number): Promise<boolean> {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb
        .from("jobenrich_daily_spend")
        .select("usd")
        .eq("day", todayUTC())
        .maybeSingle();
      if (error) throw error;
      return Number(data?.usd ?? 0) + costUsd <= spendCapUsd();
    } catch (err) {
      console.error("[spendCap] Supabase read failed, using in-memory:", err);
    }
  }
  rollover();
  return dailySpend.usd + costUsd <= spendCapUsd();
}

export async function recordSpend(costUsd: number): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    try {
      const { error } = await sb.rpc("jobenrich_record_spend", { p_day: todayUTC(), p_cost: costUsd });
      if (error) throw error;
      return;
    } catch (err) {
      console.error("[spendCap] Supabase increment failed, using in-memory:", err);
    }
  }
  rollover();
  dailySpend.usd += costUsd;
}

/** Next midnight UTC (when the cap resets). */
export function capResetAt(): number {
  rollover();
  return dailySpend.resetAt;
}
