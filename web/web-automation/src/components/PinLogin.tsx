"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function PinLogin() {
  const router = useRouter();
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  const pin = digits.join("");

  async function submit(value: string) {
    if (value.length !== 6 || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: value }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error || "Invalid PIN");
        setDigits(["", "", "", "", "", ""]);
        refs.current[0]?.focus();
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  function setDigit(index: number, raw: string) {
    const ch = raw.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = ch;
    setDigits(next);
    if (ch && index < 5) {
      refs.current[index + 1]?.focus();
    }
    const joined = next.join("");
    if (joined.length === 6 && next.every(Boolean)) {
      void submit(joined);
    }
  }

  function onKeyDown(index: number, key: string) {
    if (key === "Backspace" && !digits[index] && index > 0) {
      const next = [...digits];
      next[index - 1] = "";
      setDigits(next);
      refs.current[index - 1]?.focus();
    }
    if (key === "Enter") {
      void submit(pin);
    }
  }

  function onPaste(text: string) {
    const nums = text.replace(/\D/g, "").slice(0, 6).split("");
    if (!nums.length) {
      return;
    }
    const next = ["", "", "", "", "", ""];
    nums.forEach((n, i) => {
      next[i] = n;
    });
    setDigits(next);
    const last = Math.min(nums.length, 6) - 1;
    refs.current[last]?.focus();
    if (nums.length === 6) {
      void submit(nums.join(""));
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 shadow-xl shadow-black/20 backdrop-blur sm:p-8">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-teal-300/80">
          Test console
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-white">Enter passcode</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          6-digit PIN required to open this tool.
        </p>

        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(pin);
          }}
        >
          <div className="grid grid-cols-6 gap-1.5 sm:gap-2.5">
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(el) => {
                  refs.current[index] = el;
                }}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={1}
                aria-label={`Digit ${index + 1}`}
                value={digit}
                disabled={busy}
                onChange={(e) => setDigit(index, e.target.value)}
                onKeyDown={(e) => onKeyDown(index, e.key)}
                onPaste={(e) => {
                  e.preventDefault();
                  onPaste(e.clipboardData.getData("text"));
                }}
                className="pin-digit aspect-square w-full min-w-0 appearance-none rounded-lg border border-white/10 bg-slate-950 p-0 text-center text-lg leading-none text-white outline-none ring-teal-400/40 focus:ring-2 disabled:opacity-60 sm:rounded-xl sm:text-xl"
              />
            ))}
          </div>

          {error && (
            <p className="mt-4 text-sm text-rose-300" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || pin.length !== 6}
            className="mt-6 w-full min-h-12 rounded-xl bg-teal-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-teal-300 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            {busy ? "Checking…" : "Unlock"}
          </button>
        </form>
      </div>
    </div>
  );
}
