"use server";

import { executeRunRequest } from "@/lib/executeRun";
import type { RunRequest, RunResponse } from "@/lib/types";

export async function runExchange(input: RunRequest): Promise<RunResponse> {
  return executeRunRequest(input);
}
