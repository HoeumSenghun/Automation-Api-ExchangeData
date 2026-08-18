import { checkRunSecret, loadEnv } from "./env";
import { runFlow } from "./runFlow";
import type { RunRequest, RunResponse } from "./types";

function configFail(message: string, extra?: Partial<RunResponse>): RunResponse {
  return {
    ok: false,
    merchant: extra?.merchant ?? "",
    service: "EXCHANGE_DATA",
    stopAt: extra?.stopAt ?? "CONFIRM",
    refId: extra?.refId ?? "(none)",
    url: "",
    steps: [],
    error: { step: "CONFIG", message },
    ...extra,
  };
}

export async function executeRunRequest(input: RunRequest): Promise<RunResponse> {
  if (!checkRunSecret(input.secret)) {
    return configFail("Invalid run secret");
  }
  if (!input.merchantCode) {
    return configFail("merchantCode is required");
  }

  let env;
  try {
    env = loadEnv();
  } catch (error) {
    return configFail(error instanceof Error ? error.message : "Failed to load .env");
  }

  const merchant = env.merchants.get(input.merchantCode);
  if (!merchant) {
    return configFail(
      `Unknown merchant '${input.merchantCode}'. Known: ${[...env.merchants.keys()].join(", ") || "(none)"}`,
      { merchant: input.merchantCode },
    );
  }

  try {
    return await runFlow(input, merchant);
  } catch (error) {
    return configFail(error instanceof Error ? error.message : "Run failed", {
      merchant: input.merchantCode,
      stopAt: input.stopAt ?? "CONFIRM",
      refId: input.refId || "(none)",
    });
  }
}
