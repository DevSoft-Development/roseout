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

export function SearchProfileReviewTable({ rows, isSuperadmin }: { rows: ReviewTableRow[]; isSuperadmin: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [details, setDetails] = useState<BulkResult["details"]>([]);

  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.locationId));
  const selectedRows = useMemo(() => rows.filter((row) => selected.has(row.locationId)), [rows, selected]);

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.locationId)));
  }

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

    setBusy(true);
    setMessage("");
    setDetails([]);
    try {
      const response = await fetch("/api/admin/location-tools/search-profiles/bulk-verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locationIds: selectedRows.map((row) => row.locationId), action, override, reason }),
      });
      const result = (await response.json().catch(() => ({}))) as BulkResult;
      if (!response.ok) throw new Error(result.error ?? "Bulk action failed.");
      setMessage(`${result.verified ?? 0} verified; ${result.corrected ?? 0} corrected; ${result.skipped ?? 0} skipped.`);
      setDetails(result.details ?? []);
      setSelected(new Set());
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bulk action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-[#111]/95 p-3 backdrop-blur">
        <button type="button" onClick={toggleAll} className="rounded-full border border-white/15 px-3 py-2 text-xs font-black">{allSelected ? "Clear page" : "Select page"}</button>
        <span className="text-xs text-white/55">{selected.size} selected</span>
        <button type="button" disabled={busy || selected.size === 0} onClick={() => runBulk("verify")} className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">Verify selected</button>
        <button type="button" disabled={busy || selected.size === 0} onClick={() => runBulk("apply_safe")} className="rounded-full bg-sky-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">Apply safe corrections</button>
        {isSuperadmin ? <button type="button" disabled={busy || selected.size === 0} onClick={() => runBulk("verify", true)} className="rounded-full bg-amber-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">Verify anyway</button> : null}
        {message ? <p className="w-full text-sm text-white/80">{message}</p> : null}
      </div>

      {details?.length ? <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-xs text-white/70">{details.map((item) => <div key={item.locationId}><strong>{item.outcome}</strong> · {item.locationId} · {item.reasons.join("; ") || "No issues"}</div>)}</div> : null}

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="min-w-[1250px] w-full text-sm">
          <thead className="bg-white/[0.04] text-left text-xs uppercase tracking-wide text-white/45">
            <tr>
              <th className="p-3"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all visible profiles" /></th>
              <th>Location</th><th>Type</th><th>State</th><th>City</th><th>Status</th><th>Domain</th><th>Search terms</th><th>Confidence</th><th>Version</th><th>Generated</th><th>Why review</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.locationId} className="border-t border-white/10 align-top hover:bg-white/[0.025]">
                <td className="p-3"><input type="checkbox" checked={selected.has(row.locationId)} onChange={() => toggle(row.locationId)} aria-label={`Select ${row.name}`} /></td>
                <td className="p-3"><strong className="block max-w-56">{row.name}</strong><code className="text-[10px] text-white/30">{row.locationId}</code></td>
                <td className="p-3">{row.locationType || "—"}</td><td className="p-3">{row.state || "—"}</td><td className="p-3">{row.city || "—"}</td>
                <td className="p-3"><span className={row.severity === "blocking" ? "rounded-full bg-red-500/15 px-2 py-1 text-xs font-black text-red-200" : "rounded-full bg-amber-500/15 px-2 py-1 text-xs font-black text-amber-100"}>{row.status}</span></td>
                <td className="p-3">{row.domain || "—"}</td>
                <td className="p-3"><div className="max-w-64">{row.canonicalTerms.slice(0, 8).join(", ") || "—"}</div></td>
                <td className="p-3 font-black">{Math.round(row.confidence * 100)}%</td><td className="p-3">{row.profileVersion}</td><td className="p-3">{row.generatedAt ? new Date(row.generatedAt).toLocaleDateString() : "—"}</td>
                <td className="p-3"><div className="max-w-72 space-y-1">{row.blockingReasons.map((reason) => <p key={reason} className="text-xs text-red-200">Blocking: {reason}</p>)}{row.warningReasons.map((reason) => <p key={reason} className="text-xs text-amber-100">Warning: {reason}</p>)}</div></td>
                <td className="p-3"><div className="flex min-w-32 flex-col gap-2"><Link href={`/admin/dashboard/settings/location-tools/search-profiles/${row.locationId}`} className="rounded-full border border-emerald-300/25 px-3 py-2 text-center text-xs font-black text-emerald-100">Review / Apply</Link><Link href={`/admin/dashboard/settings/location-tools/search-profiles?search=${row.locationId}`} className="rounded-full border border-white/15 px-3 py-2 text-center text-xs font-black">View profile</Link></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
