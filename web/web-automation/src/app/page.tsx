import { RunConsoleClient } from "@/components/RunConsoleClient";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col px-3 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-8 lg:px-8">
      <RunConsoleClient />
    </div>
  );
}
