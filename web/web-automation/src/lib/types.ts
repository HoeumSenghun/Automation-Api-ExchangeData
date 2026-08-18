export type StopAt = "INIT" | "CONFIRM" | "CHECK";

export type PaymentPackage = {
  code: string;
  amount: string;
  label: string;
  family: string;
};

export type Catalog = {
  serviceType?: string;
  currency: string;
  paymentCodes: readonly PaymentPackage[];
  amountPresets: readonly string[];
};

export type CatalogBootstrap = {
  merchants: string[];
  authRequired: boolean;
  configured: boolean;
  catalog: Catalog;
  merchantPackages: Record<string, PaymentPackage[]>;
  error?: string;
};

export type MerchantSecrets = {
  code: string;
  baseUrl: string;
  pin: string;
  apiKey: string;
  privateKey: string;
  publicKey: string;
  initPath: string;
  confirmPath: string;
  checkPath: string;
  paymentCodes: PaymentPackage[];
};


export type RunRequest = {
  merchantCode: string;
  paymentCode: string;
  paidAmount?: string;
  currency?: string;
  msisdn?: string;
  refId?: string;
  dryRun?: boolean;
  language?: string;
  secret?: string;
  /** INIT = init only. CONFIRM = Init → RSA → Confirm. CHECK = also Check. */
  stopAt?: StopAt;
};

export type StepName = "INIT" | "RSA" | "CONFIRM" | "CHECK";

export type StepResult = {
  name: StepName;
  ok: boolean;
  httpStatus?: number;
  request?: unknown;
  response?: unknown;
  detail?: string;
  error?: string;
  rsa?: RsaProcess;
};

export type RsaProcess = {
  decrypted: string;
  combined: string;
  finalToken: string;
};

export type RunResponse = {
  ok: boolean;
  dryRun?: boolean;
  merchant: string;
  service: "EXCHANGE_DATA";
  stopAt: StopAt;
  refId: string;
  url: string;
  paidTid?: string;
  steps: StepResult[];
  error?: { step: StepName | "CONFIG"; message: string };
};
