"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const BASE_PATH = "/admin/dashboard/locations";

export default function AdminLocationsSearchBox({
  initialQuery,
  type,
  status,
  claim,
  pageSize,
}: {
  initialQuery: string;
  type: string;
  status: string;
  claim: string;
  pageSize: number;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (type !== "all") params.set("type", type);
      if (status !== "all") params.set("status", status);
      if (claim !== "all") params.set("claim", claim);
      params.set("page", "1");
      params.set("pageSize", String(pageSize));
      startTransition(() => router.replace(`${BASE_PATH}?${params.toString()}`, { scroll: false }));
    }, 350);

    return () => window.clearTimeout(timer);
  }, [claim, pageSize, query, router, status, type]);

  return (
    <div className="relative">
      <input
        name="q"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Live search all locations by name, address, city, phone, category, tag, claim code, Google ID..."
        className="h-11 w-full rounded-full border border-white/10 bg-white/[0.07] px-5 pr-24 text-sm font-semibold text-white outline-none placeholder:text-white/35 focus:border-rose-300"
      />
      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase tracking-wide text-white/35">
        {isPending ? "Searching…" : "Live"}
      </span>
    </div>
  );
}
