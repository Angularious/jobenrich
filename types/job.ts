/**
 * Types for the role-first job search (v2). Field names mirror the live
 * Fantastic Jobs `/v1/active-ats` response (confirmed against real data), then
 * normalized into the camelCase `JobListing` the UI + people-handoff consume.
 * Style follows the `Person` type in lib/people.ts.
 */

/** Normalized salary, from the AI-derived `ai_salary_*` fields (more reliably
 *  populated than the schema.org `salary` block). Null when no salary info. */
export interface JobSalary {
  min: number | null;
  max: number | null;
  currency: string | null;
  unit: string | null; // e.g. "YEAR", "HOUR"
}

/** One normalized posting. `companyDomain` is the employer's apex domain
 *  (Fantastic Jobs `domain_derived`, already PSL-reduced — e.g. "faire.com",
 *  never the ATS host), or null when it resolves to an ATS/board domain. This
 *  is exactly what the people finders want for a domain-first match. */
export interface JobListing {
  id: string;
  title: string;
  company: string;
  companyDomain: string | null;
  location: string | null; // primary "City, State, Country"
  locations: string[]; // all derived locations
  workArrangement: string | null; // On-site | Hybrid | Remote OK | Remote Solely
  employmentType: string | null; // FULL_TIME | PART_TIME | CONTRACTOR | INTERN | …
  experienceLevel: string | null; // 0-2 | 2-5 | 5-10 | 10+
  source: string | null; // ATS slug: greenhouse | ashby | workday | in-house | …
  url: string; // the posting URL
  datePosted: string | null; // ISO 8601
  salary: JobSalary | null;
  logoUrl: string | null;
}

/** Inputs from the search form. Optional fields map onto native API filters. */
export interface JobSearchParams {
  role: string; // required → `title`
  location?: string; // → `location`
  remoteOnly?: boolean; // → ai_work_arrangement="Remote OK"
  employmentType?: string; // → ai_employment_type
  freshness?: string; // → time_frame (1h | 24h | 7d | 6m), default "7d"
  cursor?: string; // → cursor (pass last job id for next page)
  limit?: number; // → limit (default 25)
  // Which Fantastic Jobs feed to query:
  //   "ats" → /v1/active-ats (54 company career sites; default)
  //   "jb"  → /v1/active-jb  (LinkedIn + Wellfound + Y Combinator)
  // Intern queries auto-route to "jb" (far better intern/entry coverage); the
  // empty-state "search LinkedIn & startups" button also sets this. When unset,
  // searchJobs picks the feed.
  board?: "ats" | "jb";
}

export interface JobSearchResult {
  jobs: JobListing[];
  nextCursor: string | null; // last job id when a full page came back, else null
  count: number;
}
