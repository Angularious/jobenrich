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

export async function callOrthogonal<T = unknown>(
  payload: OrthogonalPayload
): Promise<T> {
  const res = await fetch("https://api.orthogonal.com/v1/run", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.ORTHOGONAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

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
