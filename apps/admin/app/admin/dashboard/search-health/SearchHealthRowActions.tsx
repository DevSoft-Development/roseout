"use client";

import { useState } from "react";

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function safeDiagnostics(row: any) {
  return JSON.stringify(
    {
      id: row.id,
      created_at: row.created_at,
      source: row.source,
      route: row.route,
      raw_query: row.raw_query,
      normalized_query: row.normalized_query,
      search_type: row.search_type,
      primary_domain: row.primary_domain,
      restaurant_count: row.restaurant_count,
      activity_count: row.activity_count,
      pair_count: row.pair_count,
      result_count: row.result_count,
      success: row.success,
      had_issue: row.had_issue,
      issue_type: row.issue_type,
      issue_label: row.issue_label,
      no_results_reason: row.no_results_reason,
      no_pairs_reason: row.no_pairs_reason,
      timing_ms: row.timing_ms,
      speed_status: row.speed_status,
      metadata: row.metadata,
      debug: row.debug,
    },
    null,
    2,
  );
}

export default function SearchHealthRowActions({ row, onUpdated }: { row: any; onUpdated?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function markIncorrect() {
    setBusy(true);
    setMessage(null);
    try {
      const note = [
        "Incorrect result: live search passed automated health review but did not fulfill the requested domains.",
        `Query: ${row.raw_query ?? ""}`,
        `Counts: restaurants=${row.restaurant_count ?? 0}; activities=${row.activity_count ?? 0}; pairs=${row.pair_count ?? 0}`,
      ].join("\n");
      const response = await fetch("/api/admin/search-health/quality-review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          status: "false_positive",
          notes: note,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok !== true) {
        throw new Error(payload.error || "Could not mark result incorrect");
      }
      setMessage("Marked incorrect");
      onUpdated?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not mark result incorrect");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={async () => {
          await copyText(safeDiagnostics(row));
          setMessage("Diagnostics copied");
        }}
        className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-black text-white hover:bg-white/15"
      >
        Copy diagnostics
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={markIncorrect}
        className="rounded-xl border border-amber-300/25 bg-amber-500/15 px-3 py-2 text-xs font-black text-amber-100 hover:bg-amber-500/20 disabled:opacity-60"
      >
        {busy ? "Saving…" : "Mark incorrect result"}
      </button>
      {message ? <span className="text-xs font-semibold text-white/60">{message}</span> : null}
    </div>
  );
}
