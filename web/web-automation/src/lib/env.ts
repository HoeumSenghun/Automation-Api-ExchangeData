import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { parsePaymentCodes } from "./catalog";
import type { MerchantSecrets, PaymentPackage } from "./types";

export type EnvLoad = {
  merchants: Map<string, MerchantSecrets>;
  paymentCodes: PaymentPackage[];
  source: "none" | "file" | "env";
  authRequired: boolean;
};

function readDotEnvText(file: string): string {
  const buf = readFileSync(/* turbopackIgnore: true */ file);
  let text: string;
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    text = buf.toString("utf16le");
  } else if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    text = buf.swap16().toString("utf16le");
  } else {
    text = buf.toString("utf8");
  }
  return text.replace(/^\uFEFF/, "");
}

function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const trimmed = line.replace(/^\uFEFF/, "").trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim().replace(/^\uFEFF/, "");
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

function copyProcessMerchantEnv(target: Record<string, string>): void {
  for (const [key, value] of Object.entries(process.env)) {
    if (!value) {
      continue;
    }
    const merchantKey =
      key === "baseUrl" ||
      key === "BASE_URL" ||
      key === "merchants" ||
      key === "MERCHANTS" ||
      key === "paymentCodes" ||
      key === "PAYMENT_CODES" ||
      key === "paymentCode" ||
      key === "PAYMENT_CODE" ||
      key === "paidAmount" ||
      key.includes(".") ||
      /_(PIN|API_KEY|PRIVATE_KEY|PUBLIC_KEY|BASE_URL)$/.test(key);
    if (merchantKey) {
      target[key] = value;
    }
  }
}

function readDotEnvFiles(): Record<string, string> {
  const merged: Record<string, string> = {};
  if (process.env.NODE_ENV !== "production") {
    const candidates = [
      resolve(process.cwd(), ".env.local"),
      resolve(process.cwd(), ".env"),
      resolve(process.cwd(), "..", "..", ".env"),
    ];
    for (const file of candidates) {
      if (!existsSync(/* turbopackIgnore: true */ file)) {
        continue;
      }
      Object.assign(
        merged,
        parseDotEnv(readDotEnvText(file)),
      );
    }
  }
  const blob = process.env.MERCHANT_DOTENV;
  if (blob && blob.trim()) {
    Object.assign(merged, parseDotEnv(blob));
  }
  copyProcessMerchantEnv(merged);
  return merged;
}

function envKey(map: Record<string, string>, key: string): string | undefined {
  const direct = map[key] || process.env[key];
  if (direct && direct.trim()) {
    return direct.trim();
  }
  return undefined;
}

function merchantCodes(map: Record<string, string>): string[] {
  const listed = envKey(map, "merchants") || envKey(map, "MERCHANTS");
  if (listed) {
    return listed
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  const codes: string[] = [];
  const seen = new Set<string>();
  for (const key of Object.keys(map)) {
    const dot = key.lastIndexOf(".");
    if (dot <= 0) {
      continue;
    }
    const field = key.slice(dot + 1);
    if (field === "pin" || field === "apiKey") {
      const code = key.slice(0, dot);
      if (!seen.has(code)) {
        seen.add(code);
        codes.push(code);
      }
    }
  }
  return codes;
}

function first(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function loadMerchant(code: string, map: Record<string, string>): MerchantSecrets {
  const prefix = code.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
  const baseUrl = first(
    envKey(map, `${code}.baseUrl`),
    envKey(map, `${prefix}_BASE_URL`),
    envKey(map, "baseUrl"),
    envKey(map, "BASE_URL"),
  );
  const pin = first(envKey(map, `${code}.pin`), envKey(map, `${prefix}_PIN`));
  const apiKey = first(envKey(map, `${code}.apiKey`), envKey(map, `${prefix}_API_KEY`));
  const privateKey = first(
    envKey(map, `${code}.privateKey`),
    envKey(map, `${prefix}_PRIVATE_KEY`),
  );
  const publicKey = first(
    envKey(map, `${code}.publicKey`),
    envKey(map, `${prefix}_PUBLIC_KEY`),
  );
  if (!baseUrl || !pin || !apiKey || !privateKey || !publicKey) {
    throw new Error(
      `Merchant '${code}' is missing baseUrl, pin, apiKey, privateKey, or publicKey`,
    );
  }
  const sharedCodes = parsePaymentCodes(
    first(envKey(map, "paymentCodes"), envKey(map, "PAYMENT_CODES")),
  );
  const ownCodes = parsePaymentCodes(
    first(envKey(map, `${code}.paymentCodes`), envKey(map, `${prefix}_PAYMENT_CODES`)),
  );
  return {
    code,
    baseUrl,
    pin,
    apiKey,
    privateKey,
    publicKey,
    initPath: first(envKey(map, `${code}.initPath`), `/${code}/exchangedata/init`)!,
    confirmPath: first(envKey(map, `${code}.confirmPath`), `/${code}/exchangedata/confirm`)!,
    checkPath: first(envKey(map, `${code}.checkPath`), `/${code}/exchangedata/check`)!,
    paymentCodes: ownCodes.length ? ownCodes : sharedCodes,
  };
}

export function loadEnv(): EnvLoad {
  const map = readDotEnvFiles();
  const codes = merchantCodes(map);
  const paymentCodes = parsePaymentCodes(
    first(envKey(map, "paymentCodes"), envKey(map, "PAYMENT_CODES")),
  );
  const merchants = new Map<string, MerchantSecrets>();
  for (const code of codes) {
    try {
      merchants.set(code, loadMerchant(code, map));
    } catch {
      // Skip incomplete merchants so the UI can still list the rest.
    }
  }
  const source = merchants.size === 0 ? "none" : map.baseUrl || map.BASE_URL ? "file" : "env";
  return {
    merchants,
    paymentCodes,
    source,
    authRequired: Boolean(process.env.RUN_SECRET?.trim()),
  };
}

export function timingSafeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  let out = 0;
  for (let i = 0; i < left.length; i++) {
    out |= left[i] ^ right[i];
  }
  return out === 0;
}

export function checkRunSecret(provided?: string): boolean {
  const expected = process.env.RUN_SECRET?.trim();
  if (!expected) {
    return true;
  }
  return Boolean(provided && timingSafeEqual(provided, expected));
}
