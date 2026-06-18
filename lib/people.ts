import { callOrthogonal } from "@/lib/orthogonal";

export interface Person {
  name: string;
  title: string;
  linkedinUrl: string;
  profilePictureUrl: string | null;
  source: "contactout" | "coresignal";
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

interface ContactOutProfile {
  full_name?: string;
  title?: string;
  headline?: string;
  profile_picture_url?: string;
}
interface ContactOutSearchResponse {
  profiles?: Record<string, ContactOutProfile>;
}

function contactOutSearch(body: Record<string, unknown>) {
  return callOrthogonal<ContactOutSearchResponse>({
    api: "contactout",
    path: "/v1/people/search",
    method: "POST",
    body: { ...body, page: 1, reveal_info: false },
  });
}

function fromContactOut(
  resp: ContactOutSearchResponse | undefined,
  limit: number
): Person[] {
  const profiles = resp?.profiles;
  if (!profiles || typeof profiles !== "object") return [];
  return Object.entries(profiles)
    .slice(0, limit)
    .map(([url, p]) => ({
      name: p.full_name ?? "",
      title: p.title ?? p.headline ?? "",
      linkedinUrl: url,
      profilePictureUrl: p.profile_picture_url ?? null,
      source: "contactout" as const,
    }));
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
   Each step fires only if the previous returned zero people. A step that
   throws is treated as empty and we move on. If EVERY step throws (i.e. we
   never got a clean response), rethrow so the caller can flag an error —
   distinct from a successful search that simply found nobody.            */

async function waterfall(
  label: string,
  steps: Array<() => Promise<Person[]>>
): Promise<Person[]> {
  let anySuccess = false;
  let lastErr: unknown;
  for (const step of steps) {
    try {
      const people = await step();
      anySuccess = true;
      if (people.length) {
        console.log(`[people] ${label}: ${people.length} found`);
        return people;
      }
    } catch (err) {
      lastErr = err;
      console.error(`[people] ${label} step failed:`, err);
    }
  }
  if (!anySuccess && lastErr) throw lastErr;
  console.log(`[people] ${label}: 0 found`);
  return [];
}

export interface FinderInput {
  company: string;
  domain?: string | null;
}

// People in similar roles at the company — target 5.
// A resolved `domain` is a strong, unambiguous company match; the name alone
// matches namesakes ("Orthogonal" → several companies). So when we have a
// domain we search by domain ONLY — better to return nothing than people from
// a different same-named company. Name + Coresignal steps are the fallback for
// when no domain was resolved.
export function findSimilarPeople(
  input: FinderInput & { jobTitle?: string }
): Promise<Person[]> {
  const { company, domain, jobTitle } = input;
  const LIMIT = 5;
  const titles = jobTitle ? titleVariants(jobTitle) : [];
  const steps: Array<() => Promise<Person[]>> = [];
  if (domain) {
    if (titles.length)
      steps.push(() =>
        contactOutSearch({ domain: [domain], job_title: titles }).then((r) => fromContactOut(r, LIMIT))
      );
    steps.push(() => contactOutSearch({ domain: [domain] }).then((r) => fromContactOut(r, LIMIT)));
  } else {
    if (titles.length)
      steps.push(() =>
        contactOutSearch({ company: [company], job_title: titles }).then((r) => fromContactOut(r, LIMIT))
      );
    steps.push(() => contactOutSearch({ company: [company] }).then((r) => fromContactOut(r, LIMIT)));
    steps.push(() =>
      coresignalSearch({ experience_company_name: company }).then((r) => fromCoresignal(r, LIMIT, company))
    );
  }
  return waterfall("similar", steps);
}

// Recruiters / talent at the company — target 3. Same domain-first rule: with a
// domain we only match recruiters at that exact company (none → empty, which is
// correct); without one we fall back to name + Coresignal.
export function findRecruiters(input: FinderInput): Promise<Person[]> {
  const { company, domain } = input;
  const LIMIT = 3;
  const steps: Array<() => Promise<Person[]>> = [];
  if (domain) {
    steps.push(() =>
      contactOutSearch({ domain: [domain], job_title: RECRUITER_TITLES }).then((r) =>
        fromContactOut(r, LIMIT)
      )
    );
  } else {
    steps.push(() =>
      contactOutSearch({ company: [company], job_title: RECRUITER_TITLES }).then((r) =>
        fromContactOut(r, LIMIT)
      )
    );
    steps.push(() =>
      coresignalSearch({
        experience_company_name: company,
        experience_title: "Recruiter",
      }).then((r) => fromCoresignal(r, LIMIT, company))
    );
    // Founders/early teams often hire directly — fall back to anyone at the company.
    steps.push(() =>
      coresignalSearch({ experience_company_name: company }).then((r) =>
        fromCoresignal(r, LIMIT, company)
      )
    );
  }
  return waterfall("recruiters", steps);
}

// Alumni from a given school at the company — target 5.
export function findAlumni(input: FinderInput & { school: string }): Promise<Person[]> {
  const { company, domain, school } = input;
  const LIMIT = 5;
  // Domain-first, same as the other finders: with a domain, match alumni at the
  // exact company only (avoids same-named-company alumni); without one, fall
  // back to the company name.
  const steps = domain
    ? [
        () =>
          contactOutSearch({ domain: [domain], education: [school] }).then((r) =>
            fromContactOut(r, LIMIT)
          ),
      ]
    : [
        () =>
          contactOutSearch({ company: [company], education: [school] }).then((r) =>
            fromContactOut(r, LIMIT)
          ),
      ];
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
    try {
      const url = c.startsWith("http") ? c : `https://${c}`;
      const host = new URL(url).hostname.replace(/^www\./, "");
      if (host && !host.endsWith("linkedin.com")) return host;
    } catch {
      /* not a URL — skip */
    }
  }
  return null;
}
