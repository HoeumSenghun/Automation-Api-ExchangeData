import {
  CURRENCY,
  MSISDN_MAX,
  PAYMENT_CODE_MAX,
  REF_ID_MAX,
  SERVICE_TYPE,
  amountForPaymentCode,
  amountsMatch,
  parsePaidAmount,
} from "./catalog";
import { authorizationHeader, apiMessage, apiStatus, paidTid, postJson, txPaymentTokenId } from "./http";
import { nextRefId } from "./refId";
import { buildFinalToken } from "./rsa";
import type { MerchantSecrets, PaymentPackage, RunRequest, RunResponse, StepResult, StopAt } from "./types";

export type InitBody = {
  serviceType: typeof SERVICE_TYPE;
  refId: string;
  paymentCode: string;
  paidAmount: number;
  currency: string;
  msisdn: string;
};

function fail(
  response: RunResponse,
  step: StepResult["name"] | "CONFIG",
  message: string,
  extra?: Partial<StepResult>,
): RunResponse {
  if (step !== "CONFIG") {
    const last = response.steps.at(-1);
    if (last?.name === step) {
      last.ok = false;
      last.error = message;
    } else {
      response.steps.push({
        name: step,
        ok: false,
        error: message,
        ...extra,
      });
    }
  }
  response.ok = false;
  response.error = { step, message };
  return response;
}

function stepError(httpStatus: number, json: unknown): string | null {
  if (httpStatus < 200 || httpStatus >= 300) {
    return `HTTP ${httpStatus}`;
  }
  const status = apiStatus(json);
  if (status !== null && status !== "0") {
    const message = apiMessage(json);
    return `API status=${status}${message ? ` (${message})` : ""}`;
  }
  return null;
}

export function validateAndBuildInit(
  input: RunRequest,
  refId: string,
  packages: readonly PaymentPackage[],
): { body: InitBody } | { error: string } {
  if (refId.length > REF_ID_MAX) {
    return { error: `refId cannot exceed ${REF_ID_MAX} characters` };
  }
  const paymentCode = input.paymentCode?.trim();
  const msisdn = input.msisdn?.trim();
  const paidAmount = parsePaidAmount(String(input.paidAmount ?? ""));
  if (!paymentCode) {
    return { error: "paymentCode is required" };
  }
  if (paymentCode.length > PAYMENT_CODE_MAX) {
    return { error: `paymentCode cannot exceed ${PAYMENT_CODE_MAX} characters` };
  }
  if (paidAmount === null) {
    return { error: "paidAmount must be a positive number matching the package (for example 1.5 or 4)" };
  }
  const catalogAmount = amountForPaymentCode(packages, paymentCode);
  if (catalogAmount && !amountsMatch(catalogAmount, paidAmount)) {
    return { error: `${paymentCode} requires paidAmount ${catalogAmount}` };
  }
  if (!msisdn) {
    return { error: "msisdn is required" };
  }
  if (msisdn.length > MSISDN_MAX) {
    return { error: `msisdn cannot exceed ${MSISDN_MAX} characters` };
  }
  return {
    body: {
      serviceType: SERVICE_TYPE,
      refId,
      paymentCode,
      paidAmount,
      currency: (input.currency || CURRENCY).toUpperCase(),
      msisdn,
    },
  };
}

export async function runFlow(
  input: RunRequest,
  merchant: MerchantSecrets,
): Promise<RunResponse> {
  const refId = nextRefId(input.refId);
  const language = input.language?.trim() || "en";
  const stopAt: StopAt =
    input.stopAt === "INIT" || input.stopAt === "CHECK" ? input.stopAt : "CONFIRM";
  const auth = authorizationHeader(merchant.apiKey);
  const result: RunResponse = {
    ok: true,
    merchant: merchant.code,
    service: SERVICE_TYPE,
    stopAt,
    refId,
    url: merchant.baseUrl,
    steps: [],
  };

  const built = validateAndBuildInit(input, refId, merchant.paymentCodes);
  if ("error" in built) {
    return fail(result, "CONFIG", built.error);
  }

  if (input.dryRun) {
    result.dryRun = true;
    result.steps.push({
      name: "INIT",
      ok: true,
      request: built.body,
      detail: `Preview only. Would POST ${merchant.baseUrl}${merchant.initPath}`,
    });
    return result;
  }

  const init = await postJson(`${merchant.baseUrl}${merchant.initPath}`, auth, language, built.body);
  const initFail = stepError(init.httpStatus, init.json);
  result.steps.push({
    name: "INIT",
    ok: !initFail,
    httpStatus: init.httpStatus,
    request: built.body,
    response: init.json,
    error: initFail ?? undefined,
  });
  if (initFail) {
    return fail(result, "INIT", initFail);
  }
  if (stopAt === "INIT") {
    return result;
  }

  const rawToken = txPaymentTokenId(init.json);
  if (!rawToken) {
    return fail(result, "INIT", "Response did not contain txPaymentTokenId");
  }

  let rsaProcess;
  try {
    rsaProcess = buildFinalToken(rawToken, merchant.privateKey, merchant.publicKey, merchant.pin);
    result.steps.push({
      name: "RSA",
      ok: true,
      detail: "Decrypt token → append PIN → encrypt final token",
      rsa: rsaProcess,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "RSA failed";
    return fail(result, "RSA", message);
  }

  const confirmBody = { refId, txPaymentTokenId: rsaProcess.finalToken };
  const confirm = await postJson(
    `${merchant.baseUrl}${merchant.confirmPath}`,
    auth,
    language,
    confirmBody,
  );
  const confirmFail = stepError(confirm.httpStatus, confirm.json);
  result.steps.push({
    name: "CONFIRM",
    ok: !confirmFail,
    httpStatus: confirm.httpStatus,
    request: confirmBody,
    response: confirm.json,
    error: confirmFail ?? undefined,
  });
  const confirmTid = paidTid(confirm.json);
  if (confirmTid) {
    result.paidTid = confirmTid;
  }
  if (confirmFail) {
    return fail(result, "CONFIRM", confirmFail);
  }
  if (stopAt === "CONFIRM") {
    return result;
  }

  const checkBody = { refId };
  const check = await postJson(`${merchant.baseUrl}${merchant.checkPath}`, auth, language, checkBody);
  const checkFail = stepError(check.httpStatus, check.json);
  result.steps.push({
    name: "CHECK",
    ok: !checkFail,
    httpStatus: check.httpStatus,
    request: checkBody,
    response: check.json,
    error: checkFail ?? undefined,
  });
  const checkTid = paidTid(check.json);
  if (checkTid) {
    result.paidTid = checkTid;
  }
  if (checkFail) {
    return fail(result, "CHECK", checkFail);
  }

  return result;
}
