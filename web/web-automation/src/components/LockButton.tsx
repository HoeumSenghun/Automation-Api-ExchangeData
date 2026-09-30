"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LockButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function lock() {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void lock()}
      disabled={busy}
      className="shrink-0 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-slate-400 transition hover:border-white/25 hover:text-white disabled:opacity-60"
    >
      {busy ? "Locking…" : "Lock"}
    </button>
  );
}
