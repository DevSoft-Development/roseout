"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { OnboardingLocation } from "@/lib/locations/onboarding";

export default function BusinessLocationLookup({
  selected,
  onSelect,
  onAddNew,
}: {
  selected: OnboardingLocation | null;
  onSelect: (location: OnboardingLocation) => void;
  onAddNew: () => void;
}) {
  const inputId = useId();
  const requestRef = useRef<AbortController | null>(null);
  const [query, setQuery] = useState(selected?.name || "");
  const [locations, setLocations] = useState<OnboardingLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (selected) return;
    const term = query.trim();
    if (term.length < 3) return;

    const timer = window.setTimeout(async () => {
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      setLoading(true);
      setMessage("");
      try {
        const response = await fetch(
          `/api/business/onboarding/location-search?q=${encodeURIComponent(term)}`,
          { signal: controller.signal },
        );
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Search failed");
        const nextLocations = payload.locations || [];
        setLocations(nextLocations);
        setMessage(
          nextLocations.length
            ? `${nextLocations.length} matching location${nextLocations.length === 1 ? "" : "s"} found.`
            : "No matching locations found. You can add a new one below.",
        );
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setLocations([]);
          setMessage("Search is temporarily unavailable. You can still add a new location.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [query, selected]);

  if (selected) {
    return (
      <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200">
          Existing listing selected
        </p>
        <p className="mt-2 text-lg font-black">{selected.name}</p>
        <p className="mt-1 text-sm font-semibold text-white/55">
          {[selected.address, selected.city, selected.state, selected.zipCode]
            .filter(Boolean)
            .join(", ")}
        </p>
        <button
          type="button"
          onClick={() => {
            setQuery("");
            onAddNew();
          }}
          className="mt-3 text-sm font-black text-emerald-200 underline underline-offset-4"
        >
          Choose a different location
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4 sm:p-5">
      <label htmlFor={inputId} className="block text-xs font-black uppercase tracking-[0.2em] text-white/50">
        Find your business first
      </label>
      <p className="mt-2 text-sm leading-6 text-white/55">
        Search by business name, street address, city, or ZIP code to avoid creating a duplicate listing.
      </p>
      <input
        id={inputId}
        type="search"
        value={query}
        onChange={(event) => {
          const value = event.target.value;
          setQuery(value);
          if (value.trim().length < 3) {
            requestRef.current?.abort();
            setLocations([]);
            setMessage("");
            setLoading(false);
          }
        }}
        placeholder="Start typing your business name"
        autoComplete="off"
        role="combobox"
        aria-expanded={locations.length > 0}
        aria-controls={`${inputId}-results`}
        aria-autocomplete="list"
        className="mt-4 w-full rounded-2xl border border-white/10 bg-[#0d0d0d] px-4 py-4 text-sm font-bold text-white outline-none placeholder:text-white/25 focus:border-[#e1062a]"
      />
      <p aria-live="polite" className="mt-2 min-h-5 text-xs font-bold text-white/45">
        {loading ? "Searching locations…" : message}
      </p>

      {locations.length > 0 ? (
        <ul id={`${inputId}-results`} role="listbox" className="mt-2 overflow-hidden rounded-2xl border border-white/10">
          {locations.map((location) => (
            <li key={location.id} role="option" aria-selected={false}>
              <button
                type="button"
                disabled={location.alreadyClaimed}
                onClick={() => onSelect(location)}
                className="flex w-full items-start justify-between gap-4 border-b border-white/10 bg-[#0d0d0d] px-4 py-4 text-left transition last:border-b-0 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-55"
              >
                <span>
                  <span className="block text-sm font-black text-white">{location.name}</span>
                  <span className="mt-1 block text-xs font-semibold text-white/45">
                    {[location.address, location.city, location.state, location.zipCode]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-wide text-white/65">
                  {location.alreadyClaimed ? "Already claimed" : "Select"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 border-t border-white/10 pt-4">
        <p className="text-sm font-bold text-white/65">Don’t see your business?</p>
        <button
          type="button"
          onClick={onAddNew}
          className="mt-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-black text-white transition hover:bg-white hover:text-black"
        >
          Add a new location
        </button>
      </div>
    </div>
  );
}
