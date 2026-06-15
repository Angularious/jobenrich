import { NextResponse } from "next/server";
import { callOrthogonal } from "@/lib/orthogonal";
import { isValidLinkedInProfileUrl } from "@/lib/validation";
import { guardRequest, type GuardBody } from "@/lib/security/guard";

const MAX_URL_LEN = 500;

export interface EnrichLink {
  label: string;
  url: string;
}

export interface EnrichResult {
  emails: string[];
  phones: string[];
  source: "tomba" | "contactout" | "none";
  // Extra profile context surfaced alongside the contact details.
  company: string | null;
  position: string | null;
  location: string | null;
  links: EnrichLink[];
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

function cleanStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// Providers return URLs both with and without a scheme — normalize to a link.
function asUrl(v: unknown): string | null {
  const s = cleanStr(v);
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

interface TombaData {
  email?: string | null;
  company?: string | null;
  position?: string | null;
  country?: string | null;
  twitter?: string | null;
  website_url?: string | null;
}

/* Step 1 — Tomba /v1/linkedin ($0.01). Returns email + a bit of profile
   context: { data: { email, company, position, country, twitter, website_url } } */
async function tombaLookup(profile: string): Promise<TombaData | null> {
  const raw = await callOrthogonal<{ data?: TombaData }>({
    api: "tomba",
    path: "/v1/linkedin",
    method: "GET",
    query: { url: profile },
  });
  return raw?.data ?? null;
}

// Social/web links a Tomba record can carry (Twitter, personal site).
function tombaLinks(data: TombaData | null): EnrichLink[] {
  if (!data) return [];
  const links: EnrichLink[] = [];
  const tw = asUrl(data.twitter);
  if (tw) links.push({ label: "Twitter / X", url: tw });
  const web = asUrl(data.website_url);
  if (web) links.push({ label: "Website", url: web });
  return links;
}

/* Step 2 — ContactOut /v1/people/linkedin ($0.33, no phone). Returns
   categorized emails + github links, but no name/title/company. */
async function contactOutContacts(
  profile: string
): Promise<{ emails: string[]; phones: string[]; links: EnrichLink[] }> {
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
  const links = dedupe(collectStrings(root.github, "email")).map((url) => ({
    label: "GitHub",
    url,
  }));
  return { emails, phones, links };
}

export async function POST(request: Request) {
  let body: GuardBody & { linkedinUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const guard = guardRequest(request, body, "enrich");
  if (!guard.ok) return guard.response;

  const linkedinUrl = body.linkedinUrl ?? "";
  if (
    typeof linkedinUrl !== "string" ||
    linkedinUrl.length > MAX_URL_LEN ||
    !isValidLinkedInProfileUrl(linkedinUrl)
  ) {
    return NextResponse.json({ error: "Invalid LinkedIn profile URL." }, { status: 400 });
  }

  // Input is valid and a call will be made — count it against the daily cap.
  guard.recordSpend();

  try {
    // Cheap first: Tomba. Only escalate to ContactOut if it has no email.
    let tomba: TombaData | null = null;
    try {
      tomba = await tombaLookup(linkedinUrl);
    } catch (err) {
      console.error("[enrich] Tomba failed:", err);
    }

    if (tomba?.email) {
      const result: EnrichResult = {
        emails: [tomba.email],
        phones: [],
        source: "tomba",
        company: cleanStr(tomba.company),
        position: cleanStr(tomba.position),
        location: cleanStr(tomba.country),
        links: tombaLinks(tomba),
      };
      return NextResponse.json(result);
    }

    // Fallback to ContactOut for emails/phones; keep any profile context Tomba did return.
    const co = await contactOutContacts(linkedinUrl);
    const result: EnrichResult = {
      emails: co.emails,
      phones: co.phones,
      source: co.emails.length || co.phones.length ? "contactout" : "none",
      company: cleanStr(tomba?.company),
      position: cleanStr(tomba?.position),
      location: cleanStr(tomba?.country),
      links: [...tombaLinks(tomba), ...co.links],
    };
    return NextResponse.json(result);
  } catch (err) {
    console.error("[enrich] Enrichment failed:", err);
    return NextResponse.json({ error: "Enrichment failed. Try again." }, { status: 502 });
  }
}
