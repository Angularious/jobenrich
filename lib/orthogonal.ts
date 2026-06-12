interface OrthogonalPayload {
  api: string;
  path: string;
  method: string;
  body?: Record<string, unknown>;
  query?: Record<string, string | boolean | number>;
}

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

  if (!res.ok) {
    throw new Error(`Orthogonal HTTP error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();

  if (!json.success) {
    throw new Error(`Orthogonal API failure: ${JSON.stringify(json)}`);
  }

  return json.data as T;
}
