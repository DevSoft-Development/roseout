"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function RunWorkerButton({ jobType, disabled = false }: { jobType: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    startTransition(async () => {
      const response = await fetch("/api/admin/workers/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobType, payload: { source: "admin_operations" } }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) setError(body.error || "Unable to enqueue worker.");
      else router.refresh();
    });
  }

  return <div className="flex flex-col items-end gap-1"><button type="button" onClick={run} disabled={disabled || pending} className="rounded-full bg-[#e1062a] px-4 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35">{pending ? "Queuing…" : disabled ? "Not connected" : "Run now"}</button>{error ? <span className="max-w-56 text-right text-xs text-red-300">{error}</span> : null}</div>;
}

export function JobActionButtons({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const canCancel = status === "queued" || status === "running";
  const canRetry = status === "failed" || status === "dead_letter" || status === "cancelled";

  function act(action: "cancel" | "retry") {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/admin/workers/jobs/${id}/${action}`, { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) setError(body.error || `Unable to ${action} job.`);
      else router.refresh();
    });
  }

  return <div className="flex min-w-32 flex-col gap-2"><div className="flex gap-2">{canCancel ? <button disabled={pending} onClick={() => act("cancel")} className="rounded-full border border-white/15 px-3 py-1 text-xs font-bold text-white/70">Cancel</button> : null}{canRetry ? <button disabled={pending} onClick={() => act("retry")} className="rounded-full bg-white px-3 py-1 text-xs font-black text-black">Retry</button> : null}</div>{error ? <span className="text-xs text-red-300">{error}</span> : null}</div>;
}
