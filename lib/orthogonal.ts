interface OrthogonalPayload {
  api: string;
  path: string;
  method: string;
  body?: Record<string, unknown>;
  query?: Record<string, string | boolean | number>;
}

export class QuotaExceededError extends Error {
  constructor() {
    super("Orthogonal API key quota exceeded");
    this.name = "QuotaExceededError";
  }
}

// A provider-side integration (e.g. Edges' managed LinkedIn scraping pool)
// hit ITS OWN daily/rate cap — distinct from our Orthogonal spend/quota. It's
// temporary and provider-specific, not a dead link — see api-learnings/edges.md
// (a "DAILY_LIMIT" 429 recovered in ~1.5h, well inside its own quoted retry
// window, so this is a soft, self-clearing condition, not a hard outage).
export class UpstreamRateLimitedError extends Error {
  constructor(api: string) {
    super(`${api} is temporarily rate-limited upstream`);
    this.name = "UpstreamRateLimitedError";
  }
}

const QUOTA_PATTERN = /quota|payment_required|spend_limit|limit_exceeded|billing/i;
const RATE_LIMIT_PATTERN = /limit_reached|daily_limit|rate_limit|too_many_requests/i;

// Per-call network timeout. Provider DB lookups (ContactOut, Apollo, Bytemine,
// Coresignal) answer in 1–3s; a response slower than this is a hang, and in a
// waterfall we'd rather fail fast and fall through to the next provider than
// block until the whole serverless function is killed (which is what made
// "Bytemine timed out → ContactOut never ran" happen). Scrape/LLM steps render
// JS or run a model and legitimately take longer, so they pass a larger value.
const DEFAULT_TIMEOUT_MS = 12_000;

export async function callOrthogonal<T = unknown>(
  payload: OrthogonalPayload,
  opts?: { timeoutMs?: number }
): Promise<T> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch("https://api.orthogonal.com/v1/run", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.ORTHOGONAL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });
  } catch (err) {
    // Distinguish a timeout abort from other network failures so callers/logs
    // can tell "the provider hung" apart from "the request errored".
    if (ac.signal.aborted) {
      throw new Error(`Orthogonal call timed out: ${payload.api}${payload.path}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // Read the body even on failure — an upstream error (e.g. Edges hitting
    // its own LinkedIn rate limit) carries a classifiable message here, and
    // discarding it collapses every non-200 into the same generic error.
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      // non-JSON error body — fall through with no text to classify
    }
    const text = body ? JSON.stringify(body) : "";
    if (res.status === 402 || QUOTA_PATTERN.test(text)) throw new QuotaExceededError();
    if (RATE_LIMIT_PATTERN.test(text)) throw new UpstreamRateLimitedError(payload.api);
    throw new Error(`Orthogonal HTTP error: ${res.status} ${res.statusText}${text ? ` ${text}` : ""}`);
  }

  const json = await res.json();

  if (!json.success) {
    const text = JSON.stringify(json);
    if (QUOTA_PATTERN.test(text)) throw new QuotaExceededError();
    if (RATE_LIMIT_PATTERN.test(text)) throw new UpstreamRateLimitedError(payload.api);
    throw new Error(`Orthogonal API failure: ${text}`);
  }

  return json.data as T;
}
