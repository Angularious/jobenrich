import crypto from "crypto";
import { NextResponse } from "next/server";
import { checkRateLimit, retryAfter } from "./rateLimit";
import { withinCap, recordSpend, capResetAt } from "./spendCap";
import { verifyRequestToken, verifyPageStamp } from "./tokens";

/* ── Per-step config ──────────────────────────────────────────────
   DAILY_LIMIT is per unique visitor (composite fingerprint), per step.
   `cost` is an APPROXIMATE Orthogonal cost per call in USD, used only to
   feed the daily spend cap — see the audit report for how these were
   estimated. They are deliberately a touch conservative.              */
const WINDOW_MS = 24 * 60 * 60 * 1000;
const PER_STEP_DAILY_LIMIT = 10;
const MIN_FORM_MS = 1500;

export const STEPS = {
  search: { cost: 0.12, requireTiming: true, noun: "searches" },
  // Role-first job search (Fantastic Jobs /v1/active-ats). Confirmed live at
  // $0.40/call — the single most expensive step, so it counts heavily against
  // the same global daily cap. No form-timing gate: the search form is
  // re-submitted as filters change, and a min-timing check would block rapid
  // re-searches; origin/token/honeypot/cap/rate-limit still apply.
  jobsSearch: { cost: 0.4, requireTiming: false, noun: "job searches" },
  alumni: { cost: 0.08, requireTiming: true, noun: "alumni lookups" },
  enrich: { cost: 0.1, requireTiming: false, noun: "contact lookups" },
} as const;

export type StepName = keyof typeof STEPS;

export interface ClientFingerprint {
  ua?: string;
  screen?: string;
  tz?: string;
  lang?: string;
  platform?: string;
  sessionToken?: string;
}

export interface GuardBody {
  fp?: ClientFingerprint;
  website?: string; // honeypot — must be empty
  pageLoad?: string; // signed page-load stamp (form steps)
  [k: string]: unknown;
}

type GuardResult =
  | { ok: true; recordSpend: () => Promise<void> }
  | { ok: false; response: NextResponse };

const BOT_UA =
  /(^$)|curl\/|wget\/|python-requests|go-http-client|libwww|scrapy|httpx|java\/|okhttp|node-fetch|axios\/|headlesschrome|phantomjs/i;

function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") || "unknown";
}

// Self-origin only: the request must come from our own UI, not a foreign page.
function originAllowed(request: Request): boolean {
  const allowed = new Set<string>();
  if (process.env.NEXT_PUBLIC_APP_URL) {
    try {
      allowed.add(new URL(process.env.NEXT_PUBLIC_APP_URL).origin);
    } catch {
      /* ignore malformed env */
    }
  }
  const host = request.headers.get("host");
  if (host) {
    allowed.add(`https://${host}`);
    allowed.add(`http://${host}`);
  }

  let origin = request.headers.get("origin");
  if (!origin) {
    const ref = request.headers.get("referer");
    if (ref) {
      try {
        origin = new URL(ref).origin;
      } catch {
        origin = null;
      }
    }
  }
  return !!origin && allowed.has(origin);
}

// Cheap header heuristics. Real users vary, so we only reject obvious bots.
function looksLikeBot(request: Request): boolean {
  const ua = request.headers.get("user-agent") || "";
  if (!ua || BOT_UA.test(ua)) return true;
  const xff = request.headers.get("x-forwarded-for");
  if (xff && xff.split(",").length > 6) return true; // absurd proxy chain
  return false;
}

function compositeKey(request: Request, fp?: ClientFingerprint): string {
  const raw = [
    getClientIp(request),
    fp?.sessionToken ?? "",
    fp?.ua ?? "",
    fp?.screen ?? "",
    fp?.tz ?? "",
    fp?.lang ?? "",
    fp?.platform ?? "",
  ].join("|");
  return crypto.createHash("sha256").update(raw).digest("hex");
}

const forbidden = (message: string) =>
  NextResponse.json({ error: "forbidden", message }, { status: 403 });

/**
 * Run all Level 1 gates for a step. Call at the very top of an API route,
 * before any Orthogonal call. On success, call the returned recordSpend()
 * AFTER a successful upstream call so the daily cap reflects real usage.
 */
export async function guardRequest(
  request: Request,
  body: GuardBody,
  step: StepName
): Promise<GuardResult> {
  const cfg = STEPS[step];

  // 1. Same-origin + content type + obvious-bot header checks.
  if (request.headers.get("content-type")?.includes("application/json") !== true) {
    return { ok: false, response: forbidden("Unsupported content type.") };
  }
  if (!originAllowed(request)) {
    return { ok: false, response: forbidden("Cross-origin requests are not allowed.") };
  }
  if (looksLikeBot(request)) {
    return { ok: false, response: forbidden("Request blocked.") };
  }

  // 2. CSRF-style request token (proves the UI was loaded).
  if (!verifyRequestToken(request.headers.get("x-request-token") || "")) {
    return { ok: false, response: forbidden("Stale session. Refresh the page and try again.") };
  }

  // 3. Honeypot — a hidden field only bots fill.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return { ok: false, response: forbidden("Request blocked.") };
  }

  // 4. Minimum form timing (form-backed steps only).
  if (cfg.requireTiming) {
    const ts = verifyPageStamp(body.pageLoad || "");
    if (ts === null) {
      return { ok: false, response: forbidden("Stale session. Refresh the page and try again.") };
    }
    if (Date.now() - ts < MIN_FORM_MS) {
      return { ok: false, response: forbidden("That was too fast — try again.") };
    }
  }

  // 5. Global daily spend cap (503 for everyone when hit). Don't reveal the cap.
  if (!(await withinCap(cfg.cost))) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "service_unavailable",
          message: "This demo has reached its daily usage limit. Please try again tomorrow.",
          resetAt: capResetAt(),
        },
        { status: 503 }
      ),
    };
  }

  // 6. Per-visitor, per-step daily rate limit.
  const key = `${step}:${compositeKey(request, body.fp)}`;
  const rl = await checkRateLimit(key, PER_STEP_DAILY_LIMIT, WINDOW_MS);
  if (!rl.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "rate_limited",
          message: `You've used your free ${cfg.noun} for today.`,
          resetAt: rl.resetAt,
          retryAfter: retryAfter(rl.resetAt),
        },
        { status: 429 }
      ),
    };
  }

  return { ok: true, recordSpend: () => recordSpend(cfg.cost) };
}
