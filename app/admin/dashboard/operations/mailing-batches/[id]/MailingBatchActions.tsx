"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Action = "queued" | "printed" | "mailed" | "completed" | "cancelled";

const LABELS: Record<Action, string> = {
  queued: "Move to queue",
  printed: "Mark printed",
  mailed: "Mark mailed",
  completed: "Complete batch",
  cancelled: "Cancel batch",
};

export default function MailingBatchActions({ batchId, status }: { batchId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const [message, setMessage] = useState("");

  async function run(action: Action) {
    if (action === "cancelled" && !window.confirm("Cancel this mailing batch? Only queued or printed items will be cancelled.")) return;
    if (action === "mailed" && !window.confirm("Mark this batch as mailed? This starts postcard response tracking for the batch.")) return;

    setBusy(action);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/mailing-batches/${batchId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Could not update mailing batch.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update mailing batch.");
    } finally {
      setBusy(null);
    }
  }

  const actions: Action[] = status === "queued"
    ? ["printed", "cancelled"]
    : status === "printed"
      ? ["mailed", "queued", "cancelled"]
      : status === "mailed"
        ? ["completed"]
        : [];

  if (!actions.length) return null;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void run(action)}
            className={action === "cancelled"
              ? "rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-2.5 text-sm font-black text-rose-100 disabled:opacity-50"
              : "rounded-xl bg-white px-4 py-2.5 text-sm font-black text-black disabled:opacity-50"}
          >
            {busy === action ? "Updating…" : LABELS[action]}
          </button>
        ))}
      </div>
      {message ? <p className="mt-3 rounded-xl border border-rose-400/25 bg-rose-500/10 p-3 text-sm font-bold text-rose-100">{message}</p> : null}
    </div>
  );
}
