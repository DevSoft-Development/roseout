"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const BASE_PATH = "/admin/dashboard/data-quality";

export default function DataQualitySearchBox({
  initialQuery,
  activeFilter,
}: {
  initialQuery: string;
  activeFilter: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (activeFilter && activeFilter !== "all") params.set("filter", activeFilter);
      if (query.trim()) params.set("q", query.trim());
      const url = params.toString() ? `${BASE_PATH}?${params.toString()}` : BASE_PATH;
      startTransition(() => router.replace(url, { scroll: false }));
    }, 350);

    return () => window.clearTimeout(timer);
  }, [activeFilter, query, router]);

  return (
    <div className="grid max-w-full gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="relative">
        <input
          name="q"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Live search name, address, city, cuisine, phone, claim code, Google ID, status..."
          className="h-10 w-full min-w-0 rounded-full border border-white/10 bg-white/[0.07] px-4 pr-24 text-sm font-semibold text-white outline-none placeholder:text-white/35 focus:border-rose-300"
        />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase tracking-wide text-white/35">
          {isPending ? "Searching…" : "Live"}
        </span>
      </div>
      {query && (
        <button
          type="button"
          onClick={() => setQuery("")}
          className="h-10 rounded-full border border-white/10 bg-white/[0.06] px-4 text-xs font-black uppercase tracking-wide text-white/65 transition hover:bg-white hover:text-black"
        >
          Clear
        </button>
      )}
    </div>
  );
}
