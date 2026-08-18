"use client";

import dynamic from "next/dynamic";

export const RunConsoleClient = dynamic(
  () => import("@/components/RunConsole").then((mod) => mod.RunConsole),
  {
    ssr: false,
    loading: () => (
      <div className="mx-auto w-full max-w-6xl rounded-2xl border border-white/10 bg-slate-900/40 px-4 py-16 text-center text-sm text-slate-500">
        Loading console…
      </div>
    ),
  },
);
