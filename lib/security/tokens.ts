import crypto from "crypto";

/**
 * Short-lived signed tokens issued by /api/init and required on every API call.
 * Two flavors, both HMAC-SHA256 signed with REQUEST_TOKEN_SECRET:
 *
 *  - request token: proves the caller loaded our UI (CSRF-style). 30-min expiry.
 *  - page-load stamp: a signed timestamp captured once at page load, used for
 *    the minimum-timing bot check. Kept separate from the request token so the
 *    token can be refreshed without resetting the "how long since load" clock.
 */
const REQUEST_TOKEN_TTL_MS = 30 * 60 * 1000;
const STAMP_TTL_MS = 2 * 60 * 60 * 1000; // a page can sit open a while

function secret(): string {
  // Falls back to a dev-only constant so local runs work without setup; in
  // production REQUEST_TOKEN_SECRET must be set (flagged by the audit/report).
  return process.env.REQUEST_TOKEN_SECRET || "dev-insecure-request-token-secret";
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

// Constant-time compare to avoid signature timing leaks.
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function encode(obj: Record<string, number>): string {
  const payload = Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function decode(token: string): Record<string, number> | null {
  const [payload, sig] = (token || "").split(".");
  if (!payload || !sig) return null;
  if (!safeEqual(sig, sign(payload))) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return null;
  }
}

export function issueRequestToken(): string {
  const now = Date.now();
  return encode({ exp: now + REQUEST_TOKEN_TTL_MS });
}

export function verifyRequestToken(token: string): boolean {
  const data = decode(token);
  return !!data && typeof data.exp === "number" && Date.now() < data.exp;
}

export function issuePageStamp(): string {
  const now = Date.now();
  return encode({ ts: now, exp: now + STAMP_TTL_MS });
}

/** Returns the signed load time (ms) if valid and unexpired, else null. */
export function verifyPageStamp(stamp: string): number | null {
  const data = decode(stamp);
  if (!data || typeof data.ts !== "number" || typeof data.exp !== "number") return null;
  if (Date.now() >= data.exp) return null;
  return data.ts;
}
