import { NextResponse } from "next/server";
import { checkRunSecret, loadEnv } from "@/lib/env";
import { runFlow } from "@/lib/runFlow";
import type { RunRequest } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  let input: RunRequest;
  try {
    input = (await request.json()) as RunRequest;
  } catch {
    return NextResponse.json({ ok: false, error: { step: "CONFIG", message: "Invalid JSON body" } }, { status: 400 });
  }

  if (!checkRunSecret(input.secret || request.headers.get("x-run-secret") || undefined)) {
    return NextResponse.json({ ok: false, error: { step: "CONFIG", message: "Invalid run secret" } }, { status: 401 });
  }

  if (!input.merchantCode) {
    return NextResponse.json(
      { ok: false, error: { step: "CONFIG", message: "merchantCode is required" } },
      { status: 400 },
    );
  }

  let env;
  try {
    env = loadEnv();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load .env";
    return NextResponse.json({ ok: false, error: { step: "CONFIG", message } }, { status: 500 });
  }

  const merchant = env.merchants.get(input.merchantCode);
  if (!merchant) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          step: "CONFIG",
          message: `Unknown merchant '${input.merchantCode}'. Known: ${[...env.merchants.keys()].join(", ") || "(none)"}`,
        },
      },
      { status: 400 },
    );
  }

  try {
    const result = await runFlow(input, merchant);
    const status = result.ok ? 200 : result.error?.step === "CONFIG" ? 400 : 502;
    return NextResponse.json(result, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Run failed";
    return NextResponse.json({ ok: false, error: { step: "CONFIG", message } }, { status: 500 });
  }
}
