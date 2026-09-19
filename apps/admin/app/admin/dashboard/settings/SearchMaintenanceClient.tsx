"use client";

import { useState } from "react";
import { SettingsControlCard, settingsPrimaryButtonClass, settingsSecondaryButtonClass } from "./SettingsControlPrimitives";

export default function SearchMaintenanceClient() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [cursor, setCursor] = useState<string | null>(null);

  async function run(next = false) {
    setLoading(true);
    const res = await fetch("/api/admin/locations/backfill-search-document", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "missing_only", limit: 250, nextCursor: next ? cursor : null }),
    });
    const data = await res.json();
    setResult(data);
    setCursor(data.nextCursor || null);
    setLoading(false);
  }

  return (
    <SettingsControlCard
      eyebrow="Search operations"
      title="Search Maintenance"
      description="Rebuild missing generated search documents used for fast location matching. This maintenance job does not use AI and does not overwrite profile fields."
      meta="Batch size · 250"
    >
      <div className="rounded-2xl border border-[var(--admin-shell-border)] bg-[var(--admin-shell-card-strong)] p-4">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--admin-shell-muted)]">Maintenance policy</p>
        <p className="mt-2 text-sm leading-6 text-[var(--admin-shell-soft)]">
          Safe to rerun. Only records missing a generated search document are targeted.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <button onClick={() => run(false)} disabled={loading} className={settingsPrimaryButtonClass}>
          {loading ? "Running…" : "Backfill search documents"}
        </button>
        {(cursor || Number(result?.remaining_count) > 0) ? (
          <button onClick={() => run(true)} disabled={loading} className={settingsSecondaryButtonClass}>
            Run next batch
          </button>
        ) : null}
      </div>

      {result ? (
        <div className="mt-4 grid gap-3 rounded-2xl border border-[var(--admin-shell-border)] bg-[var(--admin-shell-card-strong)] p-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Status", result.success ? "Success" : "Error"],
            ["Scanned", result.scanned],
            ["Updated", result.updated],
            ["Skipped", result.skipped],
            ["Failed", result.failed],
            ["Remaining", result.remaining_count ?? "Unknown"],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--admin-shell-muted)]">{label}</p>
              <p className="mt-1 text-sm font-black text-[var(--admin-shell-text)]">{String(value ?? 0)}</p>
            </div>
          ))}
          {result.error ? <p className="sm:col-span-3 lg:col-span-6 text-sm text-[var(--admin-shell-soft)]">{result.error}</p> : null}
        </div>
      ) : null}
    </SettingsControlCard>
  );
}
