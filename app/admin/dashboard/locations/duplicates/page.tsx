"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AdminEmptyState, AdminKpiCard, AdminKpiGrid, AdminPageHeader, AdminPageShell, AdminSearchInput, AdminSectionCard, AdminStatusBadge } from "@/components/admin/AdminDesignSystem";

type Location = { id: string; name?: string; restaurant_name?: string; activity_name?: string; address?: string; city?: string; state?: string; location_type?: string; primary_category?: string; cuisine?: string; cuisine_type?: string; activity_type?: string; is_searchable?: boolean; duplicate_status?: string; quality_score?: number; review_count?: number; rating?: number; main_image?: string; image_url?: string };
type Row = { id: string; location_a_id: string; location_b_id: string; suggested_master_id?: string; duplicate_score: number; match_reasons: string[]; status: string; locationA: Location | null; locationB: Location | null };
type Summary = { pending?: number; highConfidencePending?: number; bothSearchablePending?: number; merged?: number; ignored?: number; notDuplicate?: number };

const buttonBase = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-black transition focus:outline-none focus:ring-2 focus:ring-rose-300/50 disabled:cursor-not-allowed disabled:opacity-50";
const primaryButton = `${buttonBase} bg-[#ec0b5b] text-white shadow-lg shadow-rose-950/30 hover:bg-rose-500`;
const secondaryButton = `${buttonBase} border border-white/10 bg-white/[0.055] text-white/80 hover:border-rose-200/30 hover:text-white`;
const ghostButton = `${buttonBase} text-white/70 hover:bg-white/[0.06] hover:text-white`;

function displayName(location?: Location | null) { return location?.name || location?.restaurant_name || location?.activity_name || "Untitled location"; }
function fullAddress(location?: Location | null) { return [location?.address, location?.city, location?.state].filter(Boolean).join(", ") || "No address"; }
function category(location?: Location | null) { return [location?.location_type, location?.primary_category || location?.cuisine || location?.cuisine_type || location?.activity_type].filter(Boolean).join(" / ") || "Uncategorized"; }
function crmHref(id?: string) { return id ? `/admin/dashboard/crm/${id}` : "/admin/dashboard/crm"; }

export default function DuplicateLocationReviewPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary>({});
  const [status, setStatus] = useState("pending");
  const [q, setQ] = useState("");
  const [minScore, setMinScore] = useState("0");
  const [scanLimit, setScanLimit] = useState("500");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [confirming, setConfirming] = useState<{ row: Row; master: "A" | "B" } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const effectiveMinScore = useMemo(() => status === "high_confidence" ? "95" : minScore, [minScore, status]);
  const apiStatus = status === "high_confidence" ? "pending" : status;

  const load = useCallback(async (nextPage = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: apiStatus, minScore: effectiveMinScore, limit: "25", page: String(nextPage) });
      if (q.trim()) params.set("q", q.trim());
      const [rowsResponse, summaryResponse] = await Promise.all([fetch(`/api/admin/locations/duplicates?${params}`, { cache: "no-store" }), fetch("/api/admin/locations/duplicates/summary", { cache: "no-store" })]);
      const rowsJson = await rowsResponse.json();
      const summaryJson = await summaryResponse.json();
      if (!rowsResponse.ok || rowsJson.success === false) throw new Error(rowsJson.error || "Could not load duplicate review rows");
      setRows(rowsJson.rows || []);
      setHasMore(Boolean(rowsJson.hasMore));
      setSummary(summaryJson || {});
      setPage(nextPage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load duplicate review rows.");
    } finally {
      setLoading(false);
    }
  }, [apiStatus, effectiveMinScore, page, q]);

  useEffect(() => { void load(1); }, [apiStatus, effectiveMinScore]);

  async function post(body: Record<string, unknown>, friendlySuccess = "Action completed.") {
    setLoading(true); setMessage(null);
    try {
      const response = await fetch("/api/admin/locations/duplicates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = await response.json();
      if (!response.ok || json.success === false) throw new Error(json.error || "Action failed.");
      setMessage(friendlySuccess);
      setConfirming(null);
      await load(page);
    } catch (error) {
      const text = error instanceof Error ? error.message : "Action failed.";
      setMessage(text.includes("timeout") ? "Scan was too large or timed out. Try a smaller batch. Existing review rows are still available." : text);
    } finally {
      setLoading(false);
    }
  }

  async function scan() {
    setScanning(true);
    await post({ action: "scan", limit: Number(scanLimit) || 500 }, "Scan completed. Review rows refreshed.");
    setScanning(false);
  }

  return <AdminPageShell>
    <AdminPageHeader
      eyebrow="Admin locations"
      title="Duplicate Location Review"
      subtitle="Review possible duplicate public locations, merge useful data into one master, and hide duplicate rows from search."
      actions={<><Link className={secondaryButton} href="/admin/dashboard/locations">Back to Locations</Link><button className={primaryButton} onClick={scan} disabled={scanning || loading}>{scanning ? "Scanning..." : "Scan for duplicates"}</button></>}
    />

    <AdminKpiGrid>
      <AdminKpiCard label="Pending" value={summary.pending ?? "—"} helper="Open review rows" />
      <AdminKpiCard label="High Confidence" value={summary.highConfidencePending ?? "—"} helper="Score 95+ pending" />
      <AdminKpiCard label="Both Searchable" value={summary.bothSearchablePending ?? "—"} helper="Both appear searchable" />
      <AdminKpiCard label="Merged" value={summary.merged ?? "—"} helper="Completed merges" />
      <AdminKpiCard label="Ignored / Not Duplicate" value={(summary.ignored ?? 0) + (summary.notDuplicate ?? 0)} helper="Dismissed rows" />
    </AdminKpiGrid>

    <AdminSectionCard className="p-4">
      <div className="grid gap-3 lg:grid-cols-[180px_160px_1fr_180px_auto] lg:items-end">
        <label className="space-y-2"><span className="text-xs font-black uppercase tracking-[0.22em] text-white/45">Status</span><select value={status} onChange={(e) => setStatus(e.target.value)} className="min-h-10 w-full rounded-xl border border-white/10 bg-[#0b0b0d] px-3 text-sm font-semibold text-white"><option value="pending">Pending</option><option value="high_confidence">High Confidence</option><option value="merged">Merged</option><option value="ignored">Ignored</option><option value="not_duplicate">Not Duplicate</option></select></label>
        <label className="space-y-2"><span className="text-xs font-black uppercase tracking-[0.22em] text-white/45">Min score</span><input value={effectiveMinScore} disabled={status === "high_confidence"} onChange={(e) => setMinScore(e.target.value)} className="min-h-10 w-full rounded-xl border border-white/10 bg-[#0b0b0d] px-3 text-sm font-semibold text-white disabled:opacity-60" /></label>
        <label className="space-y-2"><span className="text-xs font-black uppercase tracking-[0.22em] text-white/45">Search</span><AdminSearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search names or addresses" /></label>
        <label className="space-y-2"><span className="text-xs font-black uppercase tracking-[0.22em] text-white/45">Scan limit</span><select value={scanLimit} onChange={(e) => setScanLimit(e.target.value)} className="min-h-10 w-full rounded-xl border border-white/10 bg-[#0b0b0d] px-3 text-sm font-semibold text-white"><option value="250">250</option><option value="500">500</option><option value="1000">1000</option><option value="2000">2000</option></select></label>
        <button className={secondaryButton} onClick={() => load(1)} disabled={loading}>Apply</button>
      </div>
      <p className="mt-3 text-xs font-semibold text-white/45">Scanning runs in batches and does not delete locations.</p>
    </AdminSectionCard>

    {message ? <div className="rounded-2xl border border-rose-300/25 bg-rose-500/10 p-4 text-sm font-semibold text-rose-50">{message}</div> : null}

    <div className="space-y-4">
      {loading && rows.length === 0 ? <p className="text-sm text-white/55">Loading duplicate review rows…</p> : null}
      {!loading && rows.length === 0 ? <AdminEmptyState title="No duplicate review rows" body="This page only loads existing review rows. Run a small scan batch when you are ready to create more candidates." /> : null}
      {rows.map((row) => <DuplicatePair key={row.id} row={row} onConfirm={setConfirming} onPost={post} />)}
    </div>

    <div className="flex items-center justify-between">
      <button className={secondaryButton} disabled={page <= 1 || loading} onClick={() => load(page - 1)}>Previous</button>
      <span className="text-sm font-semibold text-white/50">Page {page}</span>
      <button className={secondaryButton} disabled={!hasMore || loading} onClick={() => load(page + 1)}>Next</button>
    </div>

    {confirming ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><div className="max-w-lg rounded-3xl border border-white/10 bg-[#101012] p-6 shadow-2xl"><h2 className="text-xl font-black text-white">Confirm merge</h2><p className="mt-3 text-sm text-white/60">Keep Location {confirming.master} as the master and hide the other location from public search? This does not delete location records.</p><div className="mt-5 flex flex-wrap gap-2"><button className={primaryButton} onClick={() => post({ action: "merge", masterId: confirming.master === "A" ? confirming.row.location_a_id : confirming.row.location_b_id, duplicateId: confirming.master === "A" ? confirming.row.location_b_id : confirming.row.location_a_id })}>Confirm merge</button><button className={ghostButton} onClick={() => setConfirming(null)}>Cancel</button></div></div></div> : null}
  </AdminPageShell>;
}

function DuplicatePair({ row, onConfirm, onPost }: { row: Row; onConfirm: (value: { row: Row; master: "A" | "B" }) => void; onPost: (body: Record<string, unknown>, friendlySuccess?: string) => Promise<void>; }) {
  return <AdminSectionCard className="p-5">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
      <div className="flex flex-wrap items-center gap-2"><AdminStatusBadge tone={row.duplicate_score >= 95 ? "green" : "amber"}>Score {row.duplicate_score}</AdminStatusBadge>{row.match_reasons.map((r) => <AdminStatusBadge key={r}>{r.replaceAll("_", " ")}</AdminStatusBadge>)}</div>
      <AdminStatusBadge tone="blue">{row.status}</AdminStatusBadge>
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">{([{ side: "A", location: row.locationA }, { side: "B", location: row.locationB }] as const).map(({ side, location }) => <div key={side} className="rounded-2xl border border-white/10 bg-black/25 p-4"><div className="flex gap-3"><img src={location?.main_image || location?.image_url || "/placeholder.svg"} alt="" className="h-16 w-16 rounded-2xl object-cover" /><div className="min-w-0"><p className="text-xs font-black uppercase tracking-[0.22em] text-white/40">Location {side}</p><h2 className="mt-1 truncate text-lg font-black text-white">{displayName(location)}</h2><p className="mt-1 text-sm text-white/60">{fullAddress(location)}</p></div></div><div className="mt-4 grid gap-2 text-xs font-semibold text-white/55 sm:grid-cols-2"><span>Type/category: {category(location)}</span><span>Searchable: {location?.is_searchable ? "Yes" : "No"}</span><span>Duplicate status: {location?.duplicate_status || "—"}</span><span>Reviews: {location?.review_count ?? "—"}</span></div>{row.suggested_master_id === location?.id ? <div className="mt-3"><AdminStatusBadge tone="green">Suggested master</AdminStatusBadge></div> : null}<Link className="mt-4 inline-flex text-sm font-black text-rose-200 hover:text-rose-100" href={crmHref(location?.id)}>Open {side} in CRM</Link></div>)}</div>
    <div className="mt-4 flex flex-wrap gap-2"><button className={secondaryButton} onClick={() => onConfirm({ row, master: "A" })}>Keep A / Merge B</button><button className={secondaryButton} onClick={() => onConfirm({ row, master: "B" })}>Keep B / Merge A</button><button className={ghostButton} onClick={() => onPost({ action: "not_duplicate", locationAId: row.location_a_id, locationBId: row.location_b_id }, "Marked not duplicate.")}>Mark Not Duplicate</button><button className={ghostButton} onClick={() => onPost({ action: "ignore", locationAId: row.location_a_id, locationBId: row.location_b_id }, "Ignored duplicate pair.")}>Ignore</button></div>
  </AdminSectionCard>;
}
