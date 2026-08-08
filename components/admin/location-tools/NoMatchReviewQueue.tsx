"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type ReviewStatus = "open" | "reviewed" | "needs_source_repair" | "manual_review";
type RepairDraft = { name: string; address: string; city: string; state: string };

type QueueRow = {
  id: string;
  runId: string;
  locationId: string;
  completedAt: string | null;
  apiCalls: number | null;
  attempts: number | null;
  location: {
    id: string;
    name?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    market?: string | null;
    google_enrichment_status?: string | null;
    google_enriched_at?: string | null;
  } | null;
  confidence: number;
  candidate: {
    displayName?: string | null;
    formattedAddress?: string | null;
    primaryType?: string | null;
    placeId?: string | null;
  } | null;
  evidence: {
    distanceMeters?: number | null;
    nameSimilarity?: number | null;
    addressMatch?: boolean;
    areaMatch?: boolean;
    sameStreet?: boolean;
  };
  disposition: {
    category: string;
    confidence: "high" | "medium" | "low" | string;
    reason: string;
    recommendedAction: string;
  };
  review: {
    status: ReviewStatus;
    note: string;
    reviewedAt: string | null;
    reviewedBy: string | null;
  };
};

type QueuePayload = {
  success?: boolean;
  error?: string;
  message?: string;
  rows?: QueueRow[];
  counts?: Record<string, number>;
};

const CATEGORY_LABELS: Record<string, string> = {
  likely_closed_or_renamed: "Likely closed or renamed",
  bad_source_name: "Bad source name",
  address_only: "Address only",
  parent_venue_or_embedded: "Parent / embedded venue",
  unresolved: "Unresolved",
};

const ACTION_LABELS: Record<string, string> = {
  verify_then_unpublish: "Verify business status before any unpublish decision",
  repair_source_name: "Repair the source business name, then re-run enrichment",
  verify_source_record: "Verify the source record and address",
  verify_embedded_venue: "Verify whether this venue operates inside the parent location",
  manual_review: "Keep this record in manual review",
};

const REPAIRABLE_CATEGORIES = new Set(["bad_source_name", "address_only", "unresolved"]);

export function NoMatchReviewQueue() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [category, setCategory] = useState("all");
  const [reviewFilter, setReviewFilter] = useState<"open" | "all">("open");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [repairDraft, setRepairDraft] = useState<RepairDraft>({ name: "", address: "", city: "", state: "" });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/locations/enrichment-no-match-review", { cache: "no-store" });
      const json = await response.json() as QueuePayload;
      if (!response.ok || json.success === false) throw new Error(json.error || "Could not load the no-match review queue.");
      setRows(json.rows || []);
      setCounts(json.counts || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visible = useMemo(() => rows.filter((row) => {
    const categoryMatches = category === "all" || row.disposition.category === category;
    const reviewMatches = reviewFilter === "all" || row.review.status === "open";
    return categoryMatches && reviewMatches;
  }), [rows, category, reviewFilter]);

  async function setReview(row: QueueRow, status: ReviewStatus) {
    setBusyId(row.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/locations/enrichment-no-match-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: row.id, status }),
      });
      const json = await response.json() as QueuePayload;
      if (!response.ok || json.success === false) throw new Error(json.error || "Could not save the review status.");
      setNotice("Review status saved. Searchability and publishing were not changed.");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  function startRepair(row: QueueRow) {
    setEditingId(row.id);
    setRepairDraft({
      name: row.location?.name || "",
      address: row.location?.address || "",
      city: row.location?.city || "",
      state: row.location?.state || "",
    });
    setError(null);
    setNotice(null);
  }

  async function saveRepair(row: QueueRow) {
    setBusyId(row.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/locations/enrichment-no-match-repair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: row.id, repair: repairDraft }),
      });
      const json = await response.json() as QueuePayload;
      if (!response.ok || json.success === false) throw new Error(json.error || "Could not repair the canonical source data.");
      setNotice(json.message || "Canonical source data repaired and Search Foundation V3 refresh queued. Google recheck is still required.");
      setEditingId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  const openCount = rows.filter((row) => row.review.status === "open").length;
  const reviewedCount = rows.length - openCount;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Open review" value={openCount} />
        <Metric label="Reviewed / routed" value={reviewedCount} />
        <Metric label="Likely closed / renamed" value={counts.likely_closed_or_renamed || 0} />
        <Metric label="Unresolved" value={counts.unresolved || 0} />
      </div>

      <div className="rounded-2xl border border-amber-300/20 bg-amber-500/[0.08] p-4 text-sm font-semibold text-amber-100/85">
        This queue is advisory. Review actions do not delete, unpublish, or change searchability automatically. Source repair updates the canonical location and queues a Search Foundation V3 refresh; it does not automatically accept a Google match.
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <label className="text-xs font-black uppercase tracking-widest text-white/40">
            Disposition
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/60 p-3 text-sm font-bold normal-case tracking-normal text-white">
              <option value="all">All dispositions</option>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="text-xs font-black uppercase tracking-widest text-white/40">
            Review state
            <select value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value as "open" | "all")} className="mt-2 w-full rounded-xl border border-white/10 bg-black/60 p-3 text-sm font-bold normal-case tracking-normal text-white">
              <option value="open">Open only</option>
              <option value="all">All items</option>
            </select>
          </label>
        </div>
        <button type="button" disabled={loading} onClick={() => void refresh()} className="rounded-full border border-white/15 bg-white/10 px-5 py-3 text-sm font-black text-white disabled:opacity-50">Refresh queue</button>
      </div>

      {error ? <div className="rounded-2xl border border-red-300/30 bg-red-500/15 p-4 text-sm font-bold text-red-100">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-300/30 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-100">{notice}</div> : null}
      {loading && !rows.length ? <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-sm font-semibold text-white/45">Loading review queue…</div> : null}
      {!loading && !visible.length ? <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-sm font-semibold text-white/45">No no-match records match these filters.</div> : null}

      <div className="space-y-4">
        {visible.map((row) => {
          const name = row.location?.name || "Unnamed location";
          const localAddress = [row.location?.address, row.location?.city, row.location?.state].filter(Boolean).join(", ") || "No local address";
          const candidateName = row.candidate?.displayName || "No Google business candidate";
          const candidateAddress = row.candidate?.formattedAddress || "No Google candidate address";
          const distance = typeof row.evidence?.distanceMeters === "number" ? `${Math.round(row.evidence.distanceMeters)} m` : "—";
          const similarity = typeof row.evidence?.nameSimilarity === "number" ? `${Math.round(row.evidence.nameSimilarity * 100)}%` : "—";
          const categoryLabel = CATEGORY_LABELS[row.disposition.category] || row.disposition.category.replaceAll("_", " ");
          const actionText = ACTION_LABELS[row.disposition.recommendedAction] || row.disposition.recommendedAction.replaceAll("_", " ");
          const repairable = REPAIRABLE_CATEGORIES.has(row.disposition.category);

          return (
            <article key={row.id} className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.035]">
              <div className="flex flex-col gap-4 border-b border-white/10 p-5 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <DispositionBadge category={row.disposition.category} label={categoryLabel} />
                    <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-white/55">{row.disposition.confidence} disposition confidence</span>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-white/55">review: {row.review.status.replaceAll("_", " ")}</span>
                  </div>
                  <h3 className="mt-3 text-xl font-black text-white">{name}</h3>
                  <p className="mt-1 text-sm font-semibold text-white/45">{localAddress}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {repairable ? <button type="button" onClick={() => startRepair(row)} className="rounded-full bg-amber-400 px-5 py-2.5 text-sm font-black text-black">Repair source data</button> : null}
                  <Link href={`/admin/dashboard/locations/id/${row.locationId}`} className="shrink-0 rounded-full border border-white/15 bg-white/10 px-5 py-2.5 text-sm font-black text-white hover:bg-white/15">Open location record</Link>
                </div>
              </div>

              <div className="grid gap-0 lg:grid-cols-2">
                <div className="border-b border-white/10 p-5 lg:border-b-0 lg:border-r">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">TheOutHaven source</p>
                  <p className="mt-2 text-lg font-black text-white">{name}</p>
                  <p className="mt-1 text-sm font-semibold text-white/50">{localAddress}</p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-white/50">
                    {row.location?.market ? <span className="rounded-full bg-white/10 px-3 py-1">Market: {row.location.market}</span> : null}
                    <span className="rounded-full bg-white/10 px-3 py-1">Match confidence: {row.confidence}</span>
                  </div>
                </div>
                <div className="p-5">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">Best Google candidate</p>
                  <p className="mt-2 text-lg font-black text-white">{candidateName}</p>
                  <p className="mt-1 text-sm font-semibold text-white/50">{candidateAddress}</p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-white/50">
                    <span className="rounded-full bg-white/10 px-3 py-1">Distance: {distance}</span>
                    <span className="rounded-full bg-white/10 px-3 py-1">Name similarity: {similarity}</span>
                    <span className="rounded-full bg-white/10 px-3 py-1">Address match: {row.evidence?.addressMatch ? "Yes" : "No"}</span>
                  </div>
                </div>
              </div>

              {editingId === row.id ? (
                <div className="border-t border-amber-300/20 bg-amber-500/[0.06] p-5">
                  <div className="mb-4">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-200/70">Canonical source repair</p>
                    <p className="mt-1 text-sm font-semibold text-white/55">Correct only what you can verify. Saving queues Search Foundation V3 refresh but does not spend Google calls or accept the candidate above.</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <RepairField label="Name" value={repairDraft.name} onChange={(value) => setRepairDraft((current) => ({ ...current, name: value }))} />
                    <RepairField label="Address" value={repairDraft.address} onChange={(value) => setRepairDraft((current) => ({ ...current, address: value }))} />
                    <RepairField label="City" value={repairDraft.city} onChange={(value) => setRepairDraft((current) => ({ ...current, city: value }))} />
                    <RepairField label="State" value={repairDraft.state} onChange={(value) => setRepairDraft((current) => ({ ...current, state: value }))} />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button disabled={busyId === row.id} onClick={() => void saveRepair(row)} className="rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-black text-white disabled:opacity-50">Save verified repair</button>
                    <button disabled={busyId === row.id} onClick={() => setEditingId(null)} className="rounded-full border border-white/15 bg-white/10 px-5 py-2.5 text-sm font-black text-white disabled:opacity-50">Cancel</button>
                  </div>
                </div>
              ) : null}

              <div className="border-t border-white/10 bg-black/20 p-5">
                <div className="grid gap-4 xl:grid-cols-[1fr_1fr_auto] xl:items-end">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">Why it was classified this way</p>
                    <p className="mt-2 text-sm font-semibold leading-6 text-white/70">{row.disposition.reason}</p>
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">Recommended admin action</p>
                    <p className="mt-2 text-sm font-semibold leading-6 text-white/70">{actionText}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 xl:justify-end">
                    <button disabled={busyId === row.id} onClick={() => void setReview(row, "reviewed")} className="rounded-full bg-emerald-500 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">Mark reviewed</button>
                    <button disabled={busyId === row.id} onClick={() => void setReview(row, "needs_source_repair")} className="rounded-full bg-amber-400 px-4 py-2.5 text-xs font-black text-black disabled:opacity-50">Needs source repair</button>
                    <button disabled={busyId === row.id} onClick={() => void setReview(row, "manual_review")} className="rounded-full border border-white/15 bg-white/10 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">Keep manual review</button>
                    {row.review.status !== "open" ? <button disabled={busyId === row.id} onClick={() => void setReview(row, "open")} className="rounded-full border border-white/10 px-4 py-2.5 text-xs font-black text-white/60 disabled:opacity-50">Reopen</button> : null}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function RepairField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-xs font-black uppercase tracking-widest text-white/40">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-3 text-sm font-bold normal-case tracking-normal text-white outline-none focus:border-amber-300/50" />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="text-xs font-black uppercase tracking-widest text-white/35">{label}</p>
      <p className="mt-2 text-2xl font-black text-white">{value.toLocaleString()}</p>
    </div>
  );
}

function DispositionBadge({ category, label }: { category: string; label: string }) {
  const tone = category === "likely_closed_or_renamed"
    ? "border-red-300/25 bg-red-500/15 text-red-100"
    : category === "bad_source_name"
      ? "border-amber-300/25 bg-amber-500/15 text-amber-100"
      : category === "parent_venue_or_embedded"
        ? "border-sky-300/25 bg-sky-500/15 text-sky-100"
        : category === "address_only"
          ? "border-violet-300/25 bg-violet-500/15 text-violet-100"
          : "border-white/15 bg-white/10 text-white/70";

  return <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-wider ${tone}`}>{label}</span>;
}
