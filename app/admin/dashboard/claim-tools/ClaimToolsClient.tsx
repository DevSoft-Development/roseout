"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

type ClaimToolResult = {
  id: string;
  location_id: string | null;
  name: string;
  type: string;
  address: string | null;
  city: string | null;
  state: string | null;
  source_table: "locations" | "restaurants" | "activities";
  source_id: string;
  claim_status: string | null;
  is_claimed: boolean;
  claim_code: string | null;
  claim_url: string | null;
  qr_code_data_url: string | null;
};

function getAddress(result: ClaimToolResult) {
  return [result.address, [result.city, result.state].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join(" • ");
}

export default function ClaimToolsClient() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClaimToolResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Search by name, address, phone, Google Place ID, or claim code.");
  const [copied, setCopied] = useState("");
  const [busyKey, setBusyKey] = useState("");

  async function runSearch(nextQuery = query) {
    const cleanQuery = nextQuery.trim();
    if (cleanQuery.length < 2) {
      setResults([]);
      setMessage("Type at least 2 characters to search claim tools.");
      return;
    }

    setLoading(true);
    setMessage("Searching claim records...");

    try {
      const res = await fetch(`/api/admin/claim-tools?q=${encodeURIComponent(cleanQuery)}`);
      const data = await res.json();

      if (!res.ok) {
        setResults([]);
        setMessage(data.error || "Could not search claim tools.");
        return;
      }

      setResults(data.results || []);
      setMessage(data.results?.length ? `${data.results.length} claim records found.` : "No matching claim records found.");
    } catch {
      setResults([]);
      setMessage("Could not search claim tools.");
    } finally {
      setLoading(false);
    }
  }

  async function copyText(label: string, value: string | null) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1600);
  }

  async function regenerate(result: ClaimToolResult, field: "claim_code" | "qr" | "all") {
    const key = `${result.id}-${field}`;
    setBusyKey(key);

    try {
      const res = await fetch("/api/admin/claim-tools/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_table: result.source_table,
          source_id: result.source_table === "locations" ? result.location_id || result.source_id : result.source_id,
          field,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Could not regenerate claim fields.");
        return;
      }

      await runSearch();
    } finally {
      setBusyKey("");
    }
  }

  async function syncAll() {
    setBusyKey("sync");
    try {
      const res = await fetch("/api/admin/claim-tools/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync" }),
      });
      const data = await res.json();
      if (!res.ok) alert(data.error || "Could not sync claim fields.");
      else setMessage(`Synced claim fields for ${data.updated || 0} records.`);
      if (query.trim().length >= 2) await runSearch();
    } finally {
      setBusyKey("");
    }
  }

  useEffect(() => {
    const cleanQuery = query.trim();
    if (cleanQuery.length < 2) {
      setResults([]);
      setMessage("Type at least 2 characters to search claim tools.");
      return;
    }

    const timer = window.setTimeout(() => {
      runSearch(cleanQuery);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [query]);

  const selectedPrint = useMemo(() => results.filter((result) => result.claim_code || result.qr_code_data_url), [results]);

  return (
    <>
      <section className="no-print mt-6 rounded-[2rem] border border-white/10 bg-white/[0.06] p-5 shadow-2xl">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            runSearch();
          }}
          className="grid gap-3 lg:grid-cols-[1fr_auto_auto]"
        >
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search restaurants, activities, locations, address, phone, Google Place ID, claim code..."
            className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-white/30 focus:border-rose-400"
          />
          <button disabled={loading} className="rounded-2xl bg-rose-600 px-6 py-3 text-sm font-black text-white disabled:opacity-50">
            {loading ? "Searching..." : "Search"}
          </button>
          <button type="button" onClick={syncAll} disabled={busyKey === "sync"} className="rounded-2xl border border-white/10 px-6 py-3 text-sm font-black text-white/75 hover:bg-white/10 disabled:opacity-50">
            {busyKey === "sync" ? "Syncing..." : "Sync Claim Fields"}
          </button>
        </form>
        <p className="mt-3 text-xs font-bold uppercase tracking-[0.18em] text-white/45">{message}</p>
      </section>

      <section className="no-print mt-6 grid gap-4 lg:grid-cols-2">
        {results.map((result) => {
          const profileHref = result.location_id
            ? `/locations/${result.type}/${result.location_id}`
            : result.source_table === "restaurants"
              ? `/restaurants/id/${result.source_id}`
              : `/activities/${result.source_id}`;
          const editHref = result.source_table === "restaurants"
            ? `/admin/dashboard/locations/edit/restaurants/${result.source_id}`
            : result.source_table === "activities"
              ? `/admin/dashboard/locations/edit/activities/${result.source_id}`
              : `/admin/dashboard/locations`;

          return (
            <article key={result.id} className="rounded-[1.75rem] border border-white/10 bg-[#0d0d0d] p-5 shadow-xl">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white">
                  {result.qr_code_data_url ? (
                    <Image unoptimized src={result.qr_code_data_url} alt={`QR code for ${result.name}`} width={128} height={128} className="h-28 w-28 object-contain" />
                  ) : (
                    <span className="text-xs font-black text-black/35">No QR</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-rose-500/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-rose-100">{result.type}</span>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white/55">{result.source_table}</span>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white/55">{result.is_claimed ? "Claimed" : result.claim_status || "Unclaimed"}</span>
                  </div>
                  <h2 className="mt-3 text-2xl font-black text-white">{result.name}</h2>
                  <p className="mt-2 text-sm font-bold text-white/45">{getAddress(result) || "Address unavailable"}</p>
                  <p className="mt-3 text-xs font-bold text-white/35">Source ID: {String(result.source_id)}</p>
                  <div className="mt-4 rounded-2xl border border-white/10 bg-black/35 p-4">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">Claim Code</p>
                    <p className="mt-2 font-mono text-2xl font-black tracking-[0.16em] text-white">{result.claim_code || "Missing"}</p>
                    {result.claim_url && <p className="mt-2 break-all text-xs font-bold text-white/35">{result.claim_url}</p>}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button onClick={() => copyText(`code-${result.id}`, result.claim_code)} className="rounded-full bg-white px-4 py-2 text-xs font-black text-black">{copied === `code-${result.id}` ? "Copied Code" : "Copy Code"}</button>
                <button onClick={() => copyText(`link-${result.id}`, result.claim_url)} className="rounded-full bg-white/10 px-4 py-2 text-xs font-black text-white">{copied === `link-${result.id}` ? "Copied Link" : "Copy Link"}</button>
                <button onClick={() => window.print()} className="rounded-full bg-rose-600 px-4 py-2 text-xs font-black text-white">Print Sheet</button>
                <button onClick={() => regenerate(result, "claim_code")} disabled={busyKey === `${result.id}-claim_code`} className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white/70 disabled:opacity-50">Regenerate Code</button>
                <button onClick={() => regenerate(result, "qr")} disabled={busyKey === `${result.id}-qr`} className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white/70 disabled:opacity-50">Regenerate QR</button>
                <a href={profileHref} className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white/70">Open Profile</a>
                <a href={editHref} className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white/70">Admin Edit</a>
              </div>
            </article>
          );
        })}
      </section>

      <section className="print-sheet mt-6 hidden print:grid print:grid-cols-2 print:gap-4">
        {selectedPrint.map((result) => (
          <div key={`print-${result.id}`} className="break-inside-avoid rounded-3xl border border-black p-5 text-black">
            <div className="grid grid-cols-[140px_1fr] gap-4">
              <div className="flex flex-col items-center justify-center">
                {result.qr_code_data_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={result.qr_code_data_url} alt="" className="h-32 w-32" />
                )}
                <p className="mt-2 text-center text-[10px] font-black uppercase tracking-[0.14em]">Scan QR code to claim</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-rose-700">TheOutHaven Claim</p>
                <h2 className="mt-2 text-2xl font-black">{result.name}</h2>
                <p className="mt-2 text-sm font-bold text-black/60">{getAddress(result)}</p>
                <p className="mt-4 text-[10px] font-black uppercase tracking-[0.18em] text-black/45">Or enter claim code manually</p>
                <p className="font-mono text-2xl font-black tracking-[0.18em]">{result.claim_code}</p>
              </div>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
