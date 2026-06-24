import { NextResponse } from "next/server";
import { callOrthogonal, QuotaExceededError } from "@/lib/orthogonal";
import { isValidLinkedInProfileUrl } from "@/lib/validation";
import { guardRequest, type GuardBody } from "@/lib/security/guard";

export const maxDuration = 30;

const MAX_URL_LEN = 500;

export interface ProfileJob {
  company: string;
  title: string;
  startYear: number | null;
  endYear: number | null; // null = present / ongoing
  current: boolean;
}

export interface ProfileEducation {
  school: string;
  degree: string | null;
  field: string | null;
  endYear: number | null;
}

export interface ProfileData {
  bio: string | null;
  photo: string | null;
  jobs: ProfileJob[];
  education: ProfileEducation[];
  skills: string[];
  links: { label: string; url: string }[];
}

function cleanStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function asUrl(v: unknown): string | null {
  const s = cleanStr(v);
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

function parseYear(d: unknown): number | null {
  if (!d) return null;
  const m = String(d).match(/\b(19|20)\d{2}\b/);
  return m ? parseInt(m[0]) : null;
}

interface ApolloEmployment {
  company_name?: string | null;
  title?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  current?: boolean;
}

interface ApolloEducation {
  school_name?: string | null;
  degree?: string | null;
  field_of_study?: string | null;
  end_date?: string | null;
}

interface ApolloPerson {
  headline?: string | null;
  photo_url?: string | null;
  twitter_url?: string | null;
  github_url?: string | null;
  website_url?: string | null;
  employment_history?: ApolloEmployment[];
  education?: ApolloEducation[];
  skills?: unknown;
}

const EMPTY_PROFILE: ProfileData = {
  bio: null, photo: null, jobs: [], education: [], skills: [], links: [],
};

export async function POST(request: Request) {
  let body: GuardBody & { linkedinUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const guard = await guardRequest(request, body, "profile");
  if (!guard.ok) return guard.response;

  const linkedinUrl = (body.linkedinUrl ?? "").trim();
  if (!linkedinUrl || linkedinUrl.length > MAX_URL_LEN || !isValidLinkedInProfileUrl(linkedinUrl)) {
    return NextResponse.json({ error: "Invalid LinkedIn profile URL." }, { status: 400 });
  }

  await guard.recordSpend();

  let raw: { person?: ApolloPerson };
  try {
    raw = await callOrthogonal<{ person?: ApolloPerson }>({
      api: "apollo",
      path: "/api/v1/people/match",
      method: "POST",
      body: { linkedin_url: linkedinUrl },
    });
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      return NextResponse.json({ error: "Usage limit reached — try again later." }, { status: 503 });
    }
    console.error("[profile] Apollo lookup failed:", err);
    return NextResponse.json({ error: "Profile lookup failed." }, { status: 502 });
  }

  const p = raw?.person;
  if (!p) return NextResponse.json<ProfileData>(EMPTY_PROFILE);

  // Employment: current roles first, then most recent, cap at 4.
  const jobs: ProfileJob[] = (p.employment_history ?? [])
    .slice(0, 12)
    .map((e) => ({
      company: cleanStr(e.company_name) ?? "",
      title: cleanStr(e.title) ?? "",
      startYear: parseYear(e.start_date),
      endYear: e.current ? null : parseYear(e.end_date),
      current: Boolean(e.current),
    }))
    .filter((j) => j.title) // require at least a title; company may be blank (Apollo gap)
    .sort((a, b) => {
      if (a.current !== b.current) return a.current ? -1 : 1;
      return (b.startYear ?? 0) - (a.startYear ?? 0);
    })
    .slice(0, 4);

  const education: ProfileEducation[] = (p.education ?? [])
    .slice(0, 5)
    .map((e) => ({
      school: cleanStr(e.school_name) ?? "",
      degree: cleanStr(e.degree),
      field: cleanStr(e.field_of_study),
      endYear: parseYear(e.end_date),
    }))
    .filter((e) => e.school);

  const rawSkills = Array.isArray(p.skills) ? p.skills : [];
  const skills: string[] = rawSkills
    .map((s) =>
      typeof s === "string" ? s : cleanStr((s as Record<string, unknown>)?.name)
    )
    .filter((s): s is string => Boolean(s))
    .slice(0, 10);

  const links: ProfileData["links"] = [];
  const tw = asUrl(p.twitter_url);
  if (tw) links.push({ label: "Twitter / X", url: tw });
  const gh = asUrl(p.github_url);
  if (gh) links.push({ label: "GitHub", url: gh });
  const ws = asUrl(p.website_url);
  if (ws) links.push({ label: "Website", url: ws });

  console.log(
    `[profile] Apollo: jobs=${jobs.length} edu=${education.length} skills=${skills.length} links=${links.length}`
  );

  return NextResponse.json<ProfileData>({
    bio: cleanStr(p.headline),
    photo: cleanStr(p.photo_url),
    jobs,
    education,
    skills,
    links,
  });
}
