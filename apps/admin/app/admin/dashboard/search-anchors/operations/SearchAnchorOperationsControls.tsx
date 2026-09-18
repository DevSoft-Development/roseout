"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SearchAnchorOperationsControls({
  failedCount,
  deadLetterCount,
}: {
  failedCount: number;
  deadLetterCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [batchSize, setBatchSize] = useState(100);

  async function act(action: "retry_failed" | "requeue_dead_letter" | "run_now" | "cleanup_history") {
    setBusy(action);
    setMessage("");
    try {
      const response = await fetch("/api/admin/search-anchors/reconciliation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, limit: batchSize, retentionDays: 90 }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Request failed.");

      if (action === "run_now") {
        setMessage("Processing finished: " + (payload.completed ?? 0) + " completed and " + (payload.failed ?? 0) + " failed.");
      } else if (action === "cleanup_history") {
        setMessage("Removed " + (payload.deleted ?? 0) + " completed history records older than " + (payload.retentionDays ?? 90) + " days.");
      } else {
        setMessage((payload.updated ?? 0) + " locations returned to the work queue.");
      }
      router.refresh();
    } catch (error: any) {
      setMessage(error?.message || "Could not update anchor operations.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
      <div className="grid gap-6 xl:grid-cols-3">
        <div>
          <h2 className="text-lg font-semibold">Process waiting locations</h2>
          <p className="mt-1 text-sm text-zinc-400">Create missing anchors and refresh changed anchors in a safe bounded batch.</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label className="text-sm text-zinc-400" htmlFor="anchor-batch-size">Locations per batch</label>
            <select id="anchor-batch-size" value={batchSize} onChange={(event) => setBatchSize(Number(event.target.value))} disabled={Boolean(busy)} className="rounded-xl border border-zinc-700 bg-black px-3 py-2 text-sm">
              {[25, 50, 100, 250].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
            <button disabled={Boolean(busy)} onClick={() => act("run_now")} className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">
              {busy === "run_now" ? "Processing…" : "Process next batch"}
            </button>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold">Resolve failed work</h2>
          <p className="mt-1 text-sm text-zinc-400">Retry locations after the underlying data or configuration issue has been corrected.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button disabled={!failedCount || Boolean(busy)} onClick={() => act("retry_failed")} className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">{busy === "retry_failed" ? "Retrying…" : "Retry failed (" + failedCount + ")"}</button>
            <button disabled={!deadLetterCount || Boolean(busy)} onClick={() => act("requeue_dead_letter")} className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">{busy === "requeue_dead_letter" ? "Returning…" : "Return stopped items (" + deadLetterCount + ")"}</button>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold">History retention</h2>
          <p className="mt-1 text-sm text-zinc-400">Keep active and failed work. Remove completed and cancelled event history older than 90 days.</p>
          <button disabled={Boolean(busy)} onClick={() => act("cleanup_history")} className="mt-4 rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">
            {busy === "cleanup_history" ? "Cleaning…" : "Clean old history"}
          </button>
        </div>
      </div>
      {message && <p className="mt-4 rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-zinc-300">{message}</p>}
    </section>
  );
}
