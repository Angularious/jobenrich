import { NextResponse } from "next/server";
import { callOrthogonal } from "@/lib/orthogonal";
import { isValidLinkedInProfileUrl } from "@/lib/validation";

export interface EnrichResult {
  emails: string[];
  phones: string[];
  source: "tomba" | "contactout" | "none";
}

// Pull every string that looks like an email/phone out of an unknown payload.
function collectStrings(val: unknown, keyHint: "email" | "phone"): string[] {
  const out: string[] = [];
  const visit = (v: unknown) => {
    if (!v) return;
    if (typeof v === "string") {
      out.push(v);
      return;
    }
    if (Array.isArray(v)) {
      v.forEach(visit);
      return;
    }
    if (typeof v === "object") {
      const o = v as Record<string, unknown>;
      const direct = o.value ?? o[keyHint] ?? o.address ?? o.number;
      if (typeof direct === "string") out.push(direct);
    }
  };
  visit(val);
  return out;
}

function dedupe(list: string[]): string[] {
  return list
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i);
}

/* Step 1 — Tomba /v1/linkedin ($0.01). Shape: { data: { email, phone_number } } */
async function tombaEmail(profile: string): Promise<string | null> {
  const raw = await callOrthogonal<{ data?: { email?: string | null } }>({
    api: "tomba",
    path: "/v1/linkedin",
    method: "GET",
    query: { url: profile },
  });
  const email = raw?.data?.email;
  return typeof email === "string" && email ? email : null;
}

/* Step 2 — ContactOut /v1/people/linkedin ($0.33, no phone). */
async function contactOutContacts(
  profile: string
): Promise<{ emails: string[]; phones: string[] }> {
  const raw = await callOrthogonal<Record<string, unknown>>({
    api: "contactout",
    path: "/v1/people/linkedin",
    method: "GET",
    query: { profile, include_phone: false },
  });
  // ContactOut nests contact data under `profile` on some responses.
  const root = (raw?.profile as Record<string, unknown>) ?? raw ?? {};
  const emails = dedupe([
    ...collectStrings(root.work_email, "email"),
    ...collectStrings(root.personal_email, "email"),
    ...collectStrings(root.email, "email"),
    ...collectStrings(root.emails, "email"),
  ]);
  const phones = dedupe([
    ...collectStrings(root.phone, "phone"),
    ...collectStrings(root.phones, "phone"),
  ]);
  return { emails, phones };
}

export async function POST(request: Request) {
  let body: { linkedinUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const linkedinUrl = body.linkedinUrl ?? "";
  if (!isValidLinkedInProfileUrl(linkedinUrl)) {
    return NextResponse.json({ error: "Invalid LinkedIn profile URL." }, { status: 400 });
  }

  try {
    // Cheap first: Tomba. Only escalate to ContactOut if it comes back empty.
    let email: string | null = null;
    try {
      email = await tombaEmail(linkedinUrl);
    } catch (err) {
      console.error("[enrich] Tomba failed:", err);
    }

    if (email) {
      const result: EnrichResult = { emails: [email], phones: [], source: "tomba" };
      return NextResponse.json(result);
    }

    const { emails, phones } = await contactOutContacts(linkedinUrl);
    const result: EnrichResult = {
      emails,
      phones,
      source: emails.length || phones.length ? "contactout" : "none",
    };
    return NextResponse.json(result);
  } catch (err) {
    console.error("[enrich] Enrichment failed:", err);
    return NextResponse.json({ error: "Enrichment failed. Try again." }, { status: 502 });
  }
}
