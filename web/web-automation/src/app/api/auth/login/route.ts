import { NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  cookieOptions,
  createSessionToken,
  getAccessPin,
  isSixDigitPin,
  pinsMatch,
} from "@/lib/siteAuth";

export const dynamic = "force-dynamic";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILS = 8;
const fails = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

function locked(key: string): boolean {
  const row = fails.get(key);
  if (!row) {
    return false;
  }
  if (Date.now() > row.resetAt) {
    fails.delete(key);
    return false;
  }
  return row.count >= MAX_FAILS;
}

function recordFail(key: string): void {
  const now = Date.now();
  const row = fails.get(key);
  if (!row || now > row.resetAt) {
    fails.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  row.count += 1;
}

export async function POST(request: Request) {
  const expected = getAccessPin();
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "ACCESS_PIN is not configured (6 digits)" },
      { status: 503 },
    );
  }

  const key = clientKey(request);
  if (locked(key)) {
    return NextResponse.json(
      { ok: false, error: "Too many attempts. Try again in 10 minutes." },
      { status: 429 },
    );
  }

  let pin = "";
  try {
    const body = (await request.json()) as { pin?: unknown };
    pin = typeof body.pin === "string" ? body.pin.trim() : "";
  } catch {
    recordFail(key);
    return NextResponse.json({ ok: false, error: "Invalid PIN" }, { status: 401 });
  }

  if (!isSixDigitPin(pin) || !pinsMatch(pin, expected)) {
    recordFail(key);
    return NextResponse.json({ ok: false, error: "Invalid PIN" }, { status: 401 });
  }

  fails.delete(key);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, createSessionToken(expected), cookieOptions());
  return response;
}
