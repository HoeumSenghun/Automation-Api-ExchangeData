import { createHmac, timingSafeEqual } from "crypto";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

export const AUTH_COOKIE = "site_auth";
export const AUTH_MAX_AGE_SEC = 60 * 60 * 12;

function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value) {
      out[key] = value;
    }
  }
  return out;
}

function readLocalDotEnv(): Record<string, string> {
  if (process.env.NODE_ENV === "production") {
    return {};
  }
  const merged: Record<string, string> = {};
  const candidates = [
    resolve(process.cwd(), ".env.local"),
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "..", "..", ".env"),
  ];
  for (const file of candidates) {
    if (!existsSync(/* turbopackIgnore: true */ file)) {
      continue;
    }
    Object.assign(merged, parseDotEnv(readFileSync(/* turbopackIgnore: true */ file, "utf8")));
  }
  return merged;
}

export function isSixDigitPin(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}

/** 6-digit site PIN from env. Never send this to the browser. */
export function getAccessPin(): string | undefined {
  const fromEnv = process.env.ACCESS_PIN?.trim();
  if (fromEnv && isSixDigitPin(fromEnv)) {
    return fromEnv;
  }
  const blob = process.env.MERCHANT_DOTENV?.trim();
  if (blob) {
    const fromBlob = parseDotEnv(blob).ACCESS_PIN?.trim();
    if (fromBlob && isSixDigitPin(fromBlob)) {
      return fromBlob;
    }
  }
  const fromFile = readLocalDotEnv().ACCESS_PIN?.trim();
  if (fromFile && isSixDigitPin(fromFile)) {
    return fromFile;
  }
  return undefined;
}

function signingKey(pin: string): Buffer {
  return createHmac("sha256", pin).update("exchangedata-site-gate").digest();
}

export function createSessionToken(pin: string): string {
  const exp = String(Date.now() + AUTH_MAX_AGE_SEC * 1000);
  const sig = createHmac("sha256", signingKey(pin)).update(exp).digest("hex");
  return `${exp}.${sig}`;
}

export function isValidSessionToken(token: string | undefined, pin: string | undefined): boolean {
  if (!token || !pin || !isSixDigitPin(pin)) {
    return false;
  }
  const dot = token.indexOf(".");
  if (dot <= 0) {
    return false;
  }
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expMs = Number(exp);
  if (!Number.isFinite(expMs) || Date.now() > expMs) {
    return false;
  }
  const expected = createHmac("sha256", signingKey(pin)).update(exp).digest("hex");
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function pinsMatch(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: AUTH_MAX_AGE_SEC,
  };
}
