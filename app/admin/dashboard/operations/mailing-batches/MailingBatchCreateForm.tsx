"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Search, X } from "lucide-react";

type LocationOption = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  claimCode: string;
};

export default function MailingBatchCreateForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [searchMessage, setSearchMessage] = useState("");
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [zip, setZip] = useState("");
  const [results, setResults] = useState<LocationOption[]>([]);
  const [selected, setSelected] = useState<Map<string, LocationOption>>(new Map());

  const selectedCount = selected.size;
  const allVisibleSelected = results.length > 0 && results.every((location) => selected.has(location.id));
  const selectedLocations = useMemo(() => Array.from(selected.values()), [selected]);

  async function searchLocations() {
    setSearchBusy(true);
    setSearchMessage("");
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (query.trim()) params.set("q", query.trim());
      if (city.trim()) params.set("city", city.trim());
      if (stateFilter.trim()) params.set("state", stateFilter.trim());
      if (zip.trim()) params.set("zip", zip.trim());
      const response = await fetch(`/api/admin/mailing-batches?${params.toString()}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Could not search locations.");
      const next = Array.isArray(data.locations) ? data.locations : [];
      setResults(next);
      if (!next.length) setSearchMessage("No eligible locations matched this search.");
    } catch (error) {
      setResults([]);
      setSearchMessage(error instanceof Error ? error.message : "Could not search locations.");
    } finally {
      setSearchBusy(false);
    }
  }

  useEffect(() => {
    void searchLocations();
    // Initial eligible-location load only. Searches after this are explicit so the list does not jump while typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleLocation(location: LocationOption) {
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(location.id)) next.delete(location.id);
      else next.set(location.id, location);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((current) => {
      const next = new Map(current);
      if (allVisibleSelected) {
        results.forEach((location) => next.delete(location.id));
      } else {
        results.forEach((location) => next.set(location.id, location));
      }
      return next;
    });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    const form = new FormData(event.currentTarget);
    const payload = {
      ...Object.fromEntries(form.entries()),
      q: query,
      city,
      state: stateFilter,
      zip,
      selectedLocationIds: selectedLocations.map((location) => location.id),
    };

    try {
      const response = await fetch("/api/admin/mailing-batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Could not create mailing batch.");
      router.push(`/admin/dashboard/operations/mailing-batches/${data.batchId}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create mailing batch.");
    } finally {
      setBusy(false);
    }
  }

  const inputClass = "h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-sm font-semibold text-white outline-none placeholder:text-white/30 focus:border-rose-300";

  return (
    <form onSubmit={submit} className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04]">
      <div className="border-b border-white/10 p-5 md:p-6">
        <div className="flex flex-col gap-1">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-rose-300">New campaign</p>
          <h2 className="text-2xl font-black">Create a mailing batch</h2>
          <p className="max-w-3xl text-sm leading-6 text-white/50">
            Search for locations, select one business or many at once, then create one tracked postcard batch.
          </p>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <label className="grid gap-1.5 text-xs font-bold text-white/55">
            Batch name
            <input className={inputClass} name="name" placeholder="Example: Queens claim outreach" />
          </label>
          <label className="grid gap-1.5 text-xs font-bold text-white/55">
            Planned mail date
            <input className={inputClass} name="plannedMailDate" type="date" />
          </label>
          <label className="grid gap-1.5 text-xs font-bold text-white/55">
            Internal note
            <input className={inputClass} name="notes" placeholder="Optional note" />
          </label>
        </div>
      </div>

      <div className="p-5 md:p-6">
        <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="text-lg font-black">Choose locations</h3>
            <p className="mt-1 text-sm text-white/45">Only unclaimed locations with a complete mailing address and permanent claim code are shown.</p>
          </div>
          <div className="mt-3 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-xs font-black text-white/70 md:mt-0">
            {selectedCount.toLocaleString()} selected
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="grid gap-2 lg:grid-cols-[minmax(280px,1fr)_180px_100px_130px_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
              <input
                className={`${inputClass} w-full pl-9`}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void searchLocations();
                  }
                }}
                placeholder="Search business name or address"
                aria-label="Search locations"
              />
            </div>
            <input className={inputClass} value={city} onChange={(event) => setCity(event.target.value)} placeholder="City" aria-label="City filter" />
            <input className={inputClass} value={stateFilter} onChange={(event) => setStateFilter(event.target.value.toUpperCase().slice(0, 2))} placeholder="State" aria-label="State filter" maxLength={2} />
            <input className={inputClass} value={zip} onChange={(event) => setZip(event.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="ZIP" aria-label="ZIP filter" inputMode="numeric" />
            <button type="button" onClick={() => void searchLocations()} disabled={searchBusy} className="h-11 rounded-xl bg-white px-5 text-sm font-black text-black disabled:opacity-50">
              {searchBusy ? "Searching…" : "Search"}
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={toggleAllVisible} disabled={!results.length} className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-black text-white/75 hover:bg-white/10 disabled:opacity-40">
            {allVisibleSelected ? "Unselect all results" : `Select all ${results.length || ""} results`}
          </button>
          <button type="button" onClick={() => setSelected(new Map())} disabled={!selectedCount} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-white/55 hover:text-white disabled:opacity-40">
            Clear selection
          </button>
          <span className="text-xs text-white/35">Bulk select applies to the current search results. Individual rows can be selected or removed at any time.</span>
        </div>

        <div className="mt-3 overflow-hidden rounded-2xl border border-white/10">
          <div className="max-h-[430px] overflow-auto">
            {results.length ? (
              <div className="divide-y divide-white/10">
                {results.map((location) => {
                  const checked = selected.has(location.id);
                  return (
                    <button
                      key={location.id}
                      type="button"
                      onClick={() => toggleLocation(location)}
                      className={`grid w-full grid-cols-[34px_1fr] gap-2 px-4 py-3 text-left transition hover:bg-white/[0.05] md:grid-cols-[34px_minmax(220px,1.2fr)_minmax(280px,1fr)_130px] ${checked ? "bg-rose-500/[0.08]" : "bg-black/10"}`}
                    >
                      <span className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-md border ${checked ? "border-rose-300 bg-rose-300 text-black" : "border-white/25 bg-black/20 text-transparent"}`}>
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      <span>
                        <span className="block font-black text-white">{location.name}</span>
                        <span className="mt-0.5 block text-xs text-white/35 md:hidden">{location.address}, {location.city}, {location.state} {location.zipCode}</span>
                      </span>
                      <span className="hidden text-sm text-white/55 md:block">{location.address}<br /><span className="text-xs text-white/35">{location.city}, {location.state} {location.zipCode}</span></span>
                      <span className="hidden text-right md:block"><span className="text-[10px] font-black uppercase tracking-[0.14em] text-white/30">Claim code</span><span className="mt-1 block font-mono text-xs font-bold text-white/65">{location.claimCode}</span></span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-white/40">{searchBusy ? "Searching eligible locations…" : searchMessage || "Search for a location to begin."}</div>
            )}
          </div>
        </div>

        {selectedCount ? (
          <div className="mt-4 rounded-2xl border border-rose-300/15 bg-rose-500/[0.06] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black">Selected locations</p>
                <p className="mt-0.5 text-xs text-white/40">These exact businesses will be placed in the new batch.</p>
              </div>
              <span className="text-sm font-black text-rose-200">{selectedCount}</span>
            </div>
            <div className="mt-3 flex max-h-28 flex-wrap gap-2 overflow-auto">
              {selectedLocations.map((location) => (
                <button key={location.id} type="button" onClick={() => toggleLocation(location)} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/25 px-2.5 py-1.5 text-xs font-bold text-white/65 hover:text-white">
                  {location.name}<X className="h-3 w-3" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/[0.05] p-4">
            <p className="text-sm font-black text-amber-100">No locations selected yet</p>
            <p className="mt-1 text-xs leading-5 text-white/45">Select one location for a single-card batch, select multiple businesses, or use the automatic bulk option below.</p>
          </div>
        )}

        <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-white/10 bg-black/20 p-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-black">Automatic bulk option</p>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-white/40">If you leave the selection empty, TheOutHaven can automatically fill the batch with the first eligible locations matching your current search and filters.</p>
            <label className="mt-3 inline-grid gap-1 text-xs font-bold text-white/50">
              Automatic batch size
              <select className={`${inputClass} min-w-44`} name="quantity" defaultValue="250">
                <option className="text-black" value="100">100 locations</option>
                <option className="text-black" value="250">250 locations</option>
                <option className="text-black" value="500">500 locations</option>
              </select>
            </label>
          </div>
          <button disabled={busy} className="h-12 rounded-xl bg-rose-500 px-6 text-sm font-black text-white shadow-lg shadow-rose-950/20 hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? "Creating batch…" : selectedCount ? `Create batch with ${selectedCount} selected` : "Create automatic batch"}
          </button>
        </div>

        <p className="mt-3 text-xs text-white/30">Locations already active in another mailing batch are excluded automatically.</p>
        {searchMessage && results.length ? <p className="mt-3 text-xs font-bold text-amber-200">{searchMessage}</p> : null}
        {message ? <p className="mt-4 rounded-xl border border-rose-400/25 bg-rose-500/10 p-3 text-sm font-bold text-rose-100">{message}</p> : null}
      </div>
    </form>
  );
}
