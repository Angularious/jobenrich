import { NextResponse } from "next/server";
import { callOrthogonal } from "@/lib/orthogonal";
import { isValidLinkedInProfileUrl } from "@/lib/validation";
import { guardRequest, type GuardBody } from "@/lib/security/guard";

const MAX_URL_LEN = 500;

export interface EnrichLink {
  label: string;
  url: string;
}

export type EnrichSource = "apollo" | "bytemine" | "contactout" | "none";

export interface EnrichResult {
  emails: string[];
  phones: string[];
  source: EnrichSource;
  // Extra profile context surfaced alongside the contact details.
  company: string | null;
  position: string | null;
  location: string | null;
  links: EnrichLink[];
}

// What each provider step contributes to the merged result.
interface ProviderResult {
  emails: string[];
  phones: string[];
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

// Cap how many candidate numbers we surface — providers can return several.
const MAX_PHONES = 5;

// Apollo masks unrevealed emails with a placeholder; never surface those.
function isRealEmail(v: unknown): v is string {
  return (
    typeof v === "string" &&
    v.includes("@") &&
    !/email_not_unlocked|not_unlocked|@domain\.com$/i.test(v)
  );
}

// "City, State, Country" from whatever location parts a provider gives.
function joinLocation(...parts: Array<unknown>): string | null {
  const seen = new Set<string>();
  const clean = parts
    .map(cleanStr)
    .filter((p): p is string => Boolean(p))
    .filter((p) => (seen.has(p) ? false : (seen.add(p), true)));
  return clean.length ? clean.join(", ") : null;
}

const EMPTY: ProviderResult = {
  emails: [],
  phones: [],
  company: null,
  position: null,
  location: null,
  links: [],
};

/* Step 1 — Apollo /api/v1/people/match ($0.01). Verified work email +
   personal emails + rich profile context, straight from a LinkedIn URL.
   The raw payload is huge (~190 KB) — pull only the fields we need and
   never log the whole body. Phones are not requested (kept to the phone
   tiers below) so the call stays a flat $0.01. */
interface ApolloPerson {
  email?: string | null;
  email_status?: string | null;
  personal_emails?: unknown;
  title?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  twitter_url?: string | null;
  github_url?: string | null;
  organization?: { name?: string | null } | null;
}
async function apolloLookup(profile: string): Promise<ProviderResult> {
  const raw = await callOrthogonal<{ person?: ApolloPerson }>({
    api: "apollo",
    path: "/api/v1/people/match",
    method: "POST",
    body: { linkedin_url: profile, reveal_personal_emails: true },
  });
  const p = raw?.person;
  if (!p) return EMPTY;
  const emails = dedupe(
    [p.email, ...collectStrings(p.personal_emails, "email")].filter(isRealEmail)
  );
  const links: EnrichLink[] = [];
  const tw = asUrl(p.twitter_url);
  if (tw) links.push({ label: "Twitter / X", url: tw });
  const gh = asUrl(p.github_url);
  if (gh) links.push({ label: "GitHub", url: gh });
  return {
    emails,
    phones: [],
    company: cleanStr(p.organization?.name),
    position: cleanStr(p.title),
    location: joinLocation(p.city, p.state, p.country),
    links,
  };
}

/* Step 2 — Bytemine /contacts/enrich ($0.03). Work + personal email AND
   mobile + work phone in one call, SMTP-validated. Flat response body. */
interface BytemineData {
  work_email?: string | null;
  email?: string | null;
  personal_email?: string | null;
  mobile_number?: string | null;
  work_number?: string | null;
  job_title?: string | null;
  company_name?: string | null;
  person_city?: string | null;
  person_state?: string | null;
  twitter?: string | null;
}
async function bytemineLookup(profile: string): Promise<ProviderResult> {
  const d = await callOrthogonal<BytemineData>({
    api: "bytemine",
    path: "/contacts/enrich",
    method: "POST",
    body: { linkedin: profile },
  });
  if (!d) return EMPTY;
  const emails = dedupe([d.work_email, d.email, d.personal_email].filter(isRealEmail));
  const phones = dedupe(
    [d.mobile_number, d.work_number]
      .map(cleanStr)
      .filter((n): n is string => Boolean(n))
  ).slice(0, MAX_PHONES);
  const links: EnrichLink[] = [];
  const tw = asUrl(d.twitter);
  if (tw) links.push({ label: "Twitter / X", url: tw });
  return {
    emails,
    phones,
    company: cleanStr(d.company_name),
    position: cleanStr(d.job_title),
    location: joinLocation(d.person_city, d.person_state),
    links,
  };
}

/* Step 3 — ContactOut /v1/people/linkedin ($0.33, no phone). Categorized
   emails + github links, but no name/title/company. Last resort. */
async function contactOutLookup(profile: string): Promise<ProviderResult> {
  const raw = await callOrthogonal<Record<string, unknown>>({
    api: "contactout",
    path: "/v1/people/linkedin",
    method: "GET",
    query: { profile, include_phone: false },
  });
  // ContactOut nests contact data under `profile` on some responses.
  const root = (raw?.profile as Record<string, unknown>) ?? raw ?? {};
  const emails = dedupe(
    [
      ...collectStrings(root.work_email, "email"),
      ...collectStrings(root.personal_email, "email"),
      ...collectStrings(root.email, "email"),
      ...collectStrings(root.emails, "email"),
    ].filter(isRealEmail)
  );
  const phones = dedupe([
    ...collectStrings(root.phone, "phone"),
    ...collectStrings(root.phones, "phone"),
  ]).slice(0, MAX_PHONES);
  const links = dedupe(collectStrings(root.github, "email")).map((url) => ({
    label: "GitHub",
    url,
  }));
  return { ...EMPTY, emails, phones, links };
}

export async function POST(request: Request) {
  let body: GuardBody & { linkedinUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const guard = await guardRequest(request, body, "enrich");
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
  await guard.recordSpend();

  // Cheap → rich → last-resort. Each step fires only if no email yet, and a
  // step that throws degrades to the next instead of failing the request.
  // Profile context, phones, and links accumulate across steps so an email
  // found late still carries any context an earlier step surfaced.
  const steps: Array<[EnrichSource, (p: string) => Promise<ProviderResult>]> = [
    ["apollo", apolloLookup],
    ["bytemine", bytemineLookup],
    ["contactout", contactOutLookup],
  ];

  let company: string | null = null;
  let position: string | null = null;
  let location: string | null = null;
  let phones: string[] = [];
  let links: EnrichLink[] = [];
  let phoneSource: EnrichSource = "none";

  const mergeLinks = (next: EnrichLink[]) => {
    const seen = new Set(links.map((l) => l.url));
    for (const l of next) if (!seen.has(l.url)) (seen.add(l.url), links.push(l));
  };

  for (const [name, lookup] of steps) {
    let r: ProviderResult;
    try {
      r = await lookup(linkedinUrl);
    } catch (err) {
      console.error(`[enrich] ${name} failed:`, err);
      continue;
    }
    company = company ?? r.company;
    position = position ?? r.position;
    location = location ?? r.location;
    if (r.phones.length && !phones.length) phoneSource = name;
    phones = dedupe([...phones, ...r.phones]).slice(0, MAX_PHONES);
    mergeLinks(r.links);

    if (r.emails.length) {
      console.log(`[enrich] ${name}: email found`);
      return NextResponse.json<EnrichResult>({
        emails: r.emails,
        phones,
        source: name,
        company,
        position,
        location,
        links,
      });
    }
  }

  // No email from any provider — still return whatever context/phones we got.
  console.log("[enrich] no email found");
  return NextResponse.json<EnrichResult>({
    emails: [],
    phones,
    source: phones.length || links.length ? phoneSource : "none",
    company,
    position,
    location,
    links,
  });
}
