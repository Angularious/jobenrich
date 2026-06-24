import { NextResponse } from "next/server";
import { callOrthogonal, QuotaExceededError } from "@/lib/orthogonal";
import { isValidLinkedInProfileUrl } from "@/lib/validation";
import { guardRequest, type GuardBody } from "@/lib/security/guard";

// Bytemine → ContactOut, each capped at a 12s network timeout; 45s leaves room.
export const maxDuration = 45;

const MAX_URL_LEN = 500;

// Both providers return emails alongside phones, so we surface those too — the
// $0.55 ContactOut reveal in particular shouldn't have its emails thrown away.
export interface PhoneResult {
  phones: string[];
  emails: string[];
}

interface ContactBits {
  phones: string[];
  emails: string[];
}

function cleanStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function dedupe(list: string[]): string[] {
  return list.map((s) => s.trim()).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
}

function isRealEmail(v: unknown): v is string {
  return (
    typeof v === "string" &&
    v.includes("@") &&
    !/email_not_unlocked|not_unlocked|@domain\.com$/i.test(v)
  );
}

function collect(v: unknown): string[] {
  if (!v) return [];
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(collect);
  return [];
}

/* Step 1 — Bytemine ($0.03). Mobile + work phone AND work/personal email. */
async function bytemineContact(profile: string): Promise<ContactBits> {
  const d = await callOrthogonal<{
    mobile_number?: string | null;
    work_number?: string | null;
    work_email?: string | null;
    email?: string | null;
    personal_email?: string | null;
  }>({
    api: "bytemine",
    path: "/contacts/enrich",
    method: "POST",
    body: { linkedin: profile },
  });
  return {
    phones: dedupe([d?.mobile_number, d?.work_number].map(cleanStr).filter((n): n is string => Boolean(n))),
    emails: dedupe([d?.work_email, d?.email, d?.personal_email].filter(isRealEmail)),
  };
}

/* Step 2 — ContactOut /v1/people/linkedin ($0.55, include_phone:true). The
   full reveal: phones AND emails. We surface both so the expensive call pays
   for itself even if the user only asked for a phone. */
async function contactOutContact(profile: string): Promise<ContactBits> {
  const raw = await callOrthogonal<Record<string, unknown>>({
    api: "contactout",
    path: "/v1/people/linkedin",
    method: "GET",
    query: { profile, include_phone: true },
  });
  const root = (raw?.profile as Record<string, unknown>) ?? raw ?? {};
  return {
    phones: dedupe([...collect(root.phone), ...collect(root.phones)]),
    emails: dedupe(
      [
        ...collect(root.work_email),
        ...collect(root.personal_email),
        ...collect(root.email),
        ...collect(root.emails),
      ].filter(isRealEmail)
    ),
  };
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

  // Tally real spend (Bytemine always; ContactOut only on fallback) and
  // reconcile the daily cap to it — the gate reserved the worst case ($0.58).
  let spentUsd = 0;
  let phones: string[] = [];
  let emails: string[] = [];
  try {
    // Bytemine first ($0.03) — good phone coverage, cheap.
    try {
      spentUsd += 0.03;
      const r = await bytemineContact(linkedinUrl);
      phones = r.phones;
      emails = r.emails;
      console.log(`[phone] Bytemine: ${phones.length} phone(s), ${emails.length} email(s)`);
    } catch (err) {
      if (err instanceof QuotaExceededError) {
        return NextResponse.json({ error: "Usage limit reached — try again later." }, { status: 503 });
      }
      console.error("[phone] Bytemine failed:", err);
    }

    // ContactOut fallback ($0.55) — only when Bytemine found no phone. Returns
    // emails too, which we merge so the $0.55 isn't wasted on phones alone.
    if (!phones.length) {
      try {
        spentUsd += 0.55;
        const r = await contactOutContact(linkedinUrl);
        phones = r.phones;
        emails = dedupe([...emails, ...r.emails]);
        console.log(`[phone] ContactOut: ${phones.length} phone(s), ${r.emails.length} email(s)`);
      } catch (err) {
        if (err instanceof QuotaExceededError) {
          return NextResponse.json({ error: "Usage limit reached — try again later." }, { status: 503 });
        }
        console.error("[phone] ContactOut failed:", err);
      }
    }

    return NextResponse.json<PhoneResult>({ phones, emails });
  } finally {
    await guard.recordSpend(spentUsd);
  }
}
