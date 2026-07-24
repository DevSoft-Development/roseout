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
      const response = await fetch("/api/admin/workers/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobType, payload: { source: "admin_operations" } }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) setError(body.error || "Unable to enqueue worker.");
      else router.refresh();
    });
  }

  return <div className="flex flex-col items-end gap-1"><button type="button" onClick={run} disabled={disabled || pending} className="rounded-full bg-[#e1062a] px-4 py-2 text-xs font-black text-white shadow-lg shadow-red-950/30 transition hover:bg-[#ff2447] focus:outline-none focus:ring-2 focus:ring-red-300 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35">{pending ? "Queuing…" : disabled ? "Planned" : "Run now"}</button>{error ? <span role="alert" className="max-w-56 text-right text-xs text-red-300">{error}</span> : null}</div>;
}

export function JobActionButtons({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [grantRequired, setGrantRequired] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [runAfter, setRunAfter] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const canCancel = status === "queued" || status === "running";
  const canRetry = status === "failed" || status === "dead_letter" || status === "cancelled";

  function retry(options: { grant?: boolean; scheduled?: boolean } = {}) {
    setError(null); setMessage(null);
    let selectedRunAfter: string | undefined;
    if (options.scheduled) {
      const date = new Date(runAfter);
      if (!runAfter || Number.isNaN(date.getTime())) { setError("Choose a valid retry date and time."); return; }
      selectedRunAfter = date.toISOString();
    }
    startTransition(async () => {
      const body: Record<string, unknown> = {};
      if (options.grant) body.grant_attempt = true;
      if (selectedRunAfter) body.run_after = selectedRunAfter;
      const response = await fetch(`/api/admin/workers/jobs/${id}/retry`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (payload.code === "ATTEMPTS_EXHAUSTED") { setGrantRequired(true); setError("This job has used all allowed attempts. Grant one additional attempt to retry it."); return; }
        setError(payload.error || "Unable to retry job."); return;
      }
      setGrantRequired(false); setScheduleOpen(false); setRunAfter(""); setMessage(options.grant ? "Additional attempt granted and queued." : selectedRunAfter ? "Retry scheduled." : "Retry queued."); router.refresh();
    });
  }

  function cancel() {
    if (status === "running" && !confirmCancel) { setConfirmCancel(true); return; }
    setError(null); setMessage(null);
    startTransition(async () => {
      const response = await fetch(`/api/admin/workers/jobs/${id}/cancel`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "admin_cancelled" }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) setError(body.error || "Unable to cancel job.");
      else { setConfirmCancel(false); setMessage("Cancellation requested. Running jobs stop cooperatively at worker checkpoints."); router.refresh(); }
    });
  }

  return <div className="flex min-w-48 flex-col gap-2" aria-live="polite"><div className="flex flex-wrap gap-2">{canCancel ? <button type="button" disabled={pending} onClick={cancel} className="rounded-full border border-white/15 px-3 py-1 text-xs font-bold text-white/75 hover:border-amber-300/50 hover:text-amber-100 disabled:opacity-50">{pending ? "Working…" : status === "running" && confirmCancel ? "Confirm cancel" : "Cancel"}</button> : null}{canRetry ? <button type="button" disabled={pending} onClick={() => retry({ grant: grantRequired })} className="rounded-full bg-white px-3 py-1 text-xs font-black text-black hover:bg-red-50 disabled:opacity-50">{pending ? "Retrying…" : grantRequired ? "Grant attempt & retry" : "Retry"}</button> : null}{canRetry ? <button type="button" disabled={pending} onClick={() => setScheduleOpen((value) => !value)} className="rounded-full border border-white/15 px-3 py-1 text-xs font-bold text-white/70 disabled:opacity-50">Schedule</button> : null}</div>{status === "running" && confirmCancel ? <p className="text-xs text-amber-200">Cancellation is cooperative and depends on worker checkpoint handling.</p> : null}{scheduleOpen ? <div className="rounded-xl border border-white/10 bg-black/40 p-2"><label className="text-[11px] font-semibold text-white/70">Retry at selected date/time<input type="datetime-local" value={runAfter} onChange={(event) => setRunAfter(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-950 px-2 py-1 text-xs text-white" /></label><button type="button" onClick={() => retry({ scheduled: true, grant: grantRequired })} disabled={pending} className="mt-2 rounded-full bg-[#e1062a] px-3 py-1 text-xs font-black text-white disabled:opacity-50">Retry at time</button></div> : null}{grantRequired ? <p className="text-xs text-amber-200">This job has used all allowed attempts. Grant one additional attempt to retry it.</p> : null}{message ? <span className="text-xs text-emerald-300">{message}</span> : null}{error ? <span role="alert" className="text-xs text-red-300">{error}</span> : null}</div>;
}
