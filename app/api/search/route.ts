import { NextResponse } from "next/server";
import { isValidJobUrl } from "@/lib/validation";
import { resolveJob } from "@/lib/jobResolver";
import { guardRequest, type GuardBody } from "@/lib/security/guard";
import { findSimilarPeople, findRecruiters, simplifyJobTitle } from "@/lib/people";

const MAX_URL_LEN = 2000;

// Resolve (scrape/extract) + two parallel waterfalls can chain several upstream
// calls; give it headroom (Hobby+Fluid allows up to 300s).
export const maxDuration = 60;

export async function POST(request: Request) {
  let body: GuardBody & { jobUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const guard = guardRequest(request, body, "search");
  if (!guard.ok) return guard.response;

  const rawUrl = typeof body.jobUrl === "string" ? body.jobUrl.trim() : "";
  if (!rawUrl || rawUrl.length > MAX_URL_LEN || !isValidJobUrl(rawUrl)) {
    return NextResponse.json(
      { error: "Paste a link to a job posting or company careers page." },
      { status: 400 }
    );
  }

  // Input is valid and a call will be made — count it against the daily cap.
  guard.recordSpend();

  // Step 1: Resolve the URL → { jobTitle, companyName, domain } (any source).
  let resolved;
  try {
    resolved = await resolveJob(rawUrl);
  } catch (err) {
    console.error("[search] Job resolution failed:", err);
    return NextResponse.json(
      { error: "Couldn't read that posting. Try a different link." },
      { status: 502 }
    );
  }

  const { jobTitle, companyName, domain } = resolved;
  if (!companyName) {
    return NextResponse.json(
      { error: "Couldn't identify the company on that page. Try another link." },
      { status: 422 }
    );
  }

  // jobTitle may be null (e.g. a careers index) → company-only people search.
  const searchTitle = jobTitle ? simplifyJobTitle(jobTitle) : null;
  console.log(
    `[search] (${resolved.source}) "${jobTitle ?? "—"}" → "${searchTitle ?? "—"}" @ "${companyName}" (domain: ${domain ?? "—"})`
  );

  // Step 2: Two waterfalls in parallel — people in similar roles + recruiters.
  const [similar, recruiters] = await Promise.allSettled([
    findSimilarPeople({
      company: companyName,
      domain,
      ...(searchTitle ? { jobTitle: searchTitle } : {}),
    }),
    findRecruiters({ company: companyName, domain }),
  ]);

  return NextResponse.json({
    jobTitle,
    company: companyName,
    domain,
    people: similar.status === "fulfilled" ? similar.value : [],
    peopleError: similar.status === "rejected",
    recruiters: recruiters.status === "fulfilled" ? recruiters.value : [],
    recruitersError: recruiters.status === "rejected",
  });
}
