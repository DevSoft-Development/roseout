"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export type ReviewTableRow = {
  locationId: string;
  name: string;
  locationType: string;
  state: string;
  city: string;
  status: string;
  domain: string;
  canonicalTerms: string[];
  confidence: number;
  profileVersion: number;
  generatedAt: string | null;
  severity: "blocking" | "warning" | "none";
  blockingReasons: string[];
  warningReasons: string[];
};

type BulkResult = {
  verified?: number;
  corrected?: number;
  skipped?: number;
  details?: Array<{ locationId: string; outcome: string; reasons: string[] }>;
  error?: string;
};

function confidenceLabel(value: number) {
  if (value >= 0.75) return "Strong";
  if (value >= 0.55) return "Moderate";
  return "Low";
}

function IssuePopover({ row }: { row: ReviewTableRow }) {
  const allIssues = [
    ...row.blockingReasons.map((reason) => ({ kind: "Blocking", reason })),
    ...row.warningReasons.map((reason) => ({ kind: "Warning", reason })),
  ];
  const visible = allIssues.slice(0, 4);
  const hiddenCount = Math.max(0, allIssues.length - visible.length);

  return (
    <div className="relative min-w-0">
      <p className="text-[10px] font-black uppercase tracking-wide text-white/35">Why review</p>
      <div className="mt-1 space-y-1">
        {visible.map((issue) => (
          <p key={`${issue.kind}:${issue.reason}`} className={issue.kind === "Blocking" ? "line-clamp-1 text-xs text-red-200" : "line-clamp-1 text-xs text-amber-100"}>
            {issue.reason}
          </p>
        ))}
        {hiddenCount > 0 ? (
          <div className="group relative inline-block">
            <button type="button" className="rounded-md border border-white/10 px-2 py-1 text-[11px] font-bold text-white/55 hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-rose-400/50">
              +{hiddenCount} more issues
            </button>
            <div role="tooltip" className="pointer-events-none invisible absolute left-0 top-full z-50 mt-2 w-[min(420px,80vw)] translate-y-1 rounded-xl border border-white/15 bg-[#171717] p-3 opacity-0 shadow-2xl transition group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
              <div className="mb-2 flex items-center justify-between gap-3">
                <strong className="text-xs text-white">All review issues</strong>
                <span className="text-[10px] text-white/40">{allIssues.length} total</span>
              </div>
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {allIssues.map((issue) => (
                  <div key={`${issue.kind}:${issue.reason}`} className="rounded-lg bg-white/[0.035] p-2">
                    <span className={issue.kind === "Blocking" ? "text-[10px] font-black uppercase text-red-200" : "text-[10px] font-black uppercase text-amber-100"}>{issue.kind}</span>
                    <p className="mt-1 break-words text-xs leading-5 text-white/75">{issue.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SearchProfileReviewTable({ rows, isSuperadmin }: { rows: ReviewTableRow[]; isSuperadmin: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [details, setDetails] = useState<BulkResult["details"]>([]);

  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.locationId));
  const selectedRows = useMemo(() => rows.filter((row) => selected.has(row.locationId)), [rows, selected]);

  function toggleAll() { setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.locationId))); }
  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function runBulk(action: "verify" | "apply_safe", override = false) {
    if (!selectedRows.length) return setMessage("Select at least one profile.");
    let reason = "";
    if (override) {
      reason = window.prompt("Required superadmin reason for verifying these profiles anyway:")?.trim() ?? "";
      if (reason.length < 10) return setMessage("A reason of at least 10 characters is required.");
    }
    const label = override ? "verify anyway" : action === "apply_safe" ? "apply safe corrections to" : "verify";
    if (!window.confirm(`${label} ${selectedRows.length.toLocaleString()} selected profiles?`)) return;
    setBusy(true); setMessage(""); setDetails([]);
    try {
      const response = await fetch("/api/admin/location-tools/search-profiles/bulk-verify", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ locationIds: selectedRows.map((row) => row.locationId), action, override, reason }),
      });
      const result = (await response.json().catch(() => ({}))) as BulkResult;
      if (!response.ok) throw new Error(result.error ?? "Bulk action failed.");
      setMessage(`${result.verified ?? 0} verified · ${result.corrected ?? 0} corrected · ${result.skipped ?? 0} skipped`);
      setDetails(result.details ?? []); setSelected(new Set()); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Bulk action failed."); }
    finally { setBusy(false); }
  }

  async function enrichSelected() {
    if (!selectedRows.length) return setMessage("Select at least one profile.");
    if (selectedRows.length > 25) return setMessage("Google enrichment is limited to 25 selected profiles per run.");
    if (!window.confirm(`Look up, enrich, and rebuild ${selectedRows.length} selected profiles using Google Places?`)) return;
    setBusy(true); setMessage(""); setDetails([]);
    const outcomes: NonNullable<BulkResult["details"]> = [];
    let enriched = 0;
    for (const row of selectedRows) {
      try {
        const enrichment = await fetch("/api/admin/locations/google-enrichment/single", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ locationId: row.locationId }),
        });
        const enrichmentPayload = await enrichment.json().catch(() => ({})) as { error?: string; matchConfidence?: number };
        if (!enrichment.ok) throw new Error(enrichmentPayload.error ?? "Google lookup failed.");
        const rebuild = await fetch(`/api/admin/location-tools/search-profiles/${row.locationId}/rebuild`, { method: "POST" });
        const rebuildPayload = await rebuild.json().catch(() => ({})) as { error?: string };
        if (!rebuild.ok) throw new Error(rebuildPayload.error ?? "Profile rebuild failed.");
        enriched += 1;
        outcomes.push({ locationId: row.locationId, outcome: "enriched", reasons: [`Google match confidence ${enrichmentPayload.matchConfidence ?? "unknown"}%`, "Profile rebuilt from enriched canonical fields"] });
      } catch (error) {
        outcomes.push({ locationId: row.locationId, outcome: "skipped", reasons: [error instanceof Error ? error.message : "Enrichment failed"] });
      }
    }
    setMessage(`${enriched} enriched and rebuilt · ${selectedRows.length - enriched} skipped`);
    setDetails(outcomes); setSelected(new Set()); setBusy(false); router.refresh();
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="sticky top-3 z-20 rounded-2xl border border-white/10 bg-[#111]/95 p-3 shadow-xl backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={toggleAll} className="h-9 whitespace-nowrap rounded-lg border border-white/15 px-3 text-xs font-black text-white hover:bg-white/5">{allSelected ? "Clear selection" : "Select all shown"}</button>
          <span className="mr-2 text-xs text-white/55">{selected.size} selected</span>
          <button type="button" disabled={busy || selected.size === 0} onClick={enrichSelected} className="h-9 whitespace-nowrap rounded-lg bg-violet-600 px-4 text-xs font-black text-white disabled:opacity-40">Enrich & rebuild</button>
          <button type="button" disabled={busy || selected.size === 0} onClick={() => runBulk("verify")} className="h-9 whitespace-nowrap rounded-lg bg-emerald-600 px-4 text-xs font-black text-white disabled:opacity-40">Verify selected</button>
          <button type="button" disabled={busy || selected.size === 0} onClick={() => runBulk("apply_safe")} className="h-9 whitespace-nowrap rounded-lg bg-sky-600 px-4 text-xs font-black text-white disabled:opacity-40">Apply safe corrections</button>
          {isSuperadmin ? <button type="button" disabled={busy || selected.size === 0} onClick={() => runBulk("verify", true)} className="h-9 whitespace-nowrap rounded-lg bg-amber-600 px-4 text-xs font-black text-white disabled:opacity-40">Verify anyway</button> : null}
        </div>
        {message ? <p className="mt-2 text-sm text-white/80">{message}</p> : null}
      </div>

      {details?.length ? <details className="rounded-xl border border-white/10 bg-black/25 p-3 text-xs text-white/70"><summary className="cursor-pointer font-black text-white">Bulk action details ({details.length})</summary><div className="mt-2 space-y-1">{details.map((item) => <div key={item.locationId}><strong>{item.outcome}</strong> · {item.locationId} · {item.reasons.join("; ") || "No issues"}</div>)}</div></details> : null}

      <div className="space-y-3">
        {rows.map((row) => (
          <article key={row.locationId} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 transition hover:border-white/20 hover:bg-white/[0.04]">
            <div className="grid min-w-0 gap-4 xl:grid-cols-[32px_minmax(220px,1.4fr)_minmax(150px,.8fr)_minmax(180px,1fr)_110px_130px] xl:items-start">
              <div className="pt-1"><input type="checkbox" checked={selected.has(row.locationId)} onChange={() => toggle(row.locationId)} aria-label={`Select ${row.name}`} className="h-4 w-4 accent-rose-500" /></div>
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-base font-black text-white">{row.name}</h3><span className={row.severity === "blocking" ? "rounded-full bg-red-500/15 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-red-200" : "rounded-full bg-amber-500/15 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-amber-100"}>{row.severity === "blocking" ? "Blocking" : "Warning"}</span></div><p className="mt-1 text-xs text-white/45">{[row.locationType, row.state, row.city].filter(Boolean).join(" · ") || "Location details unavailable"}</p><code className="mt-1 block truncate text-[10px] text-white/25">{row.locationId}</code></div>
              <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-wide text-white/35">Classification</p><p className="mt-1 text-sm font-bold text-white">{row.domain || "No domain"}</p><p className="mt-1 line-clamp-2 text-xs text-white/55">{row.canonicalTerms.slice(0, 6).join(", ") || "No canonical search terms"}</p></div>
              <IssuePopover row={row} />
              <div><p className="text-[10px] font-black uppercase tracking-wide text-white/35">Confidence</p><p className="mt-1 text-lg font-black text-white">{Math.round(row.confidence * 100)}%</p><p className="text-[11px] text-white/45">{confidenceLabel(row.confidence)} · v{row.profileVersion}</p><p className="mt-1 text-[11px] text-white/35">{row.generatedAt ? new Date(row.generatedAt).toLocaleDateString() : "No date"}</p></div>
              <div className="flex flex-row gap-2 xl:flex-col"><Link href={`/admin/dashboard/settings/location-tools/search-profiles/${row.locationId}`} className="rounded-lg bg-white px-3 py-2 text-center text-xs font-black text-black hover:bg-white/90">Review & apply</Link><Link href={`/admin/dashboard/settings/location-tools/search-profiles?search=${row.locationId}`} className="rounded-lg border border-white/15 px-3 py-2 text-center text-xs font-black text-white hover:bg-white/5">View profile</Link></div>
            </div>
          </article>
        ))}
        {!rows.length ? <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center text-sm text-white/50">No profiles match the current filters.</div> : null}
      </div>
    </div>
  );
}
