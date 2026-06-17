import { NextResponse } from "next/server";
import { findAlumni } from "@/lib/people";
import { isValidSchool } from "@/lib/validation";
import { guardRequest, type GuardBody } from "@/lib/security/guard";

const MAX_COMPANY_LEN = 200;
const MAX_DOMAIN_LEN = 255;

// Up to two sequential ContactOut lookups (company → domain fallback).
export const maxDuration = 30;

export async function POST(request: Request) {
  let body: GuardBody & { company?: string; domain?: string | null; school?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const guard = await guardRequest(request, body, "alumni");
  if (!guard.ok) return guard.response;

  const company = (body.company ?? "").trim();
  const school = (body.school ?? "").trim();
  const domain = typeof body.domain === "string" ? body.domain.trim() : null;

  if (!company || company.length > MAX_COMPANY_LEN) {
    return NextResponse.json({ error: "Run a job search first." }, { status: 400 });
  }
  if (domain && domain.length > MAX_DOMAIN_LEN) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!isValidSchool(school)) {
    return NextResponse.json(
      { error: "Enter a school name (max 100 characters)." },
      { status: 400 }
    );
  }

  // Input is valid and a call will be made — count it against the daily cap.
  await guard.recordSpend();

  try {
    const alumni = await findAlumni({ company, domain, school });
    return NextResponse.json({ alumni, alumniError: false });
  } catch (err) {
    console.error("[alumni] Search failed:", err);
    return NextResponse.json({ alumni: [], alumniError: true }, { status: 502 });
  }
}
