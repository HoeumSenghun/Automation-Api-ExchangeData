import { cache } from "react";
import { amountPresetsFrom, CURRENCY, SERVICE_TYPE } from "./catalog";
import { loadEnv } from "./env";
import type { CatalogBootstrap } from "./types";

export const loadCatalogBootstrap = cache(function loadCatalogBootstrap(): CatalogBootstrap {
  try {
    const env = loadEnv();
    const merchantPackages = Object.fromEntries(
      [...env.merchants.entries()].map(([code, merchant]) => [code, merchant.paymentCodes]),
    );
    return {
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
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load merchants";
    return {
      merchants: [],
      authRequired: false,
      configured: false,
      catalog: {
        serviceType: SERVICE_TYPE,
        currency: CURRENCY,
        paymentCodes: [],
        amountPresets: [],
      },
      merchantPackages: {},
      error: message,
    };
  }
});
