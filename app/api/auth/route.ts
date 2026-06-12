import { NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(request: Request) {
  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const input = body.password ?? "";
  const expected = process.env.APP_PASSWORD ?? "";

  const inputBuf = Buffer.from(input);
  const expectedBuf = Buffer.from(expected);

  let match = false;
  if (inputBuf.length > 0 && inputBuf.length === expectedBuf.length) {
    match = crypto.timingSafeEqual(inputBuf, expectedBuf);
  }

  if (!match) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const token = crypto.randomBytes(32).toString("hex");
  const response = NextResponse.json({ ok: true });

  response.cookies.set("ji_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  return response;
}
