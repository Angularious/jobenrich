/**
 * Level 1 daily spending cap — in-memory, resets at midnight UTC.
 *
 * Last line of defense: if rate limiting is bypassed, this stops the financial
 * bleed. Same Level 1 caveat as the rate limiter — in-memory means a redeploy
 * resets the counter and concurrent instances track separately, so true spend
 * could exceed the cap by ~(number of warm instances). Fine for a demo.
 */
let dailySpend = { usd: 0, resetAt: getNextMidnightUTC() };

function getNextMidnightUTC(): number {
  const now = new Date();
  const midnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  );
  return midnight.getTime();
}

function rollover() {
  if (Date.now() > dailySpend.resetAt) {
    dailySpend = { usd: 0, resetAt: getNextMidnightUTC() };
  }
}

/** Configured cap (USD). Editable via Vercel env without a code change. */
export function spendCapUsd(): number {
  const v = Number(process.env.DAILY_SPEND_CAP_USD);
  return Number.isFinite(v) && v > 0 ? v : 40;
}

/** True if adding `costUsd` would stay within today's cap. */
export function withinCap(costUsd: number): boolean {
  rollover();
  return dailySpend.usd + costUsd <= spendCapUsd();
}

export function recordSpend(costUsd: number): void {
  rollover();
  dailySpend.usd += costUsd;
}

export function capResetAt(): number {
  rollover();
  return dailySpend.resetAt;
}
