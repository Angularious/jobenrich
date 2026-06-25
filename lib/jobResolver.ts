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
  source: "linkedin" | "jsonld" | "llm" | "workday" | "google" | "oracle";
  cost: number; // real USD spent resolving this URL (for the daily-cap ledger)
}

// The resolve helpers below build everything except `cost`; resolveGeneric/
// resolveLinkedIn stamp the cost based on which calls actually fired.
type ResolvedFields = Omit<ResolvedJob, "cost">;

// Hosts that are ATS/job-board infrastructure or social/aggregator sites, not
// the hiring company — never treat these as the company's own domain.
const ATS_HOSTS =
  /(^|\.)(myworkdayjobs\.com|bamboohr\.com|greenhouse\.io|gem\.com|lever\.co|ashbyhq\.com|workable\.com|smartrecruiters\.com|icims\.com|jobvite\.com|taleo\.net|successfactors\.com|paylocity\.com|eddy\.com|jobs\.[a-z]+)$/i;
const NON_COMPANY_HOSTS =
  /(^|\.)(linkedin\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|crunchbase\.com|glassdoor\.com|indeed\.com|youtube\.com)$/i;

// Hosts that consistently DEFEAT automated reading — consumer aggregators with
// anti-bot walls (Serper hangs to the scrape timeout) and login-gated
// application portals. We fast-fail these to the UNREADABLE guidance instead of
// burning ~25s + $0.02 on a scrape that won't succeed. (Measured this session:
// indeed/glassdoor/ziprecruiter time out; ADP/iCIMS/Taleo are login-gated.)
// IMPORTANT: this is NOT the ATS_HOSTS list — Greenhouse/Lever/Ashby/Workable/
// SmartRecruiters scrape fine and Workday has an API, so they must stay OFF here.
const UNSCRAPEABLE_HOSTS =
  /(^|\.)(indeed\.com|glassdoor\.com|ziprecruiter\.com|icims\.com|taleo\.net|adp\.com|paycomonline\.net)$/i;

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
  return { jobTitle, companyName, domain, jobLocation, source: "linkedin", cost: 0.09 };
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

function fromJsonLd(ld: JobPostingLD, pageUrl: string): ResolvedFields | null {
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

async function llmExtract(markdown: string, pageUrl: string): Promise<ResolvedFields | null> {
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
  }, { timeoutMs: 25_000 }); // LLM extraction — slower than a DB lookup
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

// Free fallback: parse OG/page title from Serper metadata before paying for
// LLM extraction. Handles "Job Title at Company [| ATS]" patterns common on
// Lever, some company career pages, and similar ATSes.
function fromOgMeta(
  meta: Record<string, unknown> | undefined,
  pageUrl: string
): ResolvedFields | null {
  if (!meta) return null;
  // Serper may use ogTitle or og:title depending on version.
  const raw =
    (meta.ogTitle as unknown) ??
    (meta["og:title"] as unknown) ??
    (meta.title as unknown);
  const title = clean(raw);
  if (!title || title.length < 6) return null;

  // Match "Job Title at Company [| ATS …]" — very common on Lever, Ashby, etc.
  const m = title.match(/^(.+?)\s+at\s+([A-Za-z][\w\s&,.'"-]{1,50}?)(?:\s*[\|–\-].*)?$/);
  if (!m) return null;
  const jobTitle = m[1].trim();
  const company = m[2].trim();
  if (!company || company.length < 2) return null;
  const normalized = normalizeCompany(company);
  if (!normalized) return null;
  return {
    jobTitle,
    companyName: normalized,
    domain: pickDomain(null, pageUrl),
    jobLocation: null,
    source: "llm",
  };
}

async function resolveGeneric(url: string): Promise<ResolvedJob> {
  const page = await callOrthogonal<SerperResponse>(
    {
      api: "serper-scrape",
      path: "/",
      method: "POST",
      body: { url, includeMarkdown: true },
    },
    { timeoutMs: 25_000 } // renders JS — legitimately slower than a DB lookup
  );
  // Serper always ran ($0.02); the LLM step adds $0.025 if reached.
  let cost = 0.02;

  // Step 1 (free): structured JSON-LD — most reliable when present.
  const ld = findJobPosting(page?.jsonld);
  if (ld) {
    const resolved = fromJsonLd(ld, url);
    if (resolved?.companyName) return { ...resolved, cost };
  }

  // Step 2 (free): OG/page title heuristic — saves $0.025 for common ATS
  // patterns ("Title at Company | Lever") when JSON-LD is absent.
  const ogResolved = fromOgMeta(page?.metadata as Record<string, unknown> | undefined, url);
  if (ogResolved?.companyName) {
    console.log(`[search] OG meta fallback: "${ogResolved.jobTitle}" @ "${ogResolved.companyName}"`);
    return { ...ogResolved, cost };
  }

  // Step 3 ($0.025): LLM reads the rendered markdown — handles everything else.
  const md = page?.markdown || page?.text;
  if (md && md.trim()) {
    cost += 0.025;
    const resolved = await llmExtract(md, url);
    if (resolved?.companyName) return { ...resolved, cost };
  }

  // Nothing usable — signal an empty resolution (caller turns this into 422).
  return { jobTitle: null, companyName: "", domain: null, jobLocation: null, source: "llm", cost };
}

/* ── Workday branch (public CXS JSON API) ────────────────────────────── */

// Workday career sites are JS SPAs that the generic scraper renders only
// flakily (intermittent "Scraping failed" 500s). Every Workday tenant exposes a
// public, unauthenticated JSON API for a posting, which is deterministic and
// free — so we hit it directly. This is the one place we bypass callOrthogonal:
// it's a public ATS endpoint, not paid/Orthogonal provider data, and Serper
// refuses JSON URLs (400) so it can't be proxied through the wrapper.
const WORKDAY_HOST = /(^|\.)myworkdayjobs\.com$/i;

interface WorkdayCxs {
  jobPostingInfo?: {
    title?: string | null;
    location?: string | null;
    country?: { descriptor?: string | null } | null;
    jobPostingSiteId?: string | null;
  } | null;
  hiringOrganization?: { name?: string | null } | null;
}

// Some Workday tenants prefix hiringOrganization.name with an internal
// cost-center code ("200 Protiviti Inc." is really "Protiviti" — measured:
// ContactOut returns 0 for "200 Protiviti", 25 for "Protiviti"). Strip a
// leading run of ≥3 digits + space — BUT only when those digits are NOT part of
// the public site slug (`jobPostingSiteId`). A cost-center code is an internal
// accounting number absent from the slug ("200" ∉ "ProtivitiNA" → strip), while
// a genuine brand number appears in it ("180" ∈ "180Medical…", "365" ∈
// "365RetailMarkets" → keep), so real names like "180 Medical" survive. When
// the slug is missing we DON'T strip — mangling a real name is worse than
// leaving a rare code in place. Workday-only — other resolvers lack this.
function stripWorkdayCostCenter(name: string, siteId: string | null): string {
  const m = name.match(/^(\d{3,})\s+/);
  if (!m) return name;
  if (!siteId || siteId.includes(m[1])) return name; // brand number, or can't confirm → keep
  const stripped = name.slice(m[0].length).trim();
  return stripped || name; // never strip the whole name away
}

/** Map a Workday posting URL to its CXS JSON endpoint:
 *  https://{host}/[locale/]{site}/(job|details)/{jobpath}
 *    → https://{host}/wday/cxs/{tenant}/{site}/job/{jobpath}
 *  Returns null if the URL isn't a recognizable Workday job posting. */
export function workdayCxsUrl(rawUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!WORKDAY_HOST.test(u.hostname)) return null;
  const tenant = u.hostname.split(".")[0];
  const parts = u.pathname.split("/").filter(Boolean);
  // The site segment sits directly before the "job"/"details" marker (any
  // leading locale like "en-US" is thus skipped automatically).
  const marker = parts.findIndex((p) => p === "job" || p === "details");
  if (marker < 1) return null;
  const site = parts[marker - 1];
  const jobPath = parts.slice(marker + 1).join("/");
  if (!tenant || !site || !jobPath) return null;
  return `${u.origin}/wday/cxs/${tenant}/${site}/job/${jobPath}`;
}

async function resolveWorkday(rawUrl: string): Promise<ResolvedJob | null> {
  const cxs = workdayCxsUrl(rawUrl);
  if (!cxs) return null;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8_000);
  try {
    const res = await fetch(cxs, { headers: { Accept: "application/json" }, signal: ac.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as WorkdayCxs;
    const info = data?.jobPostingInfo;
    const companyRaw = clean(data?.hiringOrganization?.name);
    if (!companyRaw) return null; // no company → let the generic scraper try
    // Combine the location label with the country so the people finder can
    // country-ify it (e.g. "Waltham Office (POST), United States of America").
    const jobLocation =
      [clean(info?.location), clean(info?.country?.descriptor)].filter(Boolean).join(", ") || null;
    return {
      jobTitle: clean(info?.title),
      companyName: normalizeCompany(stripWorkdayCostCenter(companyRaw, clean(info?.jobPostingSiteId))),
      domain: pickDomain(null, rawUrl), // host is the ATS → null; finder uses name
      jobLocation,
      source: "workday",
      cost: 0,
    };
  } catch {
    return null; // any failure → fall back to the generic scraper
  } finally {
    clearTimeout(timer);
  }
}

/* ── Google Careers branch (slug parse) ──────────────────────────────── */

// Serper refuses to scrape google.com ("Invalid 'url' parameter - Google is not
// allowed"), so the generic path can never resolve Google's own careers
// postings. We don't need it: the company is Google, and the title is in the URL
// slug (/jobs/results/{id}-{title-slug}/). Parse it directly — no network call,
// deterministic, free. (Location isn't in the URL → null → finder defaults to
// US, same as any role with no stated country.)
function resolveGoogleCareers(rawUrl: string): ResolvedJob | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  // google.com/about/careers/… (current) or careers.google.com/… (legacy) —
  // both are Google's own careers site with the same /jobs/results/{id}-{slug} shape.
  const onGoogleCareers =
    (/^(www\.)?google\.com$/i.test(u.hostname) && /\/about\/careers\//i.test(u.pathname)) ||
    /^careers\.google\.com$/i.test(u.hostname);
  if (!onGoogleCareers) return null;
  const m = u.pathname.match(/\/jobs\/results\/\d+-([^/]+)/);
  let jobTitle: string | null = null;
  if (m) {
    let slug = m[1];
    try {
      slug = decodeURIComponent(slug);
    } catch {
      /* malformed %-encoding — use the raw slug */
    }
    jobTitle = slug.replace(/-/g, " ").trim() || null;
  }
  return { jobTitle, companyName: "Google", domain: "google.com", jobLocation: null, source: "google", cost: 0 };
}

/* ── Oracle Recruiting Cloud branch (public Candidate-Experience API) ──── */

// Oracle Recruiting Cloud (used by JPMC, Goldman, many F500) is a JS SPA; the
// generic scraper grabs the page chrome ("…Candidate Experience page") as the
// company, which finds nobody. The candidate-experience site has a public,
// unauthenticated REST API for a requisition — hit it directly (same sanctioned
// ATS-API bypass as Workday; falls back to Serper on any miss).
const ORACLE_HOST = /(^|\.)oraclecloud\.com$/i;

interface OracleCe {
  items?: Array<{
    Title?: string | null;
    PrimaryLocation?: string | null;
    LegalEmployer?: string | null;
    Organization?: string | null;
    CorporateDescriptionStr?: string | null;
  }> | null;
}

/** Map an Oracle CandidateExperience posting URL to its CE REST endpoint.
 *  …/CandidateExperience/<locale>/sites/{site}/job/{jobId} →
 *  …/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails?finder=ById;Id="{jobId}",siteNumber={site}
 *  Returns null if it isn't a recognizable Oracle CE job posting. */
function oracleCeUrl(rawUrl: string): string | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (!ORACLE_HOST.test(u.hostname) || !/\/CandidateExperience\//i.test(u.pathname)) return null;
  const site = u.pathname.match(/\/sites\/([^/]+)/)?.[1];
  const jobId = u.pathname.match(/\/job\/(\d+)/)?.[1];
  if (!site || !jobId) return null;
  const finder = `finder=ById;Id=%22${jobId}%22,siteNumber=${encodeURIComponent(site)}`;
  return `${u.origin}/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails?expand=all&onlyData=true&${finder}`;
}

// Oracle often leaves LegalEmployer/Organization null; the company name reliably
// leads the CorporateDescriptionStr boilerplate ("JPMorganChase, one of the
// oldest…"). Strip HTML and take the leading clause up to the first natural break.
function oracleLeadCompany(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const m = text.match(/^(?:At\s+)?(.+?)(?:,| is | are | offers | provides | has been |\. | - )/);
  const name = (m ? m[1] : text).trim();
  return name.length >= 2 && name.length <= 80 ? name : null;
}

async function resolveOracle(rawUrl: string): Promise<ResolvedJob | null> {
  const api = oracleCeUrl(rawUrl);
  if (!api) return null;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8_000);
  try {
    const res = await fetch(api, { headers: { Accept: "application/json" }, signal: ac.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as OracleCe;
    const item = data?.items?.[0];
    if (!item) return null;
    const companyRaw =
      clean(item.LegalEmployer) ?? clean(item.Organization) ?? oracleLeadCompany(item.CorporateDescriptionStr);
    if (!companyRaw) return null; // no usable company → let the generic scraper try
    return {
      jobTitle: clean(item.Title),
      companyName: normalizeCompany(companyRaw),
      domain: pickDomain(null, rawUrl), // ATS host → null; finder uses name
      jobLocation: clean(item.PrimaryLocation),
      source: "oracle",
      cost: 0,
    };
  } catch {
    return null; // any failure → fall back to the generic scraper
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve any job/careers URL → { jobTitle, companyName, domain }. Throws on
 *  a hard upstream failure (caller maps to 502); returns an empty companyName
 *  when the page yields nothing identifiable (caller maps to 422). */
export async function resolveJob(rawUrl: string): Promise<ResolvedJob> {
  if (isLinkedInHost(rawUrl)) {
    const canonical = canonicalizeLinkedInJobUrl(rawUrl);
    if (canonical) return resolveLinkedIn(canonical);
    // A LinkedIn URL that isn't a job posting (profile, /company, feed) — the
    // generic scraper would just hit the auth wall, so don't spend on it.
    return { jobTitle: null, companyName: "", domain: null, jobLocation: null, source: "linkedin", cost: 0 };
  }
  // Google careers: Serper blocks google.com, but the slug carries the title.
  const goog = resolveGoogleCareers(rawUrl);
  if (goog) return goog;
  // Known-unscrapeable hosts (anti-bot aggregators, login-gated portals): skip
  // the doomed ~25s scrape and signal "unreadable" instantly (caller → 422 +
  // guidance to use LinkedIn/Greenhouse/Workday/a careers page). cost 0.
  if (UNSCRAPEABLE_HOSTS.test(hostFromUrl(rawUrl) ?? "")) {
    return { jobTitle: null, companyName: "", domain: null, jobLocation: null, source: "llm", cost: 0 };
  }
  // Workday: try the deterministic JSON API first, fall back to the scraper.
  if (WORKDAY_HOST.test(hostFromUrl(rawUrl) ?? "")) {
    const wd = await resolveWorkday(rawUrl);
    if (wd) return wd;
  }
  // Oracle Recruiting Cloud: try its public CE API, fall back to the scraper.
  if (ORACLE_HOST.test(hostFromUrl(rawUrl) ?? "")) {
    const orc = await resolveOracle(rawUrl);
    if (orc) return orc;
  }
  return resolveGeneric(rawUrl);
}
