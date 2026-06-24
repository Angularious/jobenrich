import { NextResponse } from "next/server";
import { callOrthogonal, QuotaExceededError } from "@/lib/orthogonal";
import { isValidLinkedInProfileUrl } from "@/lib/validation";
import { guardRequest, type GuardBody } from "@/lib/security/guard";

export const maxDuration = 30;

const MAX_URL_LEN = 500;

export interface PhoneResult {
  phones: string[];
}

function cleanStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function dedupe(list: string[]): string[] {
  return list.map((s) => s.trim()).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
}

/* Step 1 — Bytemine ($0.03). Returns mobile + work phone alongside email;
   we discard the email here since the caller already has it.              */
async function byteminePhonesOnly(profile: string): Promise<string[]> {
  const d = await callOrthogonal<{
    mobile_number?: string | null;
    work_number?: string | null;
  }>({
    api: "bytemine",
    path: "/contacts/enrich",
    method: "POST",
    body: { linkedin: profile },
  });
  return dedupe(
    [d?.mobile_number, d?.work_number]
      .map(cleanStr)
      .filter((n): n is string => Boolean(n))
  );
}

/* Step 2 — ContactOut /v1/people/linkedin ($0.55, include_phone:true).
   Last resort when ContactOut's contact_availability confirmed a phone
   exists but Bytemine didn't have it.                                    */
async function contactOutPhones(profile: string): Promise<string[]> {
  const raw = await callOrthogonal<Record<string, unknown>>({
    api: "contactout",
    path: "/v1/people/linkedin",
    method: "GET",
    query: { profile, include_phone: true },
  });
  const root = (raw?.profile as Record<string, unknown>) ?? raw ?? {};
  const collect = (v: unknown): string[] => {
    if (!v) return [];
    if (typeof v === "string") return [v];
    if (Array.isArray(v)) return v.flatMap(collect);
    return [];
  };
  return dedupe([...collect(root.phone), ...collect(root.phones)]);
}

export async function POST(request: Request) {
  let body: GuardBody & { linkedinUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const guard = await guardRequest(request, body, "phone");
  if (!guard.ok) return guard.response;

  const linkedinUrl = (body.linkedinUrl ?? "").trim();
  if (!linkedinUrl || linkedinUrl.length > MAX_URL_LEN || !isValidLinkedInProfileUrl(linkedinUrl)) {
    return NextResponse.json({ error: "Invalid LinkedIn profile URL." }, { status: 400 });
  }

  await guard.recordSpend();

  // Bytemine first ($0.03) — good phone coverage, cheap.
  let phones: string[] = [];
  try {
    phones = await byteminePhonesOnly(linkedinUrl);
    console.log(`[phone] Bytemine: ${phones.length} found`);
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      return NextResponse.json({ error: "Usage limit reached — try again later." }, { status: 503 });
    }
    console.error("[phone] Bytemine failed:", err);
  }

  // ContactOut fallback ($0.55) — only when Bytemine came up empty.
  if (!phones.length) {
    try {
      phones = await contactOutPhones(linkedinUrl);
      console.log(`[phone] ContactOut: ${phones.length} found`);
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        return NextResponse.json({ error: "Usage limit reached — try again later." }, { status: 503 });
      }
      console.error("[phone] ContactOut failed:", err);
    }
  }

  return NextResponse.json<PhoneResult>({ phones });
}
