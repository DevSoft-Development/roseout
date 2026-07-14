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

  async function act(action: "retry_failed" | "requeue_dead_letter" | "run_now") {
    setBusy(action);
    setMessage("");
    try {
      const response = await fetch("/api/admin/search-anchors/reconciliation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, limit: batchSize }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Request failed.");

      if (action === "run_now") {
        setMessage(
          `Reconciliation finished: ${payload.claimed ?? 0} claimed, ${payload.completed ?? 0} completed, ${payload.failed ?? 0} failed.`,
        );
      } else {
        setMessage(`${payload.updated ?? 0} queue items updated.`);
      }
      router.refresh();
    } catch (error: any) {
      setMessage(error?.message || "Could not update the reconciliation queue.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="text-lg font-semibold">Run reconciliation</h2>
          <p className="mt-1 text-sm text-zinc-400">Process a bounded batch immediately using the same protected production cron workflow.</p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <label className="text-sm text-zinc-400" htmlFor="anchor-batch-size">Batch size</label>
            <select
              id="anchor-batch-size"
              value={batchSize}
              onChange={(event) => setBatchSize(Number(event.target.value))}
              disabled={Boolean(busy)}
              className="rounded-xl border border-zinc-700 bg-black px-3 py-2 text-sm"
            >
              {[25, 50, 100, 250].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
            <button
              disabled={Boolean(busy)}
              onClick={() => act("run_now")}
              className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy === "run_now" ? "Running…" : "Run reconciliation"}
            </button>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold">Recovery controls</h2>
          <p className="mt-1 text-sm text-zinc-400">Retry recoverable failures or deliberately return dead-letter items to the queue after reviewing the root cause.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button disabled={!failedCount || Boolean(busy)} onClick={() => act("retry_failed")} className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">{busy === "retry_failed" ? "Retrying…" : `Retry failed (${failedCount})`}</button>
            <button disabled={!deadLetterCount || Boolean(busy)} onClick={() => act("requeue_dead_letter")} className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">{busy === "requeue_dead_letter" ? "Requeuing…" : `Requeue dead letter (${deadLetterCount})`}</button>
          </div>
        </div>
      </div>
      {message && <p className="mt-4 text-sm text-zinc-300">{message}</p>}
    </section>
  );
}
