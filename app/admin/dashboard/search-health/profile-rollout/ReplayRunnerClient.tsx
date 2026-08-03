"use client";

import { useState } from "react";

export default function ReplayRunnerClient() {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function run(source: "golden" | "production_replay") {
    const confirmed = confirm(
      source === "golden"
        ? "Run the full golden query suite now?"
        : "Replay up to 100 recent production searches through normal, canonical, and strict canonical Search V2?",
    );
    if (!confirmed) return;

    setBusy(source);
    setMessage("");

    try {
      const endpoint = source === "production_replay"
        ? "/api/admin/search-quality/production-review"
        : "/api/admin/search-quality/replay";
      const body = source === "production_replay"
        ? { limit: 100, lookbackDays: 90 }
        : { source: "golden", limit: 50 };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const errorMessage = payload.message ?? payload.error ?? "Replay failed.";
        throw new Error(errorMessage);
      }

      if (source === "production_replay") {
        const largestCluster = payload.largestFailureCluster?.reason
          ? ` Largest failure cluster: ${payload.largestFailureCluster.reason}.`
          : "";
        setMessage(
          `Reviewed ${Number(payload.queryCount ?? 0)} production queries. `
          + `${Number(payload.passedCount ?? 0)} passed, ${Number(payload.failedCount ?? 0)} failed. `
          + `Canary ready: ${payload.canaryReady ? "yes" : "no"}.${largestCluster}`,
        );
      } else {
        setMessage(
          `Completed golden suite. Success ${Number(payload.metrics?.successRate ?? 0).toFixed(1)}%.`,
        );
      }

      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Replay failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-3xl border border-rose-400/25 bg-gradient-to-br from-[#24100f] via-[#160d0b] to-[#0d0908] p-6 shadow-[0_12px_32px_rgba(225,6,42,0.12)]">
      <h2 className="text-xl font-black">Run quality validation</h2>
      <p className="mt-2 text-sm text-white/60">
        The golden suite validates fixed benchmark prompts. Production replay uses real search logs and compares normal, canonical, and strict canonical Search V2 before allowing canary traffic.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          disabled={busy !== null}
          onClick={() => run("golden")}
          className="rounded-full bg-[#e1062a] px-5 py-3 text-sm font-black disabled:opacity-50"
        >
          {busy === "golden" ? "Running golden suite…" : "Run golden suite"}
        </button>
        <button
          disabled={busy !== null}
          onClick={() => run("production_replay")}
          className="rounded-full border border-rose-300/25 px-5 py-3 text-sm font-black text-rose-100 disabled:opacity-50"
        >
          {busy === "production_replay" ? "Replaying searches…" : "Replay recent production searches"}
        </button>
      </div>
      {message ? <p className="mt-4 text-sm text-amber-100">{message}</p> : null}
    </section>
  );
}
