"use client";

import { memo, useCallback, useMemo, useRef, useState, useSyncExternalStore, type ReactNode, type Ref } from "react";
import { runExchange } from "@/app/actions/run";
import { MSISDN_MAX, PAYMENT_CODE_MAX, REF_ID_MAX, amountPresetsFrom, groupPackages } from "@/lib/catalog";
import type { CatalogBootstrap, PaymentPackage, RunResponse, StepResult, StopAt } from "@/lib/types";

const MSISDN_KEY = "exchangedata-msisdn";
const DEFAULT_MSISDN = "855312566940";

const FIELD =
  "w-full min-w-0 rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-base text-white outline-none ring-teal-400/40 focus:ring-2 sm:py-2.5 sm:text-sm";

const STOP_OPTIONS: { id: StopAt; title: string; hint: string }[] = [
  { id: "INIT", title: "Init", hint: "Only" },
  { id: "CONFIRM", title: "Confirm", hint: "Init → RSA → Confirm" },
  { id: "CHECK", title: "Check", hint: "Full flow" },
];

function stepsFor(stopAt: StopAt): StepResult["name"][] {
  if (stopAt === "INIT") {
    return ["INIT"];
  }
  if (stopAt === "CONFIRM") {
    return ["INIT", "RSA", "CONFIRM"];
  }
  return ["INIT", "RSA", "CONFIRM", "CHECK"];
}

function stopLabel(stopAt: StopAt): string {
  if (stopAt === "INIT") {
    return "Init only";
  }
  if (stopAt === "CONFIRM") {
    return "To Confirm";
  }
  return "To Check";
}

function runButtonLabel(stopAt: StopAt): string {
  if (stopAt === "INIT") {
    return "Run Init only";
  }
  if (stopAt === "CONFIRM") {
    return "Run to Confirm";
  }
  return "Run to Check";
}

function pretty(value: unknown): string {
  if (value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return JSON.stringify(value, null, 2);
}

function packagesForMerchant(boot: CatalogBootstrap, merchant: string): readonly PaymentPackage[] {
  if (merchant && boot.merchantPackages[merchant]?.length) {
    return boot.merchantPackages[merchant];
  }
  return boot.catalog.paymentCodes;
}

function firstPackage(boot: CatalogBootstrap, merchant: string): PaymentPackage | undefined {
  return packagesForMerchant(boot, merchant)[0];
}

function readMsisdn(): string {
  try {
    return sessionStorage.getItem(MSISDN_KEY) || DEFAULT_MSISDN;
  } catch {
    return DEFAULT_MSISDN;
  }
}

function subscribeMsisdn(onStoreChange: () => void): () => void {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

function scrollResult(node: HTMLElement | null) {
  if (!node || window.matchMedia("(min-width: 1024px)").matches) {
    return;
  }
  node.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function RunConsole({ boot }: { boot: CatalogBootstrap }) {
  const initialMerchant = boot.merchants[0] ?? "";
  const initialPkg = firstPackage(boot, initialMerchant);
  const [merchant, setMerchant] = useState(initialMerchant);
  const [stopAt, setStopAt] = useState<StopAt>("CONFIRM");
  const [paymentCode, setPaymentCode] = useState(initialPkg?.code ?? "");
  const [customPaymentCode, setCustomPaymentCode] = useState("");
  const [amount, setAmount] = useState(initialPkg?.amount ?? "");
  const [customAmount, setCustomAmount] = useState("");
  const savedMsisdn = useSyncExternalStore(subscribeMsisdn, readMsisdn, () => DEFAULT_MSISDN);
  const [msisdnDraft, setMsisdnDraft] = useState<string | null>(null);
  const msisdn = msisdnDraft ?? savedMsisdn;
  const [refId, setRefId] = useState("");
  const [dryRun, setDryRun] = useState(false);
  const [secret, setSecret] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResponse | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const resultRef = useRef<HTMLElement>(null);
  const copyTimer = useRef<number>(0);
  const runGen = useRef(0);

  const paymentCodes = useMemo(() => packagesForMerchant(boot, merchant), [boot, merchant]);
  const packageByCode = useMemo(() => {
    const map = new Map<string, PaymentPackage>();
    for (const item of paymentCodes) {
      map.set(item.code, item);
    }
    return map;
  }, [paymentCodes]);
  const amountPresets = useMemo(
    () => (boot.catalog.amountPresets.length ? boot.catalog.amountPresets : amountPresetsFrom(paymentCodes)),
    [boot.catalog.amountPresets, paymentCodes],
  );
  const packageGroups = useMemo(() => groupPackages(paymentCodes), [paymentCodes]);
  const currency = boot.catalog.currency;
  const customCode = customPaymentCode.trim();
  const resolvedPaymentCode = customCode || paymentCode;
  const paidAmount = customAmount.trim() || amount;

  const canRun = useMemo(
    () =>
      Boolean(
        merchant &&
          !running &&
          resolvedPaymentCode &&
          paidAmount &&
          msisdn.trim() &&
          (!boot.authRequired || secret.trim()),
      ),
    [merchant, running, resolvedPaymentCode, paidAmount, msisdn, boot.authRequired, secret],
  );

  const copy = useCallback(async (label: string, value: unknown) => {
    await navigator.clipboard.writeText(pretty(value));
    setCopied(label);
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(null), 1200);
  }, []);

  const selectMerchant = useCallback(
    (code: string) => {
      setMerchant(code);
      const next = firstPackage(boot, code);
      setPaymentCode(next?.code ?? "");
      setAmount(next?.amount ?? "");
      setCustomPaymentCode("");
      setCustomAmount("");
    },
    [boot],
  );

  const selectPaymentCode = useCallback(
    (code: string) => {
      setPaymentCode(code);
      setCustomPaymentCode("");
      const matched = packageByCode.get(code)?.amount;
      if (matched) {
        setAmount(matched);
        setCustomAmount("");
      }
    },
    [packageByCode],
  );

  const selectAmount = useCallback((preset: string) => {
    setAmount(preset);
    setCustomAmount("");
  }, []);

  const toggleAdvanced = useCallback(() => {
    setShowAdvanced((value) => !value);
  }, []);

  const run = useCallback(async () => {
    if (!canRun) {
      return;
    }
    const gen = ++runGen.current;
    setRunning(true);
    setResult(null);
    const phone = msisdn.trim();
    sessionStorage.setItem(MSISDN_KEY, phone);
    try {
      const data = await runExchange({
        merchantCode: merchant,
        stopAt,
        paymentCode: resolvedPaymentCode,
        paidAmount,
        currency,
        msisdn: phone || undefined,
        refId: refId.trim() || undefined,
        dryRun,
        secret: secret.trim() || undefined,
      });
      if (gen !== runGen.current) {
        return;
      }
      setResult(data);
      window.setTimeout(() => scrollResult(resultRef.current), 0);
    } catch (error) {
      if (gen !== runGen.current) {
        return;
      }
      setResult({
        ok: false,
        merchant,
        service: "EXCHANGE_DATA",
        stopAt,
        refId: refId || "(none)",
        url: "",
        steps: [],
        error: { step: "CONFIG", message: error instanceof Error ? error.message : "Network error" },
      });
      window.setTimeout(() => scrollResult(resultRef.current), 0);
    } finally {
      if (gen === runGen.current) {
        setRunning(false);
      }
    }
  }, [
    canRun,
    merchant,
    stopAt,
    resolvedPaymentCode,
    paidAmount,
    currency,
    msisdn,
    refId,
    dryRun,
    secret,
  ]);

  return (
    <div className="mx-auto grid w-full min-w-0 max-w-6xl gap-4 sm:gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
      <section className="min-w-0 rounded-2xl border border-white/10 bg-slate-900/70 p-4 shadow-xl shadow-black/20 backdrop-blur sm:p-5">
        <div className="mb-4 sm:mb-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-teal-300/80 sm:text-xs">
            Test console
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-white sm:text-2xl">
            ExchangeData Automation
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Pick merchant and package, then run Init → RSA → Confirm (sends refId) → Check.
            Same headers on every step; only the merchant API key changes. Keys stay on the server.
          </p>
        </div>

        {boot.error && <Banner tone="bad">{boot.error}</Banner>}
        {!boot.configured && (
          <Banner tone="warn">
            No merchants loaded. Add{" "}
            <code className="break-all font-mono text-amber-100">.env.local</code> in the web app folder, or keep
            the Java <code className="font-mono text-amber-100">.env</code> at the repo root for local runs.
          </Banner>
        )}
        {boot.configured && !paymentCodes.length && (
          <Banner tone="warn">
            No payment codes loaded. Add{" "}
            <code className="break-all font-mono text-amber-100">paymentCodes</code> to the gitignored{" "}
            <code className="font-mono text-amber-100">.env</code> (see{" "}
            <code className="font-mono text-amber-100">.env.example</code>).
          </Banner>
        )}

        <label className="block text-sm font-medium text-slate-300">
          Merchant
          <select
            className={`mt-1.5 ${FIELD}`}
            value={merchant}
            onChange={(e) => selectMerchant(e.target.value)}
          >
            {!boot.merchants.length && <option value="">No merchants</option>}
            {boot.merchants.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-4">
          <p className="text-sm font-medium text-slate-300">Stop after</p>
          <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {STOP_OPTIONS.map((option) => (
              <ChoiceButton
                key={option.id}
                id={option.id}
                active={stopAt === option.id}
                title={option.title}
                hint={option.hint}
                onSelect={setStopAt}
              />
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <p className="text-sm font-medium text-slate-300">Package</p>
          {packageGroups.map(({ family, items }) => (
            <div key={family}>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                {family}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {items.map((item) => (
                  <Chip
                    key={item.code}
                    value={item.code}
                    active={!customCode && paymentCode === item.code}
                    title={item.label}
                    subtitle={`${item.code} · ${item.amount} ${currency}`}
                    onSelect={selectPaymentCode}
                  />
                ))}
              </div>
            </div>
          ))}
          <input
            className={`${FIELD} font-mono`}
            placeholder="Custom paymentCode (optional, max 15)"
            maxLength={PAYMENT_CODE_MAX}
            value={customPaymentCode}
            onChange={(e) => setCustomPaymentCode(e.target.value)}
          />
        </div>

        <div className="mt-4 space-y-3">
          <p className="text-sm font-medium text-slate-300">
            Amount ({currency})
            {!customCode && <span className="ml-2 font-normal text-slate-500">locked to package</span>}
          </p>
          {customCode ? (
            <>
              <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
                {amountPresets.map((preset) => (
                  <Chip
                    key={preset}
                    value={preset}
                    active={amount === preset && !customAmount.trim()}
                    title={`${preset} ${currency}`}
                    onSelect={selectAmount}
                  />
                ))}
              </div>
              <input
                className={FIELD}
                inputMode="decimal"
                placeholder="Custom paidAmount"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                onBlur={() => {
                  const value = customAmount.trim();
                  if (value) {
                    setAmount(value);
                  }
                }}
              />
            </>
          ) : (
            <div className="rounded-xl border border-white/10 bg-slate-950 px-3 py-3 font-mono text-sm text-white">
              {amount} {currency}
            </div>
          )}
          <label className="block text-sm font-medium text-slate-300">
            MSISDN
            <input
              className={`mt-1.5 ${FIELD} font-mono`}
              placeholder="855XXXXXXXX"
              inputMode="tel"
              maxLength={MSISDN_MAX}
              value={msisdn}
              onChange={(e) => setMsisdnDraft(e.target.value)}
            />
          </label>
        </div>

        <button
          type="button"
          className="mt-5 text-left text-sm text-slate-400 underline-offset-4 hover:text-white hover:underline"
          onClick={toggleAdvanced}
        >
          {showAdvanced ? "Hide" : "Show"} advanced (refId, dry run
          {boot.authRequired ? ", secret" : ""})
        </button>

        {showAdvanced && (
          <div className="mt-3 space-y-3 rounded-xl border border-white/10 bg-slate-950/60 p-3">
            <label className="block text-sm text-slate-300">
              Custom refId
              <input
                className="mt-1 w-full min-w-0 rounded-lg border border-white/10 bg-slate-900 px-3 py-3 font-mono text-base text-white outline-none ring-teal-400/40 focus:ring-2 sm:py-2 sm:text-xs"
                placeholder="Leave empty to auto-generate EXCHyymmdd#### (max 20)"
                maxLength={REF_ID_MAX}
                value={refId}
                onChange={(e) => setRefId(e.target.value)}
              />
            </label>
            <label className="flex items-start gap-2 text-sm leading-5 text-slate-300">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-teal-400"
              />
              Dry run — build the init body, do not call the API
            </label>
            {boot.authRequired && (
              <label className="block text-sm text-slate-300">
                Run secret
                <input
                  type="password"
                  className="mt-1 w-full min-w-0 rounded-lg border border-white/10 bg-slate-900 px-3 py-3 text-base text-white outline-none ring-teal-400/40 focus:ring-2 sm:py-2 sm:text-sm"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                />
              </label>
            )}
          </div>
        )}

        <div className="sticky bottom-0 z-10 -mx-4 mt-5 border-t border-white/10 bg-slate-900/95 px-4 py-3 backdrop-blur sm:-mx-5 sm:px-5 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none">
          <button
            type="button"
            disabled={!canRun}
            onClick={() => void run()}
            className="w-full min-h-12 rounded-xl bg-teal-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            {running ? "Running…" : dryRun ? "Preview init body" : runButtonLabel(stopAt)}
          </button>
        </div>
      </section>

      <ResultPanel
        ref={resultRef}
        result={result}
        running={running}
        copied={copied}
        onCopy={copy}
      />
    </div>
  );
}

const ResultPanel = memo(function ResultPanel({
  ref,
  result,
  running,
  copied,
  onCopy,
}: {
  ref: Ref<HTMLElement>;
  result: RunResponse | null;
  running: boolean;
  copied: string | null;
  onCopy: (label: string, value: unknown) => void;
}) {
  const stepsByName = useMemo(() => {
    const map = new Map<StepResult["name"], StepResult>();
    if (!result) {
      return map;
    }
    for (const step of result.steps) {
      map.set(step.name, step);
    }
    return map;
  }, [result]);

  return (
    <section
      ref={ref}
      className="min-w-0 scroll-mt-4 rounded-2xl border border-white/10 bg-slate-900/40 p-4 sm:p-5"
    >
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500 sm:text-xs">Result</p>
          <h2 className="text-lg font-semibold text-white">Steps</h2>
        </div>
        {result && (
          <span
            className={`w-fit rounded-full px-3 py-1 text-xs font-medium ${
              result.ok ? "bg-teal-400/15 text-teal-200" : "bg-rose-400/15 text-rose-200"
            }`}
          >
            {result.dryRun
              ? "Dry run"
              : result.ok
                ? "All steps passed"
                : `Failed at ${result.error?.step ?? "unknown"}`}
          </span>
        )}
      </div>

      {!result && !running && (
        <div className="rounded-xl border border-dashed border-white/15 px-4 py-10 text-center text-sm text-slate-500 sm:py-16">
          Run a test to see Init, RSA, Confirm, and Check here.
          <div className="mt-2 text-xs">Use dry run first if you only want to inspect the payload.</div>
        </div>
      )}

      {running && !result && (
        <div className="rounded-xl border border-white/10 px-4 py-10 text-center text-sm text-slate-400">
          Calling the API…
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-3 font-mono text-[11px] leading-5 text-slate-300 sm:px-4 sm:text-xs">
            <div className="break-all">merchant {result.merchant}</div>
            <div className="break-all">service {result.service}</div>
            <div className="break-all">stop {stopLabel(result.stopAt)}</div>
            <div className="break-all">refId {result.refId}</div>
          </div>
          {result.paidTid && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-teal-300/30 bg-teal-400/10 px-4 py-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-teal-200/80">TID</p>
                <p className="mt-1 break-all font-mono text-lg font-semibold text-white">{result.paidTid}</p>
                <p className="mt-1 text-xs text-teal-100/70">eMoney side — use this to check the system</p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-lg border border-teal-300/30 px-3 py-1.5 text-xs text-teal-100 hover:bg-teal-400/10"
                onClick={() => void onCopy("TID", result.paidTid)}
              >
                {copied === "TID" ? "Copied" : "Copy TID"}
              </button>
            </div>
          )}
          {result.error && <Banner tone="bad">{result.error.message}</Banner>}
          <ol className="space-y-3">
            {stepsFor(result.stopAt).map((name) => {
              const step = stepsByName.get(name);
              return (
                <li key={name} className="min-w-0 rounded-xl border border-white/10 bg-slate-950/50 p-3 sm:p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <StatusDot step={step} running={running && !step} />
                      <span className="text-sm font-semibold text-white">{name}</span>
                      {step?.httpStatus != null && (
                        <span className="text-xs text-slate-500">HTTP {step.httpStatus}</span>
                      )}
                    </div>
                    {step?.response != null && (
                      <button
                        type="button"
                        className="shrink-0 text-xs text-slate-400 hover:text-white"
                        onClick={() => void onCopy(name, step.response)}
                      >
                        {copied === name ? "Copied" : "Copy response"}
                      </button>
                    )}
                    {step?.rsa && (
                      <button
                        type="button"
                        className="shrink-0 text-xs text-slate-400 hover:text-white"
                        onClick={() => void onCopy("rsa-all", step.rsa)}
                      >
                        {copied === "rsa-all" ? "Copied" : "Copy RSA"}
                      </button>
                    )}
                  </div>
                  {step?.detail && <p className="mt-2 text-sm text-slate-400">{step.detail}</p>}
                  {step?.error && <p className="mt-2 break-words text-sm text-rose-300">{step.error}</p>}
                  {step?.rsa && (
                    <div className="mt-3 space-y-2">
                      <RsaField
                        label="1. Decrypt token"
                        copyKey="rsa-decrypted"
                        value={step.rsa.decrypted}
                        copied={copied}
                        onCopy={onCopy}
                      />
                      <RsaField
                        label="2. Append PIN (plain|pin)"
                        copyKey="rsa-combined"
                        value={step.rsa.combined}
                        copied={copied}
                        onCopy={onCopy}
                      />
                      <RsaField
                        label="3. Final token (encrypt)"
                        copyKey="rsa-final"
                        value={step.rsa.finalToken}
                        copied={copied}
                        onCopy={onCopy}
                      />
                    </div>
                  )}
                  {step?.request != null && (
                    <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-black/40 p-3 text-[11px] leading-5 text-slate-300">
                      {pretty(step.request)}
                    </pre>
                  )}
                  {step?.response != null && (
                    <pre className="mt-2 max-h-52 overflow-auto rounded-lg bg-black/40 p-3 text-[11px] leading-5 text-emerald-100/90 sm:max-h-64">
                      {pretty(step.response)}
                    </pre>
                  )}
                  {!step && <p className="mt-2 text-xs text-slate-600">Not reached</p>}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
});

const RsaField = memo(function RsaField({
  label,
  copyKey,
  value,
  copied,
  onCopy,
}: {
  label: string;
  copyKey: string;
  value: string;
  copied: string | null;
  onCopy: (label: string, value: unknown) => void;
}) {
  return (
    <div className="rounded-lg bg-black/40 p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <button
          type="button"
          className="shrink-0 text-[11px] text-slate-400 hover:text-white"
          onClick={() => void onCopy(copyKey, value)}
        >
          {copied === copyKey ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-h-32 overflow-auto text-[11px] leading-5 text-amber-100/90">{value}</pre>
    </div>
  );
});

const ChoiceButton = memo(function ChoiceButton({
  id,
  active,
  title,
  hint,
  onSelect,
}: {
  id: StopAt;
  active: boolean;
  title: string;
  hint: string;
  onSelect: (id: StopAt) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={`min-h-11 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition sm:min-h-0 ${
        active
          ? "border-teal-300/40 bg-teal-400/15 text-white"
          : "border-white/10 bg-slate-950 text-slate-300 hover:border-white/20"
      }`}
    >
      {title}
      <span className="block text-[11px] font-normal text-slate-400">{hint}</span>
    </button>
  );
});

const Chip = memo(function Chip({
  value,
  active,
  title,
  subtitle,
  onSelect,
}: {
  value: string;
  active: boolean;
  title: string;
  subtitle?: string;
  onSelect: (value: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`min-h-11 rounded-lg border px-3 py-2.5 text-left text-xs font-medium transition sm:min-h-0 sm:py-2 ${
        active
          ? "border-teal-300/50 bg-teal-400/15 text-white"
          : "border-white/10 bg-slate-950 text-slate-300 hover:border-white/25"
      }`}
    >
      {subtitle ? (
        <>
          <span className="block text-sm">{title}</span>
          <span className="text-[11px] text-slate-400">{subtitle}</span>
        </>
      ) : (
        title
      )}
    </button>
  );
});

function Banner({ tone, children }: { tone: "warn" | "bad"; children: ReactNode }) {
  const cls =
    tone === "warn"
      ? "border-amber-400/20 bg-amber-400/10 text-amber-100"
      : "border-rose-400/20 bg-rose-400/10 text-rose-100";
  return (
    <div className={`mb-4 overflow-hidden break-words rounded-xl border px-3 py-2.5 text-sm leading-6 ${cls}`}>
      {children}
    </div>
  );
}

function StatusDot({ step, running }: { step?: StepResult; running?: boolean }) {
  let cls = "bg-slate-600";
  if (running) {
    cls = "bg-amber-300 animate-pulse";
  } else if (step?.ok) {
    cls = "bg-teal-300";
  } else if (step && !step.ok) {
    cls = "bg-rose-400";
  }
  return <span className={`inline-block size-2.5 rounded-full ${cls}`} />;
}
