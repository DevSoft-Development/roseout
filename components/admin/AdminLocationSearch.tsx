"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import AdminLocationQuickActions from "@/components/admin/AdminLocationQuickActions";

type Result = {
  id: string;
  name: string;
  location_type?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  phone?: string | null;
  email?: string | null;
  plan?: string | null;
  reservationAccess?: "free" | "pro" | string | null;
};

type AdminLocationSearchProps = {
  compact?: boolean;
  className?: string;
  autoFocus?: boolean;
  onSelect?: () => void;
};

export default function AdminLocationSearch({
  compact = false,
  className = "",
  autoFocus = false,
  onSelect,
}: AdminLocationSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/admin/locations/search?q=${encodeURIComponent(q)}&limit=10`,
        );
        const data = await res.json();
        setResults(data.results || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <div
        className={
          compact
            ? "flex h-10 items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3"
            : "flex items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-3 py-2"
        }
      >
        <Search className="h-4 w-4 text-rose-100/70" />
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          placeholder="Search locations by name, email, phone, address…"
          className={
            compact
              ? "w-full min-w-0 bg-transparent text-xs text-white outline-none placeholder:text-white/35"
              : "w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
          }
        />
      </div>
      {open && (
        <div
          onClick={(event) => {
            const target = event.target as HTMLElement;
            if (target.closest("a[href]")) {
              onSelect?.();
            }
          }}
          className="absolute left-0 right-0 z-[180] mt-2 max-h-[34rem] overflow-y-auto rounded-3xl border border-white/10 bg-[#120d0b]/98 p-3 text-white shadow-[0_24px_80px_rgba(0,0,0,0.65)] backdrop-blur-2xl"
        >
          {query.trim().length < 2 && (
            <p className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-white/55">
              Type at least 2 characters to search locations.
            </p>
          )}
          {loading && (
            <p className="px-2 py-3 text-sm text-white/55">
              Searching locations…
            </p>
          )}
          {!loading && query.trim().length >= 2 && results.length === 0 && (
            <p className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-white/55">
              No locations matched your search.
            </p>
          )}
          {results.map((item) => (
            <article
              key={item.id}
              className="mt-2 rounded-2xl border border-white/10 bg-white/[0.04] p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black">{item.name}</p>
                  <p className="truncate text-xs text-white/55">
                    {[item.address, item.city, item.state, item.zip_code]
                      .filter(Boolean)
                      .join(", ") || "No address on file"}
                  </p>
                  <p className="truncate text-[11px] text-white/45">
                    {[item.phone, item.email].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1">
                  <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-black uppercase text-white/55">
                    {item.location_type || "Unknown"}
                  </span>
                  <span className="rounded-full border border-rose-200/20 bg-rose-500/10 px-2 py-1 text-[10px] font-black uppercase text-rose-50">
                    Plan: {item.plan || "Unknown"}
                  </span>
                  <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] font-black uppercase text-white/55">
                    Reservations:{" "}
                    {item.reservationAccess === "pro" ? "Pro" : "Not enabled"}
                  </span>
                </div>
              </div>
              <AdminLocationQuickActions
                locationId={item.id}
                className="mt-3"
                compact
              />
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
