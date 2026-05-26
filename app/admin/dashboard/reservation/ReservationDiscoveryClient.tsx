"use client";

import { useState } from "react";

type BackfillResult = {
  success?: boolean;
  checked?: number;
  updated?: number;
  foundFromGoogle?: number;
  foundFromProviderSearch?: number;
  foundFromWebsite?: number;
  blocked?: number;
  failed?: number;
  notFound?: number;
  dryRun?: boolean;
  failures?: Array<{ id?: string | number | null; name?: string | null; error?: string; status?: string | number }>;
  error?: string;
  details?: string;
};

export default function ReservationDiscoveryClient() {
  const [table, setTable] = useState("locations");
  const [limit, setLimit] = useState("25");
  const [status, setStatus] = useState("pending");
  const [dryRun, setDryRun] = useState(true);
  const [includeProviderSearch, setIncludeProviderSearch] = useState(true);
  const [includeWebsiteDiscovery, setIncludeWebsiteDiscovery] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BackfillResult | null>(null);

  async function runDiscovery() {
    setLoading(true);
    setResult(null);

    const params = new URLSearchParams({
      table,
      limit,
      dryRun: String(dryRun),
      onlyMissing: "true",
      includeProviderSearch: String(includeProviderSearch),
      includeWebsiteDiscovery: String(includeWebsiteDiscovery),
    });
    if (status !== "all") params.set("status", status);

    try {
      const response = await fetch(`/api/admin/backfill-reservation-links?${params.toString()}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as BackfillResult;
      setResult(data);
    } catch (error) {
      setResult({ success: false, error: error instanceof Error ? error.message : "Request failed" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#090706] px-5 py-24 text-white sm:px-8">
      <div className="mx-auto max-w-5xl">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-200/70">
          Admin Tool
        </p>
        <h1 className="mt-3 text-4xl font-black tracking-tight">Reservation link discovery</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/60">
          Run small, safe batches that check existing fields, internal reservation flags, Google Places,
          optional provider search, and opt-in lightweight website discovery.
        </p>

        <section className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.05] p-6 shadow-2xl">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Table</span>
              <select value={table} onChange={(event) => setTable(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-bold text-white">
                <option value="locations">Locations</option>
                <option value="restaurants">Restaurants</option>
                <option value="activities">Activities</option>
                <option value="all">All</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Limit</span>
              <input value={limit} onChange={(event) => setLimit(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-bold text-white" />
            </label>
            <label className="block">
              <span className="text-xs font-black uppercase tracking-[0.2em] text-white/45">Status filter</span>
              <select value={status} onChange={(event) => setStatus(event.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm font-bold text-white">
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
                <option value="blocked">Blocked</option>
                <option value="not_found">Not found</option>
                <option value="all">All statuses</option>
              </select>
            </label>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Toggle label="Dry run" checked={dryRun} onChange={setDryRun} helper="Default and safest mode." />
            <Toggle label="Provider search" checked={includeProviderSearch} onChange={setIncludeProviderSearch} helper="Uses configured safe search API only." />
            <Toggle label="Website discovery" checked={includeWebsiteDiscovery} onChange={setIncludeWebsiteDiscovery} helper="Disabled by default." />
          </div>

          <div className="mt-5 rounded-[1.25rem] border border-rose-300/20 bg-rose-300/10 p-4 text-sm font-bold text-rose-100">
            Website discovery makes requests to public business websites. Use small batches.
          </div>

          <button type="button" onClick={runDiscovery} disabled={loading} className="mt-6 rounded-full bg-white px-6 py-3 text-sm font-black text-black transition hover:bg-rose-100 disabled:opacity-60">
            {loading ? "Running discovery..." : dryRun ? "Run dry run" : "Run update"}
          </button>
        </section>

        {result && (
          <section className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.05] p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-2xl font-black">Result summary</h2>
              <span className="rounded-full border border-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-white/60">
                {result.dryRun ? "Dry run" : "Real run"}
              </span>
            </div>

            {result.success === false ? (
              <p className="mt-4 rounded-2xl border border-red-400/30 bg-red-400/10 p-4 text-sm font-bold text-red-100">
                {result.error}: {result.details}
              </p>
            ) : (
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Checked" value={result.checked} />
                <Metric label="Updated" value={result.updated} />
                <Metric label="Found from Google" value={result.foundFromGoogle} />
                <Metric label="Found from provider search" value={result.foundFromProviderSearch} />
                <Metric label="Found from website" value={result.foundFromWebsite} />
                <Metric label="Blocked" value={result.blocked} />
                <Metric label="Failed" value={result.failed} />
                <Metric label="Not found" value={result.notFound} />
              </div>
            )}

            {Boolean(result.failures?.length) && (
              <div className="mt-6">
                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white/45">First 10 failures</h3>
                <div className="mt-3 space-y-2">
                  {result.failures?.slice(0, 10).map((failure, index) => (
                    <div key={`${failure.id || "failure"}-${index}`} className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/70">
                      <strong className="text-white">{failure.name || failure.id || "Unknown location"}</strong> — {failure.error || failure.status || "Failed"}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function Toggle({ label, checked, onChange, helper }: { label: string; checked: boolean; onChange: (checked: boolean) => void; helper: string }) {
  return (
    <label className="rounded-[1.25rem] border border-white/10 bg-black/25 p-4">
      <span className="flex items-center justify-between gap-4">
        <span className="font-black">{label}</span>
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-5 w-5 accent-rose-500" />
      </span>
      <span className="mt-2 block text-xs font-bold text-white/45">{helper}</span>
    </label>
  );
}

function Metric({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-[1.25rem] border border-white/10 bg-black/25 p-4">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-white/40">{label}</p>
      <p className="mt-2 text-3xl font-black">{Number(value || 0).toLocaleString()}</p>
    </div>
  );
}
