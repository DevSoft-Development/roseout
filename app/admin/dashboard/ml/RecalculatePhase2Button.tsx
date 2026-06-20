"use client";
import { useState } from "react";

export function RecalculatePhase2Button() {
  const [status, setStatus] = useState("");
  const [running, setRunning] = useState(false);

  async function runPhase2() {
    setRunning(true);
    setStatus("Running Phase 2 recalculation...");
    try {
      const res = await fetch("/api/admin/ml/recalculate-phase2", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      setStatus(
        res.ok
          ? `Done: ${data.updatedLocationIntents || 0} location intents, ${data.updatedPairs || 0} pairs updated.`
          : `Failed: ${data.error || res.status}`,
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={runPhase2}
        disabled={running}
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#ec0b5b] px-4 py-2 text-sm font-black text-white shadow-lg shadow-rose-950/30 hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {running ? "Running..." : "Run Phase 2 scoring"}
      </button>
      {status ? <p className="text-xs font-bold text-white/60">{status}</p> : null}
    </div>
  );
}
