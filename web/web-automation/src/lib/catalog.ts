import type { PaymentPackage } from "./types";

export const CURRENCY = "USD";
export const SERVICE_TYPE = "EXCHANGE_DATA";

/** Spec: refId max 20, paymentCode max 15, msisdn max 15. */
export const REF_ID_MAX = 20;
export const PAYMENT_CODE_MAX = 15;
export const MSISDN_MAX = 15;

const FAMILY_ORDER = ["OSJA", "MET5G", "SEKSA", "MONTHLY", "Packages"] as const;

/** Infer UI family from DB-style BPN_* package codes when FAMILY is omitted. */
export function inferPackageFamily(code: string): string {
  if (code.startsWith("BPN_OSJA")) {
    return "OSJA";
  }
  if (code.startsWith("BPN_MET5G")) {
    return "MET5G";
  }
  if (code.startsWith("BPN_SEKSA")) {
    return "SEKSA";
  }
  if (code.startsWith("BPN_MONTLY")) {
    return "MONTHLY";
  }
  return "Packages";
}

function familySortKey(family: string): number {
  const idx = FAMILY_ORDER.indexOf(family as (typeof FAMILY_ORDER)[number]);
  return idx >= 0 ? idx : FAMILY_ORDER.length;
}

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
      family: family || inferPackageFamily(code),
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

export function groupPackages(
  packages: readonly PaymentPackage[],
): { family: string; items: PaymentPackage[] }[] {
  const groups = new Map<string, PaymentPackage[]>();
  const order: string[] = [];
  for (const item of packages) {
    const family = item.family || "Packages";
    let items = groups.get(family);
    if (!items) {
      items = [];
      groups.set(family, items);
      order.push(family);
    }
    items.push(item);
  }
  return order
    .map((family) => ({ family, items: groups.get(family)! }))
    .sort(
      (left, right) =>
        familySortKey(left.family) - familySortKey(right.family) ||
        left.family.localeCompare(right.family),
    );
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
