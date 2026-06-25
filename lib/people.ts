import { getDomain } from "tldts";
import { callOrthogonal } from "@/lib/orthogonal";

// Profile data already present in the ContactOut search response (no extra
// cost). Stored as raw strings because that's how ContactOut formats them.
export interface SearchProfile {
  bio: string | null;
  experience: string[]; // "Title at Company in YYYY - YYYY/Present"
  education: string[];  // "Degree at School in YYYY - YYYY"
  // Whether ContactOut has an email — lets the enrich route skip the $0.33
  // ContactOut reveal step when it's known to have none. (Phone availability
  // is intentionally not tracked — this site never surfaces phone numbers.)
  contactAvailability: { email: boolean } | null;
}

export interface Person {
  name: string;
  title: string;
  linkedinUrl: string;
  profilePictureUrl: string | null;
  source: "contactout" | "coresignal";
  searchProfile?: SearchProfile;
  // Relevance signals captured free from the ContactOut search response. Used
  // server-side to drop ex-employees and sort in-country people first; the UI
  // doesn't render them. Absent on Coresignal results (the preview lacks them).
  country?: string | null;
  currentCompany?: { name: string | null; domain: string | null };
}

// Recruiter / people-ops titles, broad enough to catch how teams self-describe.
const RECRUITER_TITLES = [
  "recruiter",
  "technical recruiter",
  "university recruiter",
  "campus recruiter",
  "senior recruiter",
  "talent acquisition",
  "talent acquisition specialist",
  "talent acquisition partner",
  "talent partner",
  "sourcer",
  "head of talent",
  "head of recruiting",
  "people operations",
];

/* ── ContactOut (/v1/people/search, reveal_info:false → $0.05) ───────── */

interface ContactOutAvailability {
  phone?: boolean;
  work_email?: boolean;
  personal_email?: boolean;
}
interface ContactOutCompany {
  name?: string;
  logo_url?: string;
  size?: number;
  overview?: string;
  headquarter?: string;
  founded_at?: number;
  revenue?: number;
  domain?: string;
}
interface ContactOutProfile {
  full_name?: string;
  title?: string;
  headline?: string;
  profile_picture_url?: string;
  summary?: string;
  experience?: string[];
  education?: string[];
  contact_availability?: ContactOutAvailability;
  company?: ContactOutCompany;
  country?: string; // top-level person country, e.g. "United States" / "India"
}
interface ContactOutSearchResponse {
  profiles?: Record<string, ContactOutProfile>;
}

// Company-level metadata surfaced for free from the ContactOut search response.
export interface CompanyMeta {
  logoUrl: string | null;
  size: number | null;       // employee count bucket
  overview: string | null;   // company description
  hq: string | null;         // headquarter string
  founded: number | null;    // founding year
  revenue: number | null;    // USD
}

function contactOutSearch(body: Record<string, unknown>) {
  return callOrthogonal<ContactOutSearchResponse>({
    api: "contactout",
    path: "/v1/people/search",
    method: "POST",
    body: { ...body, page: 1, reveal_info: false },
  });
}

function coMeta(c: ContactOutCompany | undefined): CompanyMeta | null {
  if (!c) return null;
  return {
    logoUrl: (typeof c.logo_url === "string" && c.logo_url) ? c.logo_url : null,
    size: (typeof c.size === "number" && c.size > 0) ? c.size : null,
    overview: (typeof c.overview === "string" && c.overview.trim()) ? c.overview.trim() : null,
    hq: (typeof c.headquarter === "string" && c.headquarter.trim()) ? c.headquarter.trim() : null,
    founded: (typeof c.founded_at === "number" && c.founded_at > 1800) ? c.founded_at : null,
    revenue: (typeof c.revenue === "number" && c.revenue > 0) ? c.revenue : null,
  };
}

function fromContactOut(
  resp: ContactOutSearchResponse | undefined,
  limit: number
): { people: Person[]; companyMeta: CompanyMeta | null } {
  const profiles = resp?.profiles;
  if (!profiles || typeof profiles !== "object") return { people: [], companyMeta: null };
  let companyMeta: CompanyMeta | null = null;
  const people = Object.entries(profiles)
    .slice(0, limit)
    .map(([url, p]) => {
      // Grab company meta from the first profile that has it.
      if (!companyMeta) companyMeta = coMeta(p.company);
      const ca = p.contact_availability;
      const searchProfile: SearchProfile | undefined =
        p.summary || p.experience?.length || p.education?.length || ca
          ? {
              bio: p.summary?.trim() || null,
              experience: p.experience ?? [],
              education: p.education ?? [],
              contactAvailability: ca
                ? { email: Boolean(ca.work_email || ca.personal_email) }
                : null,
            }
          : undefined;
      return {
        name: p.full_name ?? "",
        title: p.title ?? p.headline ?? "",
        linkedinUrl: url,
        profilePictureUrl: p.profile_picture_url ?? null,
        source: "contactout" as const,
        searchProfile,
        country: (typeof p.country === "string" && p.country.trim()) ? p.country.trim() : null,
        currentCompany: p.company
          ? {
              name: (typeof p.company.name === "string" && p.company.name.trim()) ? p.company.name.trim() : null,
              domain: (typeof p.company.domain === "string" && p.company.domain.trim()) ? p.company.domain.trim() : null,
            }
          : undefined,
      };
    });
  return { people, companyMeta };
}

/* ── Coresignal (employee preview → $0.021) ──────────────────────────── */

interface CoresignalEmployee {
  full_name?: string;
  title?: string;
  headline?: string;
  profile_url?: string;
  company_name?: string;
}

function coresignalSearch(body: Record<string, unknown>) {
  return callOrthogonal<CoresignalEmployee[]>({
    api: "coresignal",
    path: "/v2/employee_base/search/filter/preview",
    method: "POST",
    body,
  });
}

// Coresignal's experience_company_name matches anyone who EVER worked there,
// so prefer rows whose *current* company matches the target. Fall back to the
// raw list only if nothing matches (better stale results than none).
function fromCoresignal(
  rows: CoresignalEmployee[] | undefined,
  limit: number,
  company: string
): Person[] {
  if (!Array.isArray(rows)) return [];
  const needle = company.trim().toLowerCase();
  const current = needle
    ? rows.filter((r) => (r.company_name ?? "").toLowerCase().includes(needle))
    : rows;
  const list = current.length ? current : rows;
  return list
    .filter((r) => typeof r.profile_url === "string" && r.profile_url)
    .slice(0, limit)
    .map((r) => ({
      name: r.full_name ?? "",
      title: r.title || r.headline || "",
      linkedinUrl: r.profile_url as string,
      profilePictureUrl: null,
      source: "coresignal" as const,
    }));
}

/* ── Waterfall runner ────────────────────────────────────────────────
   Each step fires only if the previous returned zero people. CompanyMeta
   is captured from the first step that returns it (even if that step
   returned no people) so we still get logo/context on empty results.
   `cost` accumulates the real USD of every step that ran, so the route can
   reconcile the daily cap to actual spend (not a flat estimate).          */

// A single step reports the people it found, any company meta, and what the
// call cost ($0.05 ContactOut search, $0.021 Coresignal preview).
type StepOutput = { people: Person[]; companyMeta: CompanyMeta | null; cost: number };
// What a finder returns: the winning people + meta + total spent across steps.
type StepResult = { people: Person[]; companyMeta: CompanyMeta | null; cost: number };

async function waterfall(
  label: string,
  steps: Array<() => Promise<StepOutput>>
): Promise<StepResult> {
  let anySuccess = false;
  let lastErr: unknown;
  let bestMeta: CompanyMeta | null = null;
  let totalCost = 0;
  for (const step of steps) {
    try {
      const { people, companyMeta, cost } = await step();
      anySuccess = true;
      totalCost += cost; // a call completed → it was charged
      if (companyMeta && !bestMeta) bestMeta = companyMeta;
      if (people.length) {
        console.log(`[people] ${label}: ${people.length} found ($${totalCost.toFixed(3)})`);
        return { people, companyMeta: bestMeta, cost: totalCost };
      }
    } catch (err) {
      lastErr = err;
      console.error(`[people] ${label} step failed:`, err);
    }
  }
  if (!anySuccess && lastErr) throw lastErr;
  console.log(`[people] ${label}: 0 found ($${totalCost.toFixed(3)})`);
  return { people: [], companyMeta: bestMeta, cost: totalCost };
}

export interface FinderInput {
  company: string;
  domain?: string | null;
  location?: string | null;
}

// People in similar roles at the company — target 5.
// A resolved `domain` is a strong, unambiguous company match; the name alone
// matches namesakes ("Orthogonal" → several companies). So we try the domain
// FIRST and prefer it. But the domain can be imperfect (e.g. resolved from a
// page host the provider doesn't index), and a domain miss returns zero — so
// the company-name + Coresignal steps run AFTER as a fallback that only fires
// when the domain found nobody (waterfall = fire-only-on-empty). A name match
// beats returning nobody; the same-namesake risk only applies when domain
// returns the WRONG people, not when it returns none.
export function findSimilarPeople(
  input: FinderInput & { jobTitle?: string }
): Promise<StepResult> {
  const { company, domain, jobTitle } = input;
  const country = locationCountry(input.location);
  const biasCountry = sortCountry(input.location);
  // ContactOut returns a page of up to ~25 profiles for the same flat $0.05, so
  // we keep the whole page (the UI shows 5 + a "show more"). No extra cost.
  const LIMIT = 25;
  const titles = jobTitle ? titleVariants(jobTitle) : [];
  const steps: Array<() => Promise<StepResult>> = [];
  // `enforce` = enforce the job's country. When set (and we know the country) the
  // query gets ContactOut's `location` filter AND a hard post-filter on the
  // profile `country` field. The API location filter isn't just a sort — it
  // changes WHICH 25 profiles come back (e.g. Coca-Cola "company+title+US"
  // returns 25 US vs 14 US unfiltered), so country-enforced steps surface far
  // more in-country people than post-filtering an unfiltered page would.
  const co = (q: Record<string, unknown>, enforce: boolean) =>
    contactOutSearch(enforce && country ? { ...q, location: [country] } : q).then((r) => {
      const { people, companyMeta } = fromContactOut(r, LIMIT);
      let out = dropExEmployees(people, company, domain);
      if (enforce && country) out = out.filter((p) => p.country && sameCountry(p.country, country));
      return { people: inCountryFirst(out, biasCountry), companyMeta, cost: 0.05 };
    });
  const cs = (q: Record<string, unknown>) =>
    coresignalSearch(q).then((r) => ({ people: fromCoresignal(r, LIMIT, company), companyMeta: null, cost: 0.021 }));

  // ORDER MATTERS: all country-enforced steps run BEFORE any country-relaxed one.
  // The waterfall fires the next step only on zero results, so an unfiltered step
  // that returns out-of-country people would otherwise win and stop before a
  // later in-country step ever runs (this is the bug that made Coca-Cola's
  // recruiters all Philippines). Same call count as before — reordered + filtered.
  if (country) {
    // Tier 1 — in-country, role-matched (domain first, then company name).
    if (domain && titles.length) steps.push(() => co({ domain: [domain], job_title: titles }, true));
    if (titles.length) steps.push(() => co({ company: [company], job_title: titles }, true));
    // Tier 2 — role-matched but country-relaxed: a person in the exact role
    // abroad is still a useful "similar person" if nobody in-country was found.
    if (titles.length) steps.push(() => co({ company: [company], job_title: titles }, false));
    // Tier 3 — role-agnostic but back to in-country: someone at the company here.
    steps.push(() => co(domain ? { domain: [domain] } : { company: [company] }, true));
  } else {
    // No usable country (remote / unparseable): role-matched, then role-agnostic.
    if (domain && titles.length) steps.push(() => co({ domain: [domain], job_title: titles }, false));
    if (titles.length) steps.push(() => co({ company: [company], job_title: titles }, false));
    steps.push(() => co(domain ? { domain: [domain] } : { company: [company] }, false));
  }
  steps.push(() => cs({ experience_company_name: company }));
  return waterfall("similar", steps);
}

// "Remote" / "Worldwide" / "Anywhere" locations don't map to a real place —
// passing them to ContactOut's location filter would just return nobody.
function isVirtualLocation(loc: string): boolean {
  return /\b(remote|anywhere|worldwide|global|distributed|hybrid)\b/i.test(loc);
}

const US_HINT = /\b(united states|u\.?\s?s\.?\s?a?\.?|usa)\b/i;
// US state names + 2-letter codes, so "San Francisco, CA" or "Austin, Texas"
// (no explicit country) still resolve to the US rather than a bogus "CA" filter.
const US_STATE =
  /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC|alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming)\b/i;

// Reduce a job location to a COUNTRY-level filter for ContactOut. Recruiters
// (and similar-role people) at a company are spread across the country or work
// remotely, so filtering by the exact city ("Boston, MA, United States") is too
// narrow — it usually returns nobody and the waterfall then falls through to an
// unfiltered step that surfaces international profiles. Country-level keeps
// results in-region (e.g. US) while still matching across cities.
//   "Boston, Massachusetts, United States" → "United States"
//   "Hyderabad, Telangana, India"          → "India"
//   "Remote"                                → null (no usable place)
function locationCountry(loc: string | null | undefined): string | null {
  if (!loc) return null;
  const t = loc.trim();
  if (!t || isVirtualLocation(t)) return null;
  if (US_HINT.test(t) || US_STATE.test(t)) return "United States";
  // "City, Region, Country" → the last comma-segment is the country. A bare
  // city with no country is too ambiguous to country-ify, so skip filtering.
  const parts = t.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 1] : null;
}

// The country to bias the in-country-first sort toward. Same as locationCountry,
// but defaults to the US when the job location is missing/unparseable (per the
// "default to US" rule) — EXCEPT for explicitly remote roles, which get no bias
// (a remote job shouldn't favour any one country).
function sortCountry(loc: string | null | undefined): string | null {
  if (loc && isVirtualLocation(loc)) return null;
  return locationCountry(loc) ?? "United States";
}

// Country equality with US-synonym normalization ("USA"/"U.S." === "United
// States"). Both sides come from comparable sources (full country names), so a
// normalized case-insensitive compare is enough.
function sameCountry(a: string, b: string): boolean {
  const norm = (s: string) => (US_HINT.test(s) ? "united states" : s.trim().toLowerCase());
  return norm(a) === norm(b);
}

// Stable in-country-first partition (SOFT — removes nobody). Same-country people
// move to the front so the UI's visible 5 are in-region; out-of-country (and
// unknown-country) people follow under "show more". No-op when there's no
// country to bias toward (e.g. remote roles).
function inCountryFirst(people: Person[], country: string | null): Person[] {
  if (!country) return people;
  const here: Person[] = [];
  const rest: Person[] = [];
  for (const p of people) {
    if (p.country && sameCountry(p.country, country)) here.push(p);
    else rest.push(p);
  }
  return [...here, ...rest];
}

// Drop people whose CURRENT employer isn't the target company (HARD). The
// company-name and role-agnostic ContactOut steps surface people who only EVER
// worked there (and changed jobs). Match on domain when we have one
// (unambiguous), else on company name. Keep anyone with no current-company
// signal rather than over-dropping.
function dropExEmployees(
  people: Person[],
  company: string,
  domain: string | null | undefined
): Person[] {
  const needle = company.trim().toLowerCase();
  return people.filter((p) => {
    if (!p.currentCompany) return true; // unknown → keep
    const cdom = p.currentCompany.domain;
    const cname = p.currentCompany.name;
    if (domain && cdom) return cdom.toLowerCase() === domain.toLowerCase();
    if (needle && cname) return cname.toLowerCase().includes(needle);
    return true; // no usable signal → keep
  });
}

// Recruiters / talent at the company — target 3. Domain-first, same as the
// people finder: match recruiters at the exact domain first, then fall back to
// the company name + Coresignal only if that found nobody (so an imperfect
// domain no longer means an empty recruiter list).
//
// COUNTRY ENFORCEMENT (the Coca-Cola fix): when the job's country is known, ALL
// country-enforced steps run before any country-relaxed one. Big companies index
// recruiters at offshore shared-services hubs (e.g. Coca-Cola's recruiters under
// `coca-colacompany.com` are a Manila team) — so `domain+title` UNFILTERED
// returned 24 Philippines recruiters and the waterfall stopped there, before the
// `company+title+US` step that returns 25 US recruiters ever ran. Enforced steps
// add ContactOut's `location` filter (which surfaces more in-country people, not
// just reorders) AND a hard post-filter on the profile `country` field.
export function findRecruiters(input: FinderInput): Promise<StepResult> {
  const { company, domain } = input;
  const country = locationCountry(input.location);
  const biasCountry = sortCountry(input.location);
  // Keep the full page (flat $0.05); UI shows 5 + "show more".
  const LIMIT = 25;
  const steps: Array<() => Promise<StepResult>> = [];
  const co = (q: Record<string, unknown>, enforce: boolean) =>
    contactOutSearch(enforce && country ? { ...q, location: [country] } : q).then((r) => {
      const { people, companyMeta } = fromContactOut(r, LIMIT);
      let out = dropExEmployees(people, company, domain);
      if (enforce && country) out = out.filter((p) => p.country && sameCountry(p.country, country));
      return { people: inCountryFirst(out, biasCountry), companyMeta, cost: 0.05 };
    });
  const cs = (q: Record<string, unknown>) =>
    coresignalSearch(q).then((r) => ({ people: fromCoresignal(r, LIMIT, company), companyMeta: null, cost: 0.021 }));

  const T = RECRUITER_TITLES;
  if (country) {
    // In-country first: domain (no namesake risk) → company name.
    if (domain) steps.push(() => co({ domain: [domain], job_title: T }, true));
    steps.push(() => co({ company: [company], job_title: T }, true));
    // Last resort: country-relaxed so a company with only offshore recruiters in
    // ContactOut still shows someone rather than an empty list.
    steps.push(() => co({ company: [company], job_title: T }, false));
  } else {
    if (domain) steps.push(() => co({ domain: [domain], job_title: T }, false));
    steps.push(() => co({ company: [company], job_title: T }, false));
  }
  steps.push(() => cs({ experience_company_name: company, experience_title: "Recruiter" }));
  steps.push(() => cs({ experience_company_name: company }));
  return waterfall("recruiters", steps);
}

// Alumni from a given school at the company. Keep the full page (flat $0.05);
// UI shows 5 + "show more".
export function findAlumni(input: FinderInput & { school: string }): Promise<StepResult> {
  const { company, domain, school } = input;
  const LIMIT = 25;
  const steps: Array<() => Promise<StepResult>> = [];
  // Drop ex-employees (hard) so an alum who left the company isn't surfaced; no
  // country sort — you'd reach out to a school alum at the company wherever they
  // now live.
  const co = (q: Record<string, unknown>) =>
    contactOutSearch(q).then((r) => {
      const { people, companyMeta } = fromContactOut(r, LIMIT);
      return { people: dropExEmployees(people, company, domain), companyMeta, cost: 0.05 };
    });
  if (domain) steps.push(() => co({ domain: [domain], education: [school] }));
  steps.push(() => co({ company: [company], education: [school] }));
  return waterfall("alumni", steps);
}

/* ── Helpers shared with the search route ────────────────────────────── */

// Strip seasonal/intern decorations so "Fall 2026: Employer Brand Intern" →
// "Employer Brand" — a title ContactOut can actually match against.
export function simplifyJobTitle(raw: string): string {
  return raw
    .replace(/^(spring|summer|fall|winter|autumn)\s+\d{4}\s*:\s*/i, "")
    .replace(/\s*\([^)]*\)\s*$/, "") // trailing parenthetical (location/mode noise)
    .replace(/\s*[-–]\s*\d{4}\s*$/, "")
    .replace(/\s+(intern(?:ship)?|co-?op(?:erative)?)\s*$/i, "")
    .trim();
}

// ContactOut matches job_title fairly literally — a trailing specialization
// ("Product Marketing Manager, Exposure Management") returns nothing while the
// head ("Product Marketing Manager") matches. job_title is an OR array, so pass
// both: the full title AND the pre-comma head. No info lost, broadest match.
function titleVariants(title: string): string[] {
  const variants = [title];
  const comma = title.indexOf(",");
  if (comma > 2) {
    const head = title.slice(0, comma).trim();
    if (head.length >= 3) variants.push(head);
  }
  return variants.filter((v, i, a) => Boolean(v) && a.indexOf(v) === i);
}

// Best-effort company domain from the job extraction payload — powers the
// alumni domain fallback. Returns null if no non-LinkedIn host is found.
export function extractDomain(out: Record<string, unknown>): string | null {
  const candidates = [
    out.company_website,
    out.company_domain,
    out.website,
    out.domain,
    out.company_url,
    out.apply_url,
  ];
  for (const c of candidates) {
    if (typeof c !== "string" || !c.trim()) continue;
    // PSL-reduce to the apex (careers.acme.com → acme.com) so the domain is one
    // a people provider can actually match — same rule as jobResolver.
    const host = getDomain(c.startsWith("http") ? c : `https://${c}`);
    if (host && !host.endsWith("linkedin.com")) return host;
  }
  return null;
}
