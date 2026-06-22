import { getDomain } from "tldts";
import { callOrthogonal } from "./orthogonal";
import { canonicalizeLinkedInJobUrl, isLinkedInHost } from "./validation";

/**
 * Turns ANY job posting / careers URL into the only three things the rest of
 * the pipeline needs: { jobTitle, companyName, domain }. Mirrors the app's
 * waterfall philosophy — cheap/reliable first, LLM only when needed:
 *
 *   1. LinkedIn        → Edges linkedin-extract-job ($0.09; LinkedIn is
 *                        auth-walled, so the purpose-built extractor wins).
 *   2. Everything else → Serper Scrape ($0.02) which RENDERS JS (so it works
 *                        on SPAs like Workday / BambooHR / Gem that return an
 *                        empty shell to a plain fetch). Then:
 *        a. schema.org JobPosting JSON-LD present → parse it (free, reliable).
 *        b. else → LLM-extract from the rendered markdown ($0.025).
 *
 * jobTitle may be null (e.g. a company careers index page with no single job);
 * the caller falls back to a company-only people search in that case.
 */
export interface ResolvedJob {
  jobTitle: string | null;
  companyName: string;
  domain: string | null;
  jobLocation: string | null;
  source: "linkedin" | "jsonld" | "llm";
}

// Hosts that are ATS/job-board infrastructure or social/aggregator sites, not
// the hiring company — never treat these as the company's own domain.
const ATS_HOSTS =
  /(^|\.)(myworkdayjobs\.com|bamboohr\.com|greenhouse\.io|gem\.com|lever\.co|ashbyhq\.com|workable\.com|smartrecruiters\.com|icims\.com|jobvite\.com|taleo\.net|successfactors\.com|paylocity\.com|eddy\.com|jobs\.[a-z]+)$/i;
const NON_COMPANY_HOSTS =
  /(^|\.)(linkedin\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|crunchbase\.com|glassdoor\.com|indeed\.com|youtube\.com)$/i;

// Unambiguous legal forms — safe to strip even without a comma.
const LEGAL_HARD =
  /[,.]?\s+(incorporated|inc|llc|l\.l\.c\.|ltd|limited|corp|corporation|gmbh|plc|pte\.?\s*ltd|pty\.?\s*ltd|llp|s\.?a\.?r\.?l\.?|srl)\.?$/i;
// Words that are often part of a real brand ("The Walt Disney Company", a spa,
// "<X> Co") — only strip when clearly a legal suffix, i.e. set off by a comma.
const LEGAL_SOFT = /,\s*(co|company|spa|ag|s\.?a\.?|b\.?v\.?|n\.?v\.?|kk|lp)\.?$/i;

/** Strip trailing legal suffixes so "Crocs, Inc." → "Crocs" — the people
 *  providers index companies by common name, not legal entity. Ambiguous
 *  words (Co/Company/Spa/…) are only stripped after a comma so brand names
 *  like "The Walt Disney Company" survive. */
export function normalizeCompany(raw: string): string {
  let name = raw.replace(/\s+/g, " ").trim();
  // Suffixes can stack ("Foo, Inc. LLC"); strip repeatedly.
  for (let i = 0; i < 3; i++) {
    const next = name.replace(LEGAL_HARD, "").replace(LEGAL_SOFT, "").trim();
    if (next === name || !next) break;
    name = next;
  }
  return name;
}

/** The company's own domain from a candidate URL/host, falling back to the
 *  page host — but never an ATS, social, or aggregator host. */
function pickDomain(candidate: unknown, pageUrl: string | null): string | null {
  const d = hostFromUrl(candidate);
  if (d && !ATS_HOSTS.test(d) && !NON_COMPANY_HOSTS.test(d)) return d;
  const ph = pageUrl ? hostFromUrl(pageUrl) : null;
  if (ph && !ATS_HOSTS.test(ph) && !NON_COMPANY_HOSTS.test(ph)) return ph;
  return null;
}

/** Best-effort registrable (apex) domain from a URL or company website string.
 *  Backed by the Public Suffix List (tldts), so "careers.sharkninja.com" →
 *  "sharkninja.com", "jobs.acme.co.uk" → "acme.co.uk", etc. People providers
 *  index companies by their apex marketing domain, never a careers/jobs/apply
 *  subdomain — collapsing to the registrable domain here is what makes the
 *  domain-first search actually match. Handles multi-part TLDs correctly, so
 *  there's no hand-maintained list of subdomain prefixes to keep in sync. */
function hostFromUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const withProto = raw.startsWith("http") ? raw : `https://${raw}`;
  return getDomain(withProto) || null;
}

/* ── LinkedIn branch (Edges) ─────────────────────────────────────────── */

function linkedInFields(data: Record<string, unknown>): {
  jobTitle: string | null;
  companyName: string;
  domain: string | null;
  jobLocation: string | null;
} {
  const out = (data?.output ?? data) as Record<string, unknown>;
  const jobTitle =
    String(out.job_title ?? out.title ?? out.position ?? "").trim() || null;
  const companyName = String(
    out.company_name ?? out.company ?? out.employer_name ?? out.employer ?? ""
  ).trim();
  const domain = pickDomain(
    out.company_website ?? out.company_domain ?? out.website ?? out.domain,
    null
  );
  const jobLocation =
    String(out.location ?? out.job_location ?? out.formatted_location ?? "").trim() || null;
  return { jobTitle, companyName, domain, jobLocation };
}

async function resolveLinkedIn(canonicalUrl: string): Promise<ResolvedJob> {
  const data = await callOrthogonal<Record<string, unknown>>({
    api: "edges",
    path: "/actions/linkedin-extract-job/run/live",
    method: "POST",
    body: { input: { linkedin_job_url: canonicalUrl } },
  });
  const { jobTitle, companyName, domain, jobLocation } = linkedInFields(data);
  return { jobTitle, companyName, domain, jobLocation, source: "linkedin" };
}

/* ── Generic branch (Serper render → JSON-LD or LLM) ─────────────────── */

interface SerperResponse {
  markdown?: string;
  text?: string;
  metadata?: Record<string, unknown>;
  jsonld?: unknown;
}

interface JobPostingLD {
  "@type"?: string | string[];
  title?: string;
  hiringOrganization?: { name?: string; sameAs?: string; url?: string } | string;
  url?: string;
  jobLocation?: {
    "@type"?: string;
    address?: {
      addressLocality?: string;
      addressRegion?: string;
      addressCountry?: string;
    };
  } | string;
}

function extractJsonLdLocation(loc: JobPostingLD["jobLocation"]): string | null {
  if (typeof loc === "string" && loc.trim()) return loc.trim();
  if (typeof loc === "object" && loc !== null) {
    const addr = loc.address;
    if (addr) {
      const parts = [addr.addressLocality, addr.addressRegion, addr.addressCountry]
        .filter((p): p is string => typeof p === "string" && Boolean(p.trim()));
      if (parts.length) return parts.join(", ");
    }
  }
  return null;
}

// Find a schema.org JobPosting anywhere in the JSON-LD (object, array, @graph).
function findJobPosting(node: unknown, depth = 0): JobPostingLD | null {
  if (!node || depth > 4) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findJobPosting(n, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof node === "object") {
    const o = node as Record<string, unknown>;
    const t = o["@type"];
    const isJob = Array.isArray(t) ? t.includes("JobPosting") : t === "JobPosting";
    if (isJob && (o.title || o.hiringOrganization)) return o as JobPostingLD;
    if (o["@graph"]) return findJobPosting(o["@graph"], depth + 1);
  }
  return null;
}

function fromJsonLd(ld: JobPostingLD, pageUrl: string): ResolvedJob | null {
  const jobTitle = typeof ld.title === "string" && ld.title.trim() ? ld.title.trim() : null;
  const org = ld.hiringOrganization;
  const companyName =
    typeof org === "string"
      ? org.trim()
      : (org?.name ?? "").trim();
  if (!companyName) return null;
  const orgUrl = typeof org === "object" ? org?.url ?? org?.sameAs : undefined;
  const domain = pickDomain(orgUrl, pageUrl);
  const jobLocation = extractJsonLdLocation(ld.jobLocation);
  return { jobTitle, companyName: normalizeCompany(companyName), domain, jobLocation, source: "jsonld" };
}

interface ExtractResponse {
  json?: { job_title?: string | null; company_name?: string | null; company_domain?: string | null; job_location?: string | null };
}

// Junk sentinels the extractor returns when a page had no usable content.
const EMPTY_VAL = /^(no content available|n\/?a|none|null|unknown)$/i;
const clean = (v: unknown): string | null =>
  typeof v === "string" && v.trim() && !EMPTY_VAL.test(v.trim()) ? v.trim() : null;

async function llmExtract(markdown: string, pageUrl: string): Promise<ResolvedJob | null> {
  const res = await callOrthogonal<ExtractResponse>({
    api: "scrapegraphai",
    path: "/api/extract",
    method: "POST",
    body: {
      markdown,
      prompt:
        "Extract the job posting's title, the hiring company's name, the company's primary website domain, and the job location (city, state, and/or country). If this is a company careers listing rather than a single job, set job_title to null but still return the company.",
      schema: {
        type: "object",
        properties: {
          job_title: { type: ["string", "null"] },
          company_name: { type: ["string", "null"] },
          company_domain: { type: ["string", "null"] },
          job_location: { type: ["string", "null"] },
        },
      },
    },
  });
  const j = res?.json;
  const companyName = clean(j?.company_name);
  if (!companyName) return null;
  const domain = pickDomain(clean(j?.company_domain), pageUrl);
  return {
    jobTitle: clean(j?.job_title),
    companyName: normalizeCompany(companyName),
    domain,
    jobLocation: clean(j?.job_location),
    source: "llm",
  };
}

async function resolveGeneric(url: string): Promise<ResolvedJob> {
  const page = await callOrthogonal<SerperResponse>({
    api: "serper-scrape",
    path: "/",
    method: "POST",
    body: { url, includeMarkdown: true },
  });

  // Prefer structured JSON-LD when the page provides it (free + reliable).
  const ld = findJobPosting(page?.jsonld);
  if (ld) {
    const resolved = fromJsonLd(ld, url);
    if (resolved?.companyName) return resolved;
  }

  // Otherwise let the LLM read the rendered markdown.
  const md = page?.markdown || page?.text;
  if (md && md.trim()) {
    const resolved = await llmExtract(md, url);
    if (resolved?.companyName) return resolved;
  }

  // Nothing usable — signal an empty resolution (caller turns this into 422).
  return { jobTitle: null, companyName: "", domain: null, jobLocation: null, source: "llm" };
}

/** Resolve any job/careers URL → { jobTitle, companyName, domain }. Throws on
 *  a hard upstream failure (caller maps to 502); returns an empty companyName
 *  when the page yields nothing identifiable (caller maps to 422). */
export function resolveJob(rawUrl: string): Promise<ResolvedJob> {
  if (isLinkedInHost(rawUrl)) {
    const canonical = canonicalizeLinkedInJobUrl(rawUrl);
    if (canonical) return resolveLinkedIn(canonical);
    // A LinkedIn URL that isn't a job posting (profile, /company, feed) — the
    // generic scraper would just hit the auth wall, so don't spend on it.
    return Promise.resolve({ jobTitle: null, companyName: "", domain: null, jobLocation: null, source: "linkedin" });
  }
  return resolveGeneric(rawUrl);
}
