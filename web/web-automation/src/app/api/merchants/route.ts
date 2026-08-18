import { NextResponse } from "next/server";
import { loadEnv } from "@/lib/env";
import { amountPresetsFrom, CURRENCY, SERVICE_TYPE } from "@/lib/catalog";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const env = loadEnv();
    const merchantPackages = Object.fromEntries(
      [...env.merchants.entries()].map(([code, merchant]) => [code, merchant.paymentCodes]),
    );
    return NextResponse.json({
      merchants: [...env.merchants.keys()],
      authRequired: env.authRequired,
      configured: env.merchants.size > 0,
      catalog: {
        serviceType: SERVICE_TYPE,
        currency: CURRENCY,
        paymentCodes: env.paymentCodes,
        amountPresets: amountPresetsFrom(env.paymentCodes),
      },
      merchantPackages,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load merchants";
    return NextResponse.json({ merchants: [], configured: false, error: message }, { status: 500 });
  }
}
