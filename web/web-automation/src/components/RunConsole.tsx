"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CURRENCY, familiesFrom } from "@/lib/catalog";
import type { PaymentPackage, RunResponse, StepResult, StopAt } from "@/lib/types";

type Catalog = {
  currency: string;
  paymentCodes: readonly PaymentPackage[];
  amountPresets: readonly string[];
};

type Bootstrap = {
  merchants: string[];
  authRequired: boolean;
  configured: boolean;
  catalog?: Catalog;
  merchantPackages?: Record<string, PaymentPackage[]>;
  error?: string;
};

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

export function RunConsole() {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [merchant, setMerchant] = useState("");
  const [stopAt, setStopAt] = useState<StopAt>("CONFIRM");
  const [paymentCode, setPaymentCode] = useState("");
  const [customPaymentCode, setCustomPaymentCode] = useState("");
  const [amount, setAmount] = useState("");
  const [customAmount, setCustomAmount] = useState("");
  const [msisdn, setMsisdn] = useState("855312566940");
  const [refId, setRefId] = useState("");
  const [dryRun, setDryRun] = useState(false);
  const [secret, setSecret] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResponse | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const resultRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/merchants")
      .then(async (res) => {
        const data = (await res.json()) as Bootstrap;
        if (cancelled) {
          return;
        }
        setBoot(data);
        if (data.merchants[0]) {
          setMerchant(data.merchants[0]);
        }
        const firstMerchant = data.merchants[0];
        const firstCode =
          (firstMerchant && data.merchantPackages?.[firstMerchant]?.[0]) || data.catalog?.paymentCodes[0];
        if (firstCode) {
          setPaymentCode(firstCode.code);
          setAmount(firstCode.amount);
        }
        const savedMsisdn = sessionStorage.getItem("exchangedata-msisdn");
        if (savedMsisdn) {
          setMsisdn(savedMsisdn);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setBootError(error instanceof Error ? error.message : "Failed to load config");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const paymentCodes = useMemo<readonly PaymentPackage[]>(() => {
    if (merchant && boot?.merchantPackages?.[merchant]?.length) {
      return boot.merchantPackages[merchant];
    }
    return boot?.catalog?.paymentCodes ?? [];
  }, [merchant, boot]);
  const amountPresets = useMemo(
    () => boot?.catalog?.amountPresets ?? [...new Set(paymentCodes.map((item) => item.amount))],
    [boot, paymentCodes],
  );
  const currency = boot?.catalog?.currency ?? CURRENCY;
  const packageFamilies = familiesFrom(paymentCodes);
  const resolvedPaymentCode = customPaymentCode.trim() || paymentCode;

  useEffect(() => {
    if (!result) {
      return;
    }
    const wide = window.matchMedia("(min-width: 1024px)").matches;
    if (!wide) {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [result]);

  useEffect(() => {
    if (!paymentCodes.length) {
      return;
    }
    if (paymentCode && paymentCodes.some((item) => item.code === paymentCode)) {
      return;
    }
    setPaymentCode(paymentCodes[0].code);
    setAmount(paymentCodes[0].amount);
    setCustomPaymentCode("");
    setCustomAmount("");
  }, [merchant, paymentCodes, paymentCode]);

  const canRun = useMemo(() => {
    if (!merchant || running) {
      return false;
    }
    if (boot?.authRequired && !secret.trim()) {
      return false;
    }
    return Boolean(resolvedPaymentCode && (customAmount.trim() || amount) && msisdn.trim());
  }, [merchant, running, boot?.authRequired, secret, resolvedPaymentCode, customAmount, amount, msisdn]);

  async function copy(label: string, value: unknown) {
    await navigator.clipboard.writeText(pretty(value));
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1200);
  }

  function selectPaymentCode(code: string) {
    setPaymentCode(code);
    setCustomPaymentCode("");
    const matched = paymentCodes.find((item) => item.code === code)?.amount;
    if (matched) {
      setAmount(matched);
      setCustomAmount("");
    }
  }

  async function run() {
    if (!canRun) {
      return;
    }
    setRunning(true);
    setResult(null);
    sessionStorage.setItem("exchangedata-msisdn", msisdn.trim());
    const paidAmount = customAmount.trim() || amount;
    try {
      const body = {
        merchantCode: merchant,
        stopAt,
        paymentCode: resolvedPaymentCode,
        paidAmount,
        currency,
        msisdn: msisdn.trim() || undefined,
        refId: refId.trim() || undefined,
        dryRun,
        secret: secret.trim() || undefined,
      };
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as RunResponse;
      setResult(data);
    } catch (error) {
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
    } finally {
      setRunning(false);
    }
  }

  function applyCustomAmount() {
    const value = customAmount.trim();
    if (value) {
      setAmount(value);
    }
  }

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

        {bootError && <Banner tone="bad">{bootError}</Banner>}
        {boot && !boot.configured && (
          <Banner tone="warn">
            No merchants loaded. Add{" "}
            <code className="break-all font-mono text-amber-100">.env.local</code> in the web app folder, or keep
            the Java <code className="font-mono text-amber-100">.env</code> at the repo root for local runs.
          </Banner>
        )}
        {boot?.configured && !paymentCodes.length && (
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
            className="mt-1.5 w-full min-w-0 rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-base text-white outline-none ring-teal-400/40 focus:ring-2 sm:py-2.5 sm:text-sm"
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
          >
            {!boot?.merchants.length && <option value="">No merchants</option>}
            {boot?.merchants.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-4">
          <p className="text-sm font-medium text-slate-300">Stop after</p>
          <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <ServiceButton active={stopAt === "INIT"} onClick={() => setStopAt("INIT")}>
              Init
              <span className="block text-[11px] font-normal text-slate-400">Only</span>
            </ServiceButton>
            <ServiceButton active={stopAt === "CONFIRM"} onClick={() => setStopAt("CONFIRM")}>
              Confirm
              <span className="block text-[11px] font-normal text-slate-400">Init → RSA → Confirm</span>
            </ServiceButton>
            <ServiceButton active={stopAt === "CHECK"} onClick={() => setStopAt("CHECK")}>
              Check
              <span className="block text-[11px] font-normal text-slate-400">Full flow</span>
            </ServiceButton>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <p className="text-sm font-medium text-slate-300">Package</p>
          {packageFamilies.map((family) => {
            const items = paymentCodes.filter((item) => (item.family || "Packages") === family);
            if (!items.length) {
              return null;
            }
            return (
              <div key={family}>
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                  {family}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {items.map((item) => (
                    <Chip
                      key={item.code}
                      active={!customPaymentCode.trim() && paymentCode === item.code}
                      onClick={() => selectPaymentCode(item.code)}
                    >
                      <span className="block text-sm">{item.label}</span>
                      <span className="text-[11px] text-slate-400">
                        {item.code} · {item.amount} {currency}
                      </span>
                    </Chip>
                  ))}
                </div>
              </div>
            );
          })}
          <input
            className="w-full min-w-0 rounded-xl border border-white/10 bg-slate-950 px-3 py-3 font-mono text-base text-white outline-none ring-teal-400/40 focus:ring-2 sm:py-2 sm:text-sm"
            placeholder="Custom paymentCode (optional, max 15)"
            maxLength={15}
            value={customPaymentCode}
            onChange={(e) => setCustomPaymentCode(e.target.value)}
          />
        </div>

        <div className="mt-4 space-y-3">
          <p className="text-sm font-medium text-slate-300">
            Amount ({currency})
            {!customPaymentCode.trim() && (
              <span className="ml-2 font-normal text-slate-500">locked to package</span>
            )}
          </p>
          {customPaymentCode.trim() ? (
            <>
              <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
                {amountPresets.map((preset) => (
                  <Chip
                    key={preset}
                    active={amount === preset && !customAmount.trim()}
                    onClick={() => {
                      setAmount(preset);
                      setCustomAmount("");
                    }}
                  >
                    {preset} {currency}
                  </Chip>
                ))}
              </div>
              <input
                className="w-full min-w-0 rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-base text-white outline-none ring-teal-400/40 focus:ring-2 sm:py-2 sm:text-sm"
                inputMode="decimal"
                placeholder="Custom paidAmount"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                onBlur={applyCustomAmount}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    applyCustomAmount();
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
              className="mt-1.5 w-full min-w-0 rounded-xl border border-white/10 bg-slate-950 px-3 py-3 font-mono text-base text-white outline-none ring-teal-400/40 focus:ring-2 sm:py-2.5 sm:text-sm"
              placeholder="855XXXXXXXX"
              inputMode="tel"
              maxLength={15}
              value={msisdn}
              onChange={(e) => setMsisdn(e.target.value)}
            />
          </label>
        </div>

        <button
          type="button"
          className="mt-5 text-left text-sm text-slate-400 underline-offset-4 hover:text-white hover:underline"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? "Hide" : "Show"} advanced (refId, dry run
          {boot?.authRequired ? ", secret" : ""})
        </button>

        {showAdvanced && (
          <div className="mt-3 space-y-3 rounded-xl border border-white/10 bg-slate-950/60 p-3">
            <label className="block text-sm text-slate-300">
              Custom refId
              <input
                className="mt-1 w-full min-w-0 rounded-lg border border-white/10 bg-slate-900 px-3 py-3 font-mono text-base text-white outline-none ring-teal-400/40 focus:ring-2 sm:py-2 sm:text-xs"
                placeholder="Leave empty to auto-generate EXCHyymmdd#### (max 20)"
                maxLength={20}
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
            {boot?.authRequired && (
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

      <section
        ref={resultRef}
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
                result.ok
                  ? "bg-teal-400/15 text-teal-200"
                  : "bg-rose-400/15 text-rose-200"
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
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-teal-200/80">
                    TID
                  </p>
                  <p className="mt-1 break-all font-mono text-lg font-semibold text-white">{result.paidTid}</p>
                  <p className="mt-1 text-xs text-teal-100/70">eMoney side — use this to check the system</p>
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-lg border border-teal-300/30 px-3 py-1.5 text-xs text-teal-100 hover:bg-teal-400/10"
                  onClick={() => void copy("TID", result.paidTid)}
                >
                  {copied === "TID" ? "Copied" : "Copy TID"}
                </button>
              </div>
            )}
            {result.error && <Banner tone="bad">{result.error.message}</Banner>}
            <ol className="space-y-3">
              {stepsFor(result.stopAt).map((name) => {
                const step = result.steps.find((item) => item.name === name);
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
                          onClick={() => void copy(name, step.response)}
                        >
                          {copied === name ? "Copied" : "Copy response"}
                        </button>
                      )}
                      {step?.rsa && (
                        <button
                          type="button"
                          className="shrink-0 text-xs text-slate-400 hover:text-white"
                          onClick={() => void copy("rsa-all", step.rsa)}
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
                          value={step.rsa.decrypted}
                          copied={copied === "rsa-decrypted"}
                          onCopy={() => void copy("rsa-decrypted", step.rsa?.decrypted)}
                        />
                        <RsaField
                          label="2. Append PIN (plain|pin)"
                          value={step.rsa.combined}
                          copied={copied === "rsa-combined"}
                          onCopy={() => void copy("rsa-combined", step.rsa?.combined)}
                        />
                        <RsaField
                          label="3. Final token (encrypt)"
                          value={step.rsa.finalToken}
                          copied={copied === "rsa-final"}
                          onCopy={() => void copy("rsa-final", step.rsa?.finalToken)}
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
    </div>
  );
}

function RsaField({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-lg bg-black/40 p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <button type="button" className="shrink-0 text-[11px] text-slate-400 hover:text-white" onClick={onCopy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-h-32 overflow-auto text-[11px] leading-5 text-amber-100/90">{value}</pre>
    </div>
  );
}

function ServiceButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-11 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition sm:min-h-0 ${
        active
          ? "border-teal-300/40 bg-teal-400/15 text-white"
          : "border-white/10 bg-slate-950 text-slate-300 hover:border-white/20"
      }`}
    >
      {children}
    </button>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-11 rounded-lg border px-3 py-2.5 text-left text-xs font-medium transition sm:min-h-0 sm:py-2 ${
        active
          ? "border-teal-300/50 bg-teal-400/15 text-white"
          : "border-white/10 bg-slate-950 text-slate-300 hover:border-white/25"
      }`}
    >
      {children}
    </button>
  );
}

function Banner({ tone, children }: { tone: "warn" | "bad"; children: ReactNode }) {
  const cls =
    tone === "warn"
      ? "border-amber-400/20 bg-amber-400/10 text-amber-100"
      : "border-rose-400/20 bg-rose-400/10 text-rose-100";
  return <div className={`mb-4 overflow-hidden break-words rounded-xl border px-3 py-2.5 text-sm leading-6 ${cls}`}>{children}</div>;
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
