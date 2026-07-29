"use client";
import { useState } from "react";

export default function ReplayRunnerClient() {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  async function run(source: "golden" | "production_replay") {
    if (!confirm(source === "golden" ? "Run the full golden query suite now?" : "Replay recent production searches against legacy and canonical retrieval?")) return;
    setBusy(source); setMessage("");
    try {
      const response = await fetch("/api/admin/search-quality/replay", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source, limit: 50 }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Replay failed.");
      setMessage(`Completed ${source.replace("_", " ")} run. Success ${Number(payload.metrics?.successRate ?? 0).toFixed(1)}%.`);
      window.location.reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Replay failed."); }
    finally { setBusy(null); }
  }
  return <section className="rounded-3xl border border-rose-400/25 bg-gradient-to-br from-[#24100f] via-[#160d0b] to-[#0d0908] p-6 shadow-[0_12px_32px_rgba(225,6,42,0.12)]"><h2 className="text-xl font-black">Run quality validation</h2><p className="mt-2 text-sm text-white/60">Both runs execute identical queries through legacy-only and canonical-primary retrieval, then persist comparisons and recalculate launch gates.</p><div className="mt-5 flex flex-wrap gap-3"><button disabled={busy !== null} onClick={() => run("golden")} className="rounded-full bg-[#e1062a] px-5 py-3 text-sm font-black disabled:opacity-50">{busy === "golden" ? "Running golden suite…" : "Run golden suite"}</button><button disabled={busy !== null} onClick={() => run("production_replay")} className="rounded-full border border-rose-300/25 px-5 py-3 text-sm font-black text-rose-100 disabled:opacity-50">{busy === "production_replay" ? "Replaying searches…" : "Replay recent production searches"}</button></div>{message ? <p className="mt-4 text-sm text-amber-100">{message}</p> : null}</section>;
}
