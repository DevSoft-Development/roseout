"use client";

import { useEffect, useMemo, useState } from "react";

type Row = {
  id: string;
  display_name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  location_type: string | null;
  is_hidden: boolean | null;
  is_low_level: boolean | null;
  is_searchable: boolean | null;
  public_visibility_tier: string | null;
  low_level_reason: string | null;
  can_make_searchable: boolean;
  repair_reasons: string[];
};

type RepairAction = "unhide" | "make_searchable";

export function HiddenLocationsRepairClient() {
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [state, setState] = useState("");
  const [type, setType] = useState("");
  const [reason, setReason] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const selectedRows = useMemo(() => rows.filter((row) => selected.includes(row.id)), [rows, selected]);
  const selectedEligible = selectedRows.filter((row) => row.can_make_searchable).length;
  const selectedBlocked = selectedRows.length - selectedEligible;

  async function load(nextPage = page, preserveMessage = false) {
    setBusy(true);
    if (!preserveMessage) setMessage("");
    try {
      const params = new URLSearchParams({ page: String(nextPage), pageSize: "50", reason });
      if (query.trim()) params.set("query", query.trim());
      if (state) params.set("state", state);
      if (type) params.set("type", type);
      const response = await fetch(`/api/admin/locations/hidden-repair?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || payload.success === false) throw new Error(payload.error || "Could not load locations.");
      setRows(payload.rows || []);
      setTotal(payload.total || 0);
      setPage(nextPage);
      setSelected([]);
    } catch (error: any) {
      setMessage(error?.message || "Could not load locations.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void load(1); }, []);

  async function repair(action: RepairAction, locationIds = selected, dryRun = false) {
    if (!locationIds.length) {
      setMessage("Select at least one location.");
      return;
    }

    const isSingle = locationIds.length === 1;
    const label = action === "make_searchable"
      ? `${isSingle ? "make this location" : "make the eligible selected locations"} searchable`
      : `${isSingle ? "unhide this location" : "unhide the selected locations"}`;
    if (!dryRun && !window.confirm(`Are you sure you want to ${label}?`)) return;

    setBusy(true);
    setActiveLocationId(isSingle ? locationIds[0] : null);
    setMessage("");
    try {
      const response = await fetch("/api/admin/locations/hidden-repair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, locationIds, dryRun }),
      });
      const payload = await response.json();
      if (!response.ok || payload.success === false) throw new Error(payload.error || "Repair failed.");

      const failedReason = payload.results?.find((result: any) => result.status === "failed" || result.status === "skipped")?.reasons?.join(", ");
      const nextMessage = `${dryRun ? "Preview" : "Repair"} complete: ${payload.repaired} repaired, ${payload.skipped} skipped.${failedReason ? ` ${failedReason}` : ""}`;
      setMessage(nextMessage);
      if (!dryRun) await load(page, true);
    } catch (error: any) {
      setMessage(error?.message || "Repair failed.");
    } finally {
      setBusy(false);
      setActiveLocationId(null);
    }
  }

  const allPageSelected = rows.length > 0 && rows.every((row) => selected.includes(row.id));
  const pageCount = Math.max(1, Math.ceil(total / 50));
  const bulkSearchableDisabledReason = busy
    ? "A location update is already running."
    : !selected.length
      ? "Select one or more locations first."
      : selectedEligible === 0
        ? "None of the selected locations are eligible. Use the Repair in CRM links below to fix the listed issues."
        : "";

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-white/10 bg-[#111] p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or address" className="rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white" />
          <select value={state} onChange={(e) => setState(e.target.value)} className="rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white"><option value="">All states</option><option>NY</option><option>NJ</option><option>CT</option></select>
          <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white"><option value="">All types</option><option value="restaurant">Restaurant</option><option value="activity">Activity</option></select>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className="rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white"><option value="all">All hidden/non-searchable</option><option value="hidden">Hidden</option><option value="low_level">Low level</option><option value="not_searchable">Not searchable</option></select>
          <button onClick={() => load(1)} disabled={busy} title={busy ? "A location update is currently running." : "Apply the selected filters"} className="rounded-xl bg-rose-600 px-4 py-3 font-black text-white disabled:cursor-not-allowed disabled:opacity-50">Apply filters</button>
        </div>
      </section>

      {message ? <div role="status" aria-live="polite" className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-100">{message}</div> : null}

      <section className="rounded-3xl border border-white/10 bg-[#111] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black text-white">{selected.length} selected</p>
            <p className="text-xs font-bold text-white/45">{selectedEligible} eligible · {selectedBlocked} need repair</p>
            {bulkSearchableDisabledReason ? <p className="mt-2 max-w-2xl text-xs font-bold text-amber-200">{bulkSearchableDisabledReason}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy || !selected.length} title={!selected.length ? "Select at least one location first." : busy ? "A location update is currently running." : "Preview which selected locations can be made searchable"} onClick={() => repair("make_searchable", selected, true)} className="rounded-xl border border-white/15 px-4 py-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40">Preview searchable</button>
            <button disabled={busy || !selected.length} title={!selected.length ? "Select at least one location first." : busy ? "A location update is currently running." : "Unhide the selected locations"} onClick={() => repair("unhide")} className="rounded-xl border border-amber-300/30 bg-amber-500/10 px-4 py-2 text-sm font-black text-amber-100 disabled:cursor-not-allowed disabled:opacity-40">Bulk unhide</button>
            <button disabled={Boolean(bulkSearchableDisabledReason)} title={bulkSearchableDisabledReason || "Make all eligible selected locations searchable"} onClick={() => repair("make_searchable")} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40">Bulk make searchable</button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#111]">
        <div className="overflow-x-auto">
          <table className="min-w-[1280px] w-full text-left text-sm">
            <thead className="bg-black/40 text-xs uppercase tracking-wider text-white/40"><tr><th className="px-4 py-4"><input type="checkbox" checked={allPageSelected} onChange={() => setSelected(allPageSelected ? [] : rows.map((row) => row.id))} /></th><th className="px-4 py-4">Location</th><th className="px-4 py-4">Flags</th><th className="px-4 py-4">Eligibility</th><th className="px-4 py-4">Reason</th><th className="px-4 py-4">Action</th></tr></thead>
            <tbody>
              {rows.map((row) => {
                const crmHref = `/admin/dashboard/crm/${row.id}`;
                const blockingReason = row.repair_reasons.length ? row.repair_reasons.join(", ") : row.low_level_reason || "No blocking issue";
                return <tr key={row.id} className="border-t border-white/5 align-top">
                  <td className="px-4 py-4"><input type="checkbox" checked={selected.includes(row.id)} onChange={() => setSelected((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])} /></td>
                  <td className="px-4 py-4"><a href={crmHref} target="_blank" rel="noopener noreferrer" className="font-black text-white underline decoration-rose-400/40 underline-offset-4 transition hover:text-rose-200" title="Open CRM view in a new tab">{row.display_name}</a><p className="mt-1 text-xs text-white/45">{[row.address, row.city, row.state].filter(Boolean).join(", ") || "No address"}</p><p className="mt-1 text-[11px] text-white/25">{row.id}</p></td>
                  <td className="px-4 py-4"><div className="flex flex-wrap gap-1">{row.is_hidden ? <span className="rounded-full bg-rose-500/15 px-2 py-1 text-xs font-black text-rose-200">Hidden</span> : null}{row.is_low_level ? <span className="rounded-full bg-amber-500/15 px-2 py-1 text-xs font-black text-amber-200">Low level</span> : null}{!row.is_searchable ? <span className="rounded-full bg-white/10 px-2 py-1 text-xs font-black text-white/60">Not searchable</span> : null}</div></td>
                  <td className="px-4 py-4">{row.can_make_searchable ? <span className="font-black text-emerald-300">Ready</span> : <a href={crmHref} target="_blank" rel="noopener noreferrer" className="font-black text-amber-300 underline decoration-amber-300/40 underline-offset-4 hover:text-amber-200" title={`Open this location in CRM to repair: ${blockingReason}`}>Needs repair</a>}</td>
                  <td className="px-4 py-4 text-white/60"><p>{blockingReason}</p>{!row.can_make_searchable ? <a href={crmHref} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs font-black text-rose-200 underline underline-offset-4">Open location repair</a> : null}</td>
                  <td className="px-4 py-4">{row.is_searchable ? <span className="inline-flex rounded-xl border border-emerald-300/20 bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-200">Already searchable</span> : row.can_make_searchable ? <button disabled={busy} title={busy ? "Another update is currently running." : "Make this location searchable"} onClick={() => repair("make_searchable", [row.id])} className="whitespace-nowrap rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40">{activeLocationId === row.id ? "Updating..." : "Make searchable"}</button> : <a href={crmHref} target="_blank" rel="noopener noreferrer" title={`Repair required: ${blockingReason}`} className="inline-flex whitespace-nowrap rounded-xl border border-amber-300/30 bg-amber-500/10 px-3 py-2 text-xs font-black text-amber-100 hover:bg-amber-500/20">Repair in CRM</a>}</td>
                </tr>;
              })}
              {!rows.length ? <tr><td colSpan={6} className="px-6 py-12 text-center text-white/40">No locations match these filters.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-white/10 px-5 py-4 text-sm font-bold text-white/50"><span>{total.toLocaleString()} locations</span><div className="flex items-center gap-2"><button disabled={busy || page <= 1} title={page <= 1 ? "You are already on the first page." : busy ? "A location update is currently running." : "Go to the previous page"} onClick={() => load(page - 1)} className="rounded-lg border border-white/10 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-30">Previous</button><span>Page {page} of {pageCount}</span><button disabled={busy || page >= pageCount} title={page >= pageCount ? "You are already on the last page." : busy ? "A location update is currently running." : "Go to the next page"} onClick={() => load(page + 1)} className="rounded-lg border border-white/10 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-30">Next</button></div></div>
      </section>
    </div>
  );
}
