import { NextResponse } from "next/server";
import { executeRunRequest } from "@/lib/executeRun";
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

  const result = await executeRunRequest({
    ...input,
    secret: input.secret || request.headers.get("x-run-secret") || undefined,
  });
  const status = result.ok
    ? 200
    : result.error?.message === "Invalid run secret"
      ? 401
      : result.error?.step === "CONFIG"
        ? 400
        : 502;
  return NextResponse.json(result, { status });
}
