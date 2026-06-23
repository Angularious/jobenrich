import { NextResponse } from "next/server";
import { guardRequest, type GuardBody } from "@/lib/security/guard";
import { searchJobs } from "@/lib/jobs/searchJobs";
import type { JobSearchParams } from "@/types/job";

const MAX_FIELD_LEN = 200;
const VALID_FRESHNESS = new Set(["1h", "24h", "7d", "6m"]);

// One Fantastic Jobs call ($0.40); give it headroom like the other routes.
export const maxDuration = 60;

/**
 * POST (not GET, despite the brief) — the shared security guard reads the
 * fingerprint / honeypot / request-token from a JSON body and enforces a JSON
 * content-type, and the client helper (lib/security/client.ts `apiPost`) is
 * POST-only. Reusing "the same guard" therefore means POST. Search filters
 * arrive in the JSON body rather than the query string.
 */
export async function POST(request: Request) {
  let body: GuardBody & Partial<JobSearchParams>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const guard = await guardRequest(request, body, "jobsSearch");
  if (!guard.ok) return guard.response;

  const role = typeof body.role === "string" ? body.role.trim() : "";
  if (!role || role.length > MAX_FIELD_LEN) {
    return NextResponse.json(
      { error: "Enter a role to search for." },
      { status: 400 }
    );
  }

  const location =
    typeof body.location === "string" ? body.location.trim().slice(0, MAX_FIELD_LEN) : undefined;
  const employmentType =
    typeof body.employmentType === "string"
      ? body.employmentType.trim().slice(0, MAX_FIELD_LEN)
      : undefined;
  const freshness =
    typeof body.freshness === "string" && VALID_FRESHNESS.has(body.freshness)
      ? body.freshness
      : undefined;
  const cursor =
    typeof body.cursor === "string" ? body.cursor.trim().slice(0, MAX_FIELD_LEN) : undefined;
  const board =
    body.board === "jb" || body.board === "ats" ? body.board : undefined;

  // Valid input, a paid call will be made — count it against the daily cap.
  await guard.recordSpend();

  try {
    const result = await searchJobs({
      role,
      location,
      remoteOnly: body.remoteOnly === true,
      employmentType,
      freshness,
      cursor,
      board,
    });
    console.log(
      `[jobs] "${role}" @ "${location ?? "anywhere"}" → ${result.count} listings`
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error("[jobs] search failed:", err);
    return NextResponse.json(
      { error: "Couldn't load job listings right now. Try again." },
      { status: 502 }
    );
  }
}
