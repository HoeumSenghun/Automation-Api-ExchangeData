import { NextResponse } from "next/server";
import { AUTH_COOKIE, cookieOptions } from "@/lib/siteAuth";

export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, "", {
    ...cookieOptions(),
    maxAge: 0,
    expires: new Date(0),
  });
  response.cookies.delete(AUTH_COOKIE);
  return response;
}
