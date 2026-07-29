"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SearchProfileBulkCheckbox, SearchProfileBulkVerify } from "./SearchProfileBulkVerify";

type RunResponse = { run?: { id?: string }; error?: string };

export function SearchProfilesClient({ eligibleCount, isSuperadmin = false }: { eligibleCount: number; isSuperadmin?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function backfill() {
    if (eligibleCount <= 0) { setMessage("No eligible locations are available for profile backfill."); return; }
    if (!window.confirm(`Run a profile backfill for ${eligibleCount.toLocaleString()} eligible locations?`)) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/location-tools/search-profiles/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "all_eligible", filters: {}, configuration: { batchSize: 50, maxRetries: 3, force: false, dryRun: false, includeNeedsReview: true } }),
      });
      const data = (await response.json().catch(() => ({}))) as RunResponse;
      if (!response.ok || !data.run?.id) throw new Error(data.error ?? "Backfill run could not be created.");
      router.push(`/admin/dashboard/settings/location-tools/search-profiles/runs/${data.run.id}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Backfill failed."); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy || eligibleCount <= 0} onClick={backfill} className="rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-5 py-3 text-sm font-black text-white disabled:opacity-50">{busy ? "Starting…" : "Run Profile Backfill"}</button>
        <Link href="/admin/dashboard/settings/location-tools/search-profiles/review" className="rounded-full border border-amber-300/25 px-5 py-3 text-sm font-black text-amber-100">Open Review Queue</Link>
        <span className="text-xs text-white/50">{eligibleCount.toLocaleString()} eligible locations</span>
        {message ? <p className="w-full text-sm text-red-200">{message}</p> : null}
      </div>
      <SearchProfileBulkVerify isSuperadmin={isSuperadmin} />
    </div>
  );
}

export function ProfileAction({ locationId, hasProfile }: { locationId: string; hasProfile: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function rebuild() {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/admin/location-tools/search-profiles/${locationId}/rebuild`, { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Profile rebuild failed.");
      router.refresh();
    } catch (rebuildError) { setError(rebuildError instanceof Error ? rebuildError.message : "Profile rebuild failed."); }
    finally { setBusy(false); }
  }
  return (
    <div className="flex min-w-36 flex-col gap-2">
      <div className="flex items-center gap-2">
        <SearchProfileBulkCheckbox locationId={locationId} hasProfile={hasProfile} />
        {hasProfile ? <Link href={`/admin/dashboard/settings/location-tools/search-profiles/${locationId}`} className="rounded-full border border-emerald-300/25 px-3 py-1 text-xs font-black text-emerald-100">Review / Apply</Link> : null}
      </div>
      <button type="button" disabled={busy} onClick={rebuild} className="rounded-full border border-rose-300/20 px-3 py-1 text-xs font-black text-rose-100 disabled:opacity-50">{busy ? "Rebuilding…" : "Rebuild"}</button>
      {error ? <p className="mt-1 max-w-48 text-[10px] text-red-200">{error}</p> : null}
    </div>
  );
}
