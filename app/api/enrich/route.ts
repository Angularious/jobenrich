import { NextResponse } from "next/server";
import { callOrthogonal } from "@/lib/orthogonal";
import { isValidLinkedInProfileUrl } from "@/lib/validation";

export async function POST(request: Request) {
  let body: { linkedinUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { linkedinUrl = "" } = body;

  if (!isValidLinkedInProfileUrl(linkedinUrl)) {
    return NextResponse.json(
      { error: "Invalid LinkedIn profile URL." },
      { status: 400 }
    );
  }

  try {
    const raw = await callOrthogonal<Record<string, unknown>>({
      api: "contactout",
      path: "/v1/linkedin/enrich",
      method: "GET",
      query: { profile: linkedinUrl, profile_only: "false" },
    });

    console.log("[enrich] Raw response keys:", Object.keys(raw ?? {}));

    // ContactOut wraps the person data under a `profile` key
    const data = (raw?.profile as Record<string, unknown>) ?? raw;

    return NextResponse.json(data);
  } catch (err) {
    console.error("[enrich] Enrichment failed:", err);
    return NextResponse.json(
      { error: "Enrichment failed. Try again." },
      { status: 502 }
    );
  }
}
