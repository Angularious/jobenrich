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

const QUOTA_PATTERN = /quota|payment_required|spend_limit|limit_exceeded|billing/i;

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

  if (res.status === 402) throw new QuotaExceededError();

  if (!res.ok) {
    throw new Error(`Orthogonal HTTP error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();

  if (!json.success) {
    if (QUOTA_PATTERN.test(JSON.stringify(json))) throw new QuotaExceededError();
    throw new Error(`Orthogonal API failure: ${JSON.stringify(json)}`);
  }

  return json.data as T;
}
