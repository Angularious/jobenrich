import { NextResponse } from "next/server";
import { issueRequestToken, issuePageStamp } from "@/lib/security/tokens";

// Issued on page load. The client sends `token` as X-Request-Token on every
// API call (CSRF-style), and echoes `pageLoad` back on form steps for the
// minimum-timing bot check. Not cached — each load gets fresh values.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    token: issueRequestToken(),
    pageLoad: issuePageStamp(),
  });
}
