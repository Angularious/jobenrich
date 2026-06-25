import { NextResponse } from "next/server";
import { isValidJobUrl, isLinkedInHost } from "@/lib/validation";
import { resolveJob, normalizeCompany } from "@/lib/jobResolver";
import { guardRequest, type GuardBody } from "@/lib/security/guard";
import { findSimilarPeople, findRecruiters, simplifyJobTitle } from "@/lib/people";
import { QuotaExceededError } from "@/lib/orthogonal";

const MAX_URL_LEN = 2000;
// Manual-search free-text fields (company / role / location). Short cap — these
// feed a people search, not prose.
const MAX_MANUAL_LEN = 100;

// Shown when a URL can't be read into a company — usually an application
// portal (ADP, iCIMS, Taleo…) that blocks automated reading. Point the user
// at sources that work instead of leaving them guessing.
const UNREADABLE_MSG =
  "We couldn't read that link — some application portals (e.g. ADP) block automated reading. Try the role on LinkedIn, or a Greenhouse, Workday, or company careers page link.";

// Resolve (scrape/extract) + two parallel waterfalls can chain several upstream
// calls; give it headroom (Hobby+Fluid allows up to 300s).
export const maxDuration = 60;

// Shared by the URL and manual paths: run the two people/recruiter waterfalls,
// de-dupe, and build the response. `jobTitle` is the raw title for display; the
// finders get the simplified form. Returns the response body + real USD spent.
async function runPeopleSearch(input: {
  company: string;
  domain: string | null;
  jobTitle: string | null;
  jobLocation: string | null;
}) {
  const { company, domain, jobTitle, jobLocation } = input;
  const searchTitle = jobTitle ? simplifyJobTitle(jobTitle) : null;

  const [similar, recruitersResult] = await Promise.allSettled([
    findSimilarPeople({
      company,
      domain,
      location: jobLocation,
      ...(searchTitle ? { jobTitle: searchTitle } : {}),
    }),
    findRecruiters({ company, domain, location: jobLocation }),
  ]);

  let cost = 0;
  if (similar.status === "fulfilled") cost += similar.value.cost;
  if (recruitersResult.status === "fulfilled") cost += recruitersResult.value.cost;

  const companyMeta =
    (similar.status === "fulfilled" ? similar.value.companyMeta : null) ??
    (recruitersResult.status === "fulfilled" ? recruitersResult.value.companyMeta : null);

  const recruiters = recruitersResult.status === "fulfilled" ? recruitersResult.value.people : [];
  // De-dupe across lists: the people finder's role-agnostic fallback can surface
  // the same recruiters the recruiter list already shows. Recruiters is the more
  // specific match, so drop those from "people to talk to" (keep them as recruiters).
  const recruiterUrls = new Set(recruiters.map((r) => r.linkedinUrl));
  const people = (similar.status === "fulfilled" ? similar.value.people : []).filter(
    (p) => !recruiterUrls.has(p.linkedinUrl)
  );

  return {
    cost,
    body: {
      jobTitle,
      company,
      domain,
      companyMeta,
      people,
      peopleError: similar.status === "rejected",
      recruiters,
      recruitersError: recruitersResult.status === "rejected",
    },
  };
}

export async function POST(request: Request) {
  let body: GuardBody & {
    jobUrl?: string;
    // Manual search (fallback when a link can't be read): company is required,
    // role + location optional.
    company?: string;
    role?: string;
    location?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const guard = await guardRequest(request, body, "search");
  if (!guard.ok) return guard.response;

  // The guard reserved the worst case against the cap; we reconcile to the
  // ACTUAL spend here (resolve + both finders) and record it in the finally.
  let spentUsd = 0;
  try {
    // ── Manual search: { company, role?, location? } instead of a URL ──
    // Used as the fallback when a job link can't be resolved (or via the
    // "search by company" toggle). Skips resolveJob entirely; no resolve cost.
    const hasUrl = typeof body.jobUrl === "string" && body.jobUrl.trim() !== "";
    if (!hasUrl && typeof body.company === "string") {
      const company = body.company.trim();
      const role = typeof body.role === "string" ? body.role.trim() : "";
      const location = typeof body.location === "string" ? body.location.trim() : "";
      if (
        !company ||
        company.length > MAX_MANUAL_LEN ||
        role.length > MAX_MANUAL_LEN ||
        location.length > MAX_MANUAL_LEN
      ) {
        return NextResponse.json(
          { error: "Enter a company name (role and location are optional)." },
          { status: 400 }
        );
      }
      console.log(`[search] (manual) "${role || "—"}" @ "${company}" (location: ${location || "—"})`);
      const { body: respBody, cost } = await runPeopleSearch({
        company: normalizeCompany(company),
        domain: null, // no domain from a typed name → company-name search
        jobTitle: role || null,
        jobLocation: location || null,
      });
      spentUsd += cost;
      return NextResponse.json(respBody);
    }

    // ── URL search ──
    const rawUrl = typeof body.jobUrl === "string" ? body.jobUrl.trim() : "";
    if (!rawUrl || rawUrl.length > MAX_URL_LEN || !isValidJobUrl(rawUrl)) {
      return NextResponse.json(
        { error: "Paste a link to a job posting or company careers page." },
        { status: 400 }
      );
    }

    // Step 1: Resolve the URL → { jobTitle, companyName, domain } (any source).
    let resolved;
    try {
      resolved = await resolveJob(rawUrl);
      spentUsd += resolved.cost;
    } catch (err) {
      // The resolve calls (Edges, or Serper ± LLM) fired before throwing — bill
      // their worst case so a failed resolve still counts against the cap.
      spentUsd += isLinkedInHost(rawUrl) ? 0.09 : 0.045;
      if (err instanceof QuotaExceededError) {
        return NextResponse.json({ error: "Usage limit reached — try again later." }, { status: 503 });
      }
      console.error("[search] Job resolution failed:", err);
      return NextResponse.json({ error: UNREADABLE_MSG }, { status: 502 });
    }

    const { jobTitle, companyName, domain, jobLocation } = resolved;
    if (!companyName) {
      return NextResponse.json({ error: UNREADABLE_MSG }, { status: 422 });
    }

    console.log(
      `[search] (${resolved.source}) "${jobTitle ?? "—"}" → "${jobTitle ? simplifyJobTitle(jobTitle) : "—"}" @ "${companyName}" (domain: ${domain ?? "—"}, location: ${jobLocation ?? "—"})`
    );

    // Step 2: Two waterfalls — people in similar roles + recruiters.
    const { body: respBody, cost } = await runPeopleSearch({
      company: companyName,
      domain,
      jobTitle,
      jobLocation,
    });
    spentUsd += cost;
    return NextResponse.json(respBody);
  } finally {
    await guard.recordSpend(spentUsd);
  }
}
