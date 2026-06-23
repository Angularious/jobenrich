import { getDomain } from "tldts";
import { callOrthogonal } from "@/lib/orthogonal";
import type {
  JobListing,
  JobSalary,
  JobSearchParams,
  JobSearchResult,
} from "@/types/job";

/**
 * Role-first job search backed by Fantastic Jobs `/v1/active-ats` (54 ATS
 * platforms, refreshed hourly). Goes through the SAME `callOrthogonal` wrapper
 * as the rest of the app — no second HTTP client.
 *
 * Confirmed live: both feeds cost **$0.40/call** (the catalog's $0.01 is wrong —
 * the real `payment.amountDollars` is 0.4), and return a **bare array** of job
 * objects at `json.data`. There is intentionally NO cross-user cache here
 * (Orthogonal data policy — see CLAUDE.md). Repeat-search savings are handled by
 * a per-session client-side cache in app/jobs/page.tsx.
 *
 * TWO feeds, same shape, chosen by `params.board`:
 *   - `/v1/active-ats` (default): 54 company career sites (Greenhouse, Lever,
 *     Ashby, Workday, Gem…). Best for full-time roles; thin on internships.
 *   - `/v1/active-jb`: LinkedIn + Wellfound + Y Combinator. Far better intern /
 *     entry-level / startup coverage (verified live). Differs in ONE field that
 *     matters: no `domain_derived` — the employer domain comes from
 *     `org_linkedin_website` instead (normalizeJob reads either).
 * Intern queries (employmentType === "INTERN") auto-route to active-jb.
 */

const DEFAULT_LIMIT = 25;
const DEFAULT_TIME_FRAME = "7d";
const ATS_PATH = "/v1/active-ats";
const JB_PATH = "/v1/active-jb";

// Pick the feed: explicit `board` wins; otherwise intern queries go to the job
// boards (LinkedIn/Wellfound/YC), everything else to the company-ATS feed.
function feedPath(params: JobSearchParams): string {
  if (params.board === "jb") return JB_PATH;
  if (params.board === "ats") return ATS_PATH;
  return params.employmentType?.toUpperCase() === "INTERN" ? JB_PATH : ATS_PATH;
}

// ATS / job-board infrastructure hosts — never a company's own domain. Mirrors
// (a subset of) lib/jobResolver.ts's private ATS_HOSTS. Fantastic Jobs already
// hands us a clean apex in `domain_derived`, so this is a defensive backstop
// for the rare row where it leaks a board host.
// TODO: jobResolver.ts has near-identical ATS-host + apex-domain logic; worth
// consolidating into one shared lib/domains.ts when v1 + v2 are unified.
const ATS_HOSTS =
  /(^|\.)(myworkdayjobs\.com|bamboohr\.com|greenhouse\.io|gem\.com|lever\.co|ashbyhq\.com|workable\.com|smartrecruiters\.com|icims\.com|jobvite\.com|taleo\.net|successfactors\.com|paylocity\.com|eddy\.com)$/i;

/** Clean employer domain or null. Reduces to the registrable apex (so a stray
 *  `careers.x.com` collapses to `x.com`) and rejects ATS/board hosts. */
function normalizeCompanyDomain(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const withProto = raw.startsWith("http") ? raw : `https://${raw}`;
  const apex = getDomain(withProto);
  if (!apex || ATS_HOSTS.test(apex)) return null;
  return apex;
}

/* ── Raw response shape (only the fields we read) ────────────────────── */

interface RawJob {
  id?: number | string;
  title?: string | null;
  organization?: string | null;
  domain_derived?: string | null; // active-ats only
  org_linkedin_website?: string | null; // active-jb employer site (domain source there)
  locations_derived?: string[] | null;
  url?: string | null;
  source?: string | null;
  date_posted?: string | null;
  employment_type?: string[] | string | null;
  ai_employment_type?: string[] | string | null;
  ai_work_arrangement?: string | null;
  ai_experience_level?: string | null;
  ai_salary_min_value?: number | null;
  ai_salary_max_value?: number | null;
  ai_salary_value?: number | null; // point value (no range) — common on active-jb
  ai_salary_currency?: string | null;
  ai_salary_unit_text?: string | null;
  // `organization_logo` is the logo URL the base /v1/active-ats call returns
  // (populated for some rows, null for others). `org_logo_permalink` only
  // appears when include_basic_organization_details=true (which we don't pass),
  // so it's kept as a defensive secondary, not the primary.
  organization_logo?: string | null;
  org_logo_permalink?: string | null;
}

function first<T>(v: T[] | T | null | undefined): T | null {
  if (Array.isArray(v)) return v.length ? v[0]! : null;
  return v ?? null;
}

function cleanStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function toSalary(j: RawJob): JobSalary | null {
  // Fall back to the point value (ai_salary_value) when there's no range — the
  // active-jb feed often gives a single figure instead of min/max.
  const point = typeof j.ai_salary_value === "number" ? j.ai_salary_value : null;
  const min = typeof j.ai_salary_min_value === "number" ? j.ai_salary_min_value : point;
  const max = typeof j.ai_salary_max_value === "number" ? j.ai_salary_max_value : point;
  if (min === null && max === null) return null;
  return {
    min,
    max,
    currency: cleanStr(j.ai_salary_currency),
    unit: cleanStr(j.ai_salary_unit_text),
  };
}

function normalizeJob(j: RawJob): JobListing | null {
  const url = cleanStr(j.url);
  const title = cleanStr(j.title);
  const company = cleanStr(j.organization);
  // A row with no URL or no title/company isn't actionable — drop it.
  if (!url || !title || !company) return null;
  const locations = Array.isArray(j.locations_derived)
    ? j.locations_derived.filter((l): l is string => typeof l === "string" && Boolean(l.trim()))
    : [];
  return {
    id: String(j.id ?? url),
    title,
    company,
    // active-ats exposes `domain_derived`; active-jb exposes `org_linkedin_website`.
    companyDomain: normalizeCompanyDomain(j.domain_derived ?? j.org_linkedin_website),
    location: locations[0] ?? null,
    locations,
    workArrangement: cleanStr(j.ai_work_arrangement),
    employmentType: cleanStr(first(j.ai_employment_type) ?? first(j.employment_type)),
    experienceLevel: cleanStr(j.ai_experience_level),
    source: cleanStr(j.source),
    url,
    datePosted: cleanStr(j.date_posted),
    salary: toSalary(j),
    logoUrl: cleanStr(j.organization_logo) ?? cleanStr(j.org_logo_permalink),
  };
}

export async function searchJobs(params: JobSearchParams): Promise<JobSearchResult> {
  const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 100) : DEFAULT_LIMIT;

  // /v1/run validates GET query values as strings — coerce everything.
  const query: Record<string, string> = {
    time_frame: params.freshness?.trim() || DEFAULT_TIME_FRAME,
    limit: String(limit),
  };
  if (params.role?.trim()) query.title = params.role.trim();
  if (params.location?.trim()) query.location = params.location.trim();
  if (params.remoteOnly) query.ai_work_arrangement = "Remote OK";
  if (params.employmentType?.trim()) query.ai_employment_type = params.employmentType.trim();
  if (params.cursor?.trim()) query.cursor = params.cursor.trim();

  const data = await callOrthogonal<RawJob[]>({
    api: "fantastic-jobs",
    path: feedPath(params),
    method: "GET",
    query,
  });

  // Provider body is a bare array; coerce defensively in case it's wrapped.
  const rows: RawJob[] = Array.isArray(data)
    ? data
    : Array.isArray((data as { data?: RawJob[] })?.data)
    ? (data as { data: RawJob[] }).data
    : [];

  const jobs = rows.map(normalizeJob).filter((j): j is JobListing => j !== null);

  // Cursor pagination: "pass last job id for next page". Only advertise a next
  // page when we got a full page back (otherwise we're at the end).
  const nextCursor = jobs.length === limit ? jobs[jobs.length - 1]!.id : null;

  return { jobs, nextCursor, count: jobs.length };
}
