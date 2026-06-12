import { NextResponse } from "next/server";
import { callOrthogonal } from "@/lib/orthogonal";
import { isValidLinkedInJobUrl, isValidSchool } from "@/lib/validation";

export interface Person {
  name: string;
  title: string;
  linkedinUrl: string;
  profilePictureUrl: string | null;
}

interface ContactOutProfile {
  full_name?: string;
  title?: string;
  headline?: string;
  profile_picture_url?: string;
}

interface ContactOutResponse {
  profiles?: Record<string, ContactOutProfile>;
}

function extractPeople(
  profiles: Record<string, ContactOutProfile> | undefined,
  limit: number
): Person[] {
  if (!profiles || typeof profiles !== "object") return [];
  return Object.entries(profiles)
    .slice(0, limit)
    .map(([url, profile]) => ({
      name: profile.full_name ?? "",
      title: profile.title ?? profile.headline ?? "",
      linkedinUrl: url,
      profilePictureUrl: profile.profile_picture_url ?? null,
    }));
}

function extractJobFields(data: Record<string, unknown>): {
  jobTitle: string;
  companyName: string;
} {
  // Edges may wrap result in an `output` key
  const out = (data?.output ?? data) as Record<string, unknown>;
  const jobTitle = String(
    out.job_title ?? out.title ?? out.position ?? ""
  ).trim();
  const companyName = String(
    out.company_name ?? out.company ?? out.employer_name ?? out.employer ?? ""
  ).trim();
  return { jobTitle, companyName };
}

export async function POST(request: Request) {
  let body: { jobUrl?: string; school?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { jobUrl = "", school = "" } = body;

  if (!isValidLinkedInJobUrl(jobUrl)) {
    return NextResponse.json(
      {
        error:
          "Couldn't read that job posting. Make sure it's a LinkedIn Jobs URL.",
      },
      { status: 400 }
    );
  }

  if (!isValidSchool(school)) {
    return NextResponse.json(
      { error: "School name is required (max 100 characters)." },
      { status: 400 }
    );
  }

  // Step 1: Extract job
  let jobData: Record<string, unknown>;
  try {
    jobData = await callOrthogonal<Record<string, unknown>>({
      api: "edges",
      path: "/actions/linkedin-extract-job/run/live",
      method: "POST",
      body: { input: { linkedin_job_url: jobUrl } },
    });
    console.log(
      "[search] Job extraction response:",
      JSON.stringify(jobData, null, 2)
    );
  } catch (err) {
    console.error("[search] Job extraction failed:", err);
    return NextResponse.json(
      {
        error:
          "Couldn't read that job posting. Make sure it's a LinkedIn Jobs URL.",
      },
      { status: 502 }
    );
  }

  const { jobTitle, companyName } = extractJobFields(jobData);
  const trimmedSchool = school.trim();

  // Step 2: Three parallel ContactOut searches
  const [similarResult, schoolResult, recruiterResult] =
    await Promise.allSettled([
      callOrthogonal<ContactOutResponse>({
        api: "contactout",
        path: "/v1/people/search",
        method: "POST",
        body: {
          job_title: [jobTitle],
          company: [companyName],
          page: 1,
          reveal_info: false,
        },
      }),
      callOrthogonal<ContactOutResponse>({
        api: "contactout",
        path: "/v1/people/search",
        method: "POST",
        body: {
          company: [companyName],
          education: [trimmedSchool],
          page: 1,
          reveal_info: false,
        },
      }),
      callOrthogonal<ContactOutResponse>({
        api: "contactout",
        path: "/v1/people/search",
        method: "POST",
        body: {
          job_title: [
            "recruiter",
            "talent acquisition",
            "university recruiter",
            "campus recruiter",
            "technical recruiter",
          ],
          company: [companyName],
          page: 1,
          reveal_info: false,
        },
      }),
    ]);

  if (similarResult.status === "rejected") {
    console.error("[search] Similar roles search failed:", similarResult.reason);
  }
  if (schoolResult.status === "rejected") {
    console.error("[search] School matches failed:", schoolResult.reason);
  }
  if (recruiterResult.status === "rejected") {
    console.error("[search] Recruiter search failed:", recruiterResult.reason);
  }

  return NextResponse.json({
    jobTitle,
    company: companyName,
    similarRoles:
      similarResult.status === "fulfilled"
        ? extractPeople(similarResult.value?.profiles, 5)
        : [],
    similarRolesError: similarResult.status === "rejected",
    schoolMatches:
      schoolResult.status === "fulfilled"
        ? extractPeople(schoolResult.value?.profiles, 3)
        : [],
    schoolMatchesError: schoolResult.status === "rejected",
    recruiters:
      recruiterResult.status === "fulfilled"
        ? extractPeople(recruiterResult.value?.profiles, 3)
        : [],
    recruitersError: recruiterResult.status === "rejected",
  });
}
