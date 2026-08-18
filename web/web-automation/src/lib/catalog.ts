import type { PaymentPackage } from "./types";

export const CURRENCY = "USD";
export const SERVICE_TYPE = "EXCHANGE_DATA";

/** Spec: refId max 20, paymentCode max 15, msisdn max 15. */
export const REF_ID_MAX = 20;
export const PAYMENT_CODE_MAX = 15;
export const MSISDN_MAX = 15;

/**
 * Parse gitignored env catalog.
 * Format (comma-separated): CODE:AMOUNT or CODE:AMOUNT:FAMILY or CODE:AMOUNT:FAMILY:Label
 */
export function parsePaymentCodes(raw: string | undefined): PaymentPackage[] {
  if (!raw?.trim()) {
    return [];
  }
  const out: PaymentPackage[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const bits = part
      .trim()
      .split(":")
      .map((bit) => bit.trim())
      .filter(Boolean);
    if (bits.length < 2) {
      continue;
    }
    const [code, amount, family, ...labelParts] = bits;
    if (!code || !amount || seen.has(code)) {
      continue;
    }
    seen.add(code);
    out.push({
      code,
      amount,
      family: family || "Packages",
      label: labelParts.length ? labelParts.join(":") : code,
    });
  }
  return out;
}

export function amountPresetsFrom(packages: readonly PaymentPackage[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of packages) {
    if (!seen.has(item.amount)) {
      seen.add(item.amount);
      out.push(item.amount);
    }
  }
  return out;
}

export function familiesFrom(packages: readonly PaymentPackage[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of packages) {
    const family = item.family || "Packages";
    if (!seen.has(family)) {
      seen.add(family);
      out.push(family);
    }
  }
  return out;
}

export function amountForPaymentCode(
  packages: readonly PaymentPackage[],
  code: string,
): string | undefined {
  return packages.find((item) => item.code === code)?.amount;
}

export function parsePaidAmount(raw: string): number | null {
  const value = raw.trim();
  if (!value || !/^\d+(\.\d+)?$/.test(value)) {
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  return n;
}

export function amountsMatch(expected: string, actual: number): boolean {
  return Number(expected) === actual;
}
