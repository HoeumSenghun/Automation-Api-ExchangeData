import { NextResponse } from "next/server";
import { loadCatalogBootstrap } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";

export async function GET() {
  const boot = loadCatalogBootstrap();
  return NextResponse.json(boot, { status: boot.error ? 500 : 200 });
}
