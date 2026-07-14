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

  async function act(action: "retry_failed" | "requeue_dead_letter") {
    setBusy(action);
    setMessage("");
    try {
      const response = await fetch("/api/admin/search-anchors/reconciliation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Request failed.");
      setMessage(`${payload.updated ?? 0} queue items updated.`);
      router.refresh();
    } catch (error: any) {
      setMessage(error?.message || "Could not update the reconciliation queue.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Recovery controls</h2>
          <p className="mt-1 text-sm text-zinc-400">Retry recoverable failures or deliberately return dead-letter items to the queue after reviewing the root cause.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button disabled={!failedCount || Boolean(busy)} onClick={() => act("retry_failed")} className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">{busy === "retry_failed" ? "Retrying…" : `Retry failed (${failedCount})`}</button>
          <button disabled={!deadLetterCount || Boolean(busy)} onClick={() => act("requeue_dead_letter")} className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">{busy === "requeue_dead_letter" ? "Requeuing…" : `Requeue dead letter (${deadLetterCount})`}</button>
        </div>
      </div>
      {message && <p className="mt-4 text-sm text-zinc-300">{message}</p>}
    </section>
  );
}
