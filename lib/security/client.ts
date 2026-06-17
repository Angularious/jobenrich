/**
 * Client-side security helper: gathers a lightweight browser fingerprint +
 * session token, primes a request token / page-load stamp from /api/init, and
 * posts to our API routes with all the signals the server-side guard expects.
 *
 * Call primeSecurity() once on app mount so the page-load stamp is captured at
 * load time (the minimum-timing bot check compares against it).
 */
const SESSION_KEY = "ji_session_token";

function randomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function sessionToken(): string {
  if (typeof window === "undefined") return "";
  let t = localStorage.getItem(SESSION_KEY);
  if (!t) {
    t = randomId();
    localStorage.setItem(SESSION_KEY, t);
  }
  return t;
}

function fingerprint(): Record<string, string> {
  if (typeof window === "undefined") return {};
  return {
    ua: navigator.userAgent,
    screen: `${window.screen.width}x${window.screen.height}`,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    lang: navigator.language,
    platform: navigator.platform,
    sessionToken: sessionToken(),
  };
}

// Page-load stamp is captured once and reused; the request token is refreshable.
let pageStamp: string | null = null;
let tokenPromise: Promise<string> | null = null;

async function fetchInit(): Promise<string> {
  const res = await fetch("/api/init");
  const json = (await res.json()) as { token: string; pageLoad: string };
  if (pageStamp === null) pageStamp = json.pageLoad;
  return json.token;
}

export function primeSecurity(): void {
  if (!tokenPromise) tokenPromise = fetchInit();
}

async function getToken(): Promise<string> {
  if (!tokenPromise) tokenPromise = fetchInit();
  return tokenPromise;
}

function refreshToken(): Promise<string> {
  tokenPromise = fetchInit();
  return tokenPromise;
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T;
}

export async function apiPost<T = unknown>(
  path: string,
  payload: Record<string, unknown>,
  opts?: { honeypot?: string; timed?: boolean }
): Promise<ApiResult<T>> {
  const send = async (token: string) => {
    const body: Record<string, unknown> = {
      ...payload,
      fp: fingerprint(),
      website: opts?.honeypot ?? "",
    };
    if (opts?.timed) body.pageLoad = pageStamp ?? "";
    return fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-Token": token },
      body: JSON.stringify(body),
    });
  };

  let res = await send(await getToken());
  // One retry if the token went stale (e.g. tab left open past expiry).
  if (res.status === 403) {
    res = await send(await refreshToken());
  }
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

interface ErrorShape {
  message?: string; // guard responses (403/429/503)
  error?: string; // route responses (400/422/502)
  retryAfter?: string;
}

/** Turn a guarded API response into a human-readable message for the UI.
 *  Guards put the text in `message`; routes put it in `error` — surface both. */
export function errorMessage(r: ApiResult<unknown>, fallback: string): string {
  const d = (r.data ?? {}) as ErrorShape;
  const text = d.message ?? d.error;
  if (r.status === 429 && d.retryAfter) {
    return `${text ?? "You've hit today's limit."} Try again in ${d.retryAfter}.`;
  }
  return text ?? fallback;
}
