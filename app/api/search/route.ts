import { NextResponse } from "next/server";
import { callOrthogonal } from "@/lib/orthogonal";
import { canonicalizeLinkedInJobUrl } from "@/lib/validation";
import {
  findSimilarPeople,
  findRecruiters,
  simplifyJobTitle,
  extractDomain,
} from "@/lib/people";

function extractJobFields(data: Record<string, unknown>): {
  jobTitle: string;
  companyName: string;
  domain: string | null;
} {
  // Edges may wrap the result in an `output` key.
  const out = (data?.output ?? data) as Record<string, unknown>;
  const jobTitle = String(out.job_title ?? out.title ?? out.position ?? "").trim();
  const companyName = String(
    out.company_name ?? out.company ?? out.employer_name ?? out.employer ?? ""
  ).trim();
  return { jobTitle, companyName, domain: extractDomain(out) };
}

export async function POST(request: Request) {
  let body: { jobUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const canonicalUrl = canonicalizeLinkedInJobUrl(body.jobUrl ?? "");
  if (!canonicalUrl) {
    return NextResponse.json(
      { error: "Couldn't read that job posting. Paste a LinkedIn Jobs URL." },
      { status: 400 }
    );
  }

  // Step 1: Extract the job (title + company).
  let jobData: Record<string, unknown>;
  try {
    jobData = await callOrthogonal<Record<string, unknown>>({
      api: "edges",
      path: "/actions/linkedin-extract-job/run/live",
      method: "POST",
      body: { input: { linkedin_job_url: canonicalUrl } },
    });
  } catch (err) {
    console.error("[search] Job extraction failed:", err);
    return NextResponse.json(
      { error: "Couldn't read that job posting. Paste a LinkedIn Jobs URL." },
      { status: 502 }
    );
  }

  const { jobTitle, companyName, domain } = extractJobFields(jobData);
  if (!companyName) {
    return NextResponse.json(
      { error: "Couldn't identify the company on that posting. Try another job." },
      { status: 422 }
    );
  }

  const searchTitle = simplifyJobTitle(jobTitle);
  console.log(
    `[search] "${jobTitle}" → "${searchTitle}" @ "${companyName}" (domain: ${domain ?? "—"})`
  );

  // Step 2: Two waterfalls in parallel — people in similar roles + recruiters.
  const [similar, recruiters] = await Promise.allSettled([
    findSimilarPeople({ company: companyName, domain, jobTitle: searchTitle }),
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
