import { NextResponse } from "next/server";
import { findAlumni } from "@/lib/people";
import { isValidSchool } from "@/lib/validation";

export async function POST(request: Request) {
  let body: { company?: string; domain?: string | null; school?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const company = (body.company ?? "").trim();
  const school = (body.school ?? "").trim();
  const domain = body.domain ?? null;

  if (!company) {
    return NextResponse.json({ error: "Run a job search first." }, { status: 400 });
  }
  if (!isValidSchool(school)) {
    return NextResponse.json(
      { error: "Enter a school name (max 100 characters)." },
      { status: 400 }
    );
  }

  try {
    const alumni = await findAlumni({ company, domain, school });
    return NextResponse.json({ alumni, alumniError: false });
  } catch (err) {
    console.error("[alumni] Search failed:", err);
    return NextResponse.json({ alumni: [], alumniError: true }, { status: 502 });
  }
}
