export type ApiCallResult = {
  httpStatus: number;
  raw: string;
  json: unknown;
};

/** Same headers on init, confirm, and check. Only Authorization changes per merchant. */
export async function postJson(
  url: string,
  authorization: string,
  language: string,
  body: unknown,
): Promise<ApiCallResult> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: authorization,
      "e-language": language,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let json: unknown = raw;
  try {
    json = JSON.parse(raw);
  } catch {
    json = raw;
  }
  return { httpStatus: response.status, raw, json };
}

export function authorizationHeader(apiKey: string): string {
  if (apiKey.toLowerCase().startsWith("epa ")) {
    return apiKey;
  }
  return `epa ${apiKey}`;
}

export function apiStatus(json: unknown): string | null {
  if (!json || typeof json !== "object" || !("status" in json)) {
    return null;
  }
  const status = (json as { status: unknown }).status;
  if (status === null || status === undefined) {
    return null;
  }
  return String(status);
}

export function apiMessage(json: unknown): string | undefined {
  if (!json || typeof json !== "object" || !("message" in json)) {
    return undefined;
  }
  const message = (json as { message: unknown }).message;
  return typeof message === "string" ? message : undefined;
}

export function paidTid(json: unknown): string | null {
  if (!json || typeof json !== "object") {
    return null;
  }
  const detail = (json as { txDetail?: { paidTid?: unknown } }).txDetail;
  const value = detail?.paidTid;
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return String(value);
}

export function txPaymentTokenId(json: unknown): string | null {
  if (!json || typeof json !== "object") {
    return null;
  }
  if ("txDetail" in json) {
    const detail = (json as { txDetail?: { txPaymentTokenId?: unknown } }).txDetail;
    const token = detail?.txPaymentTokenId;
    if (typeof token === "string" && token) {
      return token;
    }
  }
  if ("txPaymentTokenId" in json) {
    const token = (json as { txPaymentTokenId: unknown }).txPaymentTokenId;
    return typeof token === "string" && token ? token : null;
  }
  return null;
}
