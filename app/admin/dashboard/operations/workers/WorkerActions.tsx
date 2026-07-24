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

type JobActionButtonsProps = {
  id: string;
  status: string;
  attemptCount: number;
  maxAttempts: number;
};

export function JobActionButtons({ id, status, attemptCount, maxAttempts }: JobActionButtonsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [canGrantAttempt, setCanGrantAttempt] = useState(attemptCount >= maxAttempts);
  const canCancel = status === "queued" || status === "running";
  const canRetry = status === "failed" || status === "dead_letter" || status === "cancelled";

  function act(action: "cancel" | "retry", grantAttempt = false) {
    setError(null);
    startTransition(async () => {
      const response = await fetch(`/api/admin/workers/jobs/${id}/${action}`, {
        method: "POST",
        headers: action === "retry" ? { "Content-Type": "application/json" } : undefined,
        body: action === "retry" ? JSON.stringify({ grant_attempt: grantAttempt }) : undefined,
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (body.code === "ATTEMPTS_EXHAUSTED" && body.can_grant_attempt === true) {
          setCanGrantAttempt(true);
          setError("This job has used all attempts. Grant one additional attempt to retry it.");
        } else {
          setError(body.error || `Unable to ${action} job.`);
        }
        return;
      }

      setCanGrantAttempt(false);
      router.refresh();
    });
  }

  return (
    <div className="flex min-w-40 flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {canCancel ? <button disabled={pending} onClick={() => act("cancel")} className="rounded-full border border-white/15 px-3 py-1 text-xs font-bold text-white/70">Cancel</button> : null}
        {canRetry && !canGrantAttempt ? <button disabled={pending} onClick={() => act("retry")} className="rounded-full bg-white px-3 py-1 text-xs font-black text-black">{pending ? "Retrying…" : "Retry"}</button> : null}
        {canRetry && canGrantAttempt ? <button disabled={pending} onClick={() => act("retry", true)} className="rounded-full bg-[#e1062a] px-3 py-1 text-xs font-black text-white">{pending ? "Granting…" : "Grant attempt & retry"}</button> : null}
      </div>
      {canRetry && canGrantAttempt ? <span className="text-[11px] text-amber-300">Attempts exhausted ({attemptCount}/{maxAttempts}). This increases the limit by one.</span> : null}
      {error ? <span className="text-xs text-red-300">{error}</span> : null}
    </div>
  );
}
