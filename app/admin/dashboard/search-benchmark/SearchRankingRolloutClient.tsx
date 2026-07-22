"use client";

import { useEffect, useMemo, useState } from "react";

type Payload = {
  settings: any;
  analytics: any[];
  recent: any[];
  readiness: any | null;
  stages: any[];
  history: any[];
  internalCohortCount: number;
};

export default function SearchRankingRolloutClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");
  const [targetStage, setTargetStage] = useState("");

  async function load() {
    const response = await fetch("/api/admin/search-ranking-rollout", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || "Could not load rollout controls");
    setData(payload);
    setTargetStage(payload?.readiness?.next_stage || "");
  }

  useEffect(() => {
    load().catch((error) => setMessage(error.message));
  }, []);

  async function runAction(action: "activate" | "disable") {
    if (!reason.trim()) {
      setMessage("Enter a reason before changing rollout state.");
      return;
    }
    if (action === "activate" && !targetStage) {
      setMessage("Choose a target stage.");
      return;
    }

    const prompt = action === "disable"
      ? "Emergency disable the ranking rollout?"
      : `Activate ${targetStage}?`;
    if (!window.confirm(prompt)) return;

    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/search-ranking-rollout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: reason.trim(), target_stage_key: targetStage }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not update rollout stage");
      setMessage(action === "disable" ? "Rollout disabled." : `Stage changed to ${targetStage}.`);
      setReason("");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update rollout stage");
    } finally {
      setBusy(false);
    }
  }

  const settings = data?.settings;
  const readiness = data?.readiness;
  const currentStage = readiness?.current_stage || "disabled";
  const currentDefinition = useMemo(
    () => data?.stages?.find((stage) => stage.stage_key === currentStage),
    [data?.stages, currentStage],
  );

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-rose-300">Phase 4D rollout</div>
          <h2 className="mt-1 text-xl font-black text-white">Hybrid ranking rollout command center</h2>
          <p className="mt-1 max-w-2xl text-sm text-white/60">
            Stage changes use atomic server-side controls. Automatic promotion remains disabled.
          </p>
        </div>
        <button
          disabled={busy || currentStage === "disabled"}
          onClick={() => runAction("disable")}
          className="rounded-lg border border-red-400/40 px-3 py-2 text-sm font-bold text-red-100 disabled:opacity-40"
        >
          Emergency disable
        </button>
      </div>

      {message ? <p className="mt-3 text-sm text-amber-200">{message}</p> : null}

      <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Metric label="Current stage" value={currentStage} />
        <Metric label="Status" value={settings?.enabled || settings?.shadow_test_enabled ? "Active" : "Disabled"} />
        <Metric label="Rollout" value={`${Number(settings?.rollout_percent || 0)}%`} />
        <Metric label="Audience" value={currentDefinition?.audience_type || "disabled"} />
        <Metric label="Internal cohort" value={String(data?.internalCohortCount ?? 0)} />
        <Metric label="Markets" value={(settings?.eligible_markets || []).join(", ") || "All"} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-black uppercase text-white">Stage readiness</div>
              <p className="mt-1 text-sm text-white/50">Promotion is allowed only when observation, samples, and guardrails pass.</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${readiness?.ready_to_promote ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-500/20 text-amber-200"}`}>
              {readiness?.ready_to_promote ? "Ready to promote" : "Not ready"}
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Next stage" value={readiness?.next_stage || "—"} />
            <Stat label="Minutes in stage" value={number(readiness?.minutes_in_stage)} />
            <Stat label="Control samples" value={readiness?.control_sample_size ?? 0} />
            <Stat label="Hybrid samples" value={readiness?.hybrid_sample_size ?? 0} />
          </div>
          <div className="mt-4">
            <div className="text-xs uppercase tracking-wider text-white/40">Blocking reasons</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(readiness?.blocking_reasons || []).length
                ? readiness.blocking_reasons.map((item: string) => <span key={item} className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-white/70">{item.replaceAll("_", " ")}</span>)
                : <span className="text-sm text-emerald-200">No blockers</span>}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-sm font-black uppercase text-white">Change stage</div>
          <label className="mt-3 block text-xs uppercase tracking-wider text-white/40">Target stage</label>
          <select value={targetStage} onChange={(event) => setTargetStage(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white">
            <option value="">Select a stage</option>
            {(data?.stages ?? []).map((stage) => <option key={stage.stage_key} value={stage.stage_key}>{stage.stage_key} · {stage.rollout_percent}% · {stage.audience_type}</option>)}
          </select>
          <label className="mt-3 block text-xs uppercase tracking-wider text-white/40">Required reason</label>
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} placeholder="Why is this change being made?" className="mt-1 w-full rounded-lg border border-white/10 bg-black px-3 py-2 text-sm text-white placeholder:text-white/30" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button disabled={busy || !targetStage || targetStage === currentStage} onClick={() => runAction("activate")} className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-40">Apply stage</button>
            <button disabled={busy || currentStage === "disabled"} onClick={() => runAction("disable")} className="rounded-lg border border-red-400/40 px-3 py-2 text-sm font-bold text-red-100 disabled:opacity-40">Disable</button>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {(data?.analytics ?? []).map((row) => (
          <div key={row.variant} className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="text-sm font-black uppercase text-white">{row.variant}</div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <Stat label="Searches" value={row.searches} />
              <Stat label="No-result rate" value={percent(row.no_result_rate)} />
              <Stat label="Avg pairs" value={number(row.avg_pair_count)} />
              <Stat label="P95 latency" value={`${number(row.p95_latency_ms)} ms`} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 overflow-x-auto rounded-xl border border-white/10">
        <div className="border-b border-white/10 px-4 py-3 text-sm font-black uppercase text-white">Stage history</div>
        <table className="min-w-full text-left text-sm">
          <thead className="bg-white/5 text-white/50"><tr><th className="p-3">Time</th><th className="p-3">From</th><th className="p-3">To</th><th className="p-3">Change</th><th className="p-3">Reason</th></tr></thead>
          <tbody>
            {(data?.history ?? []).map((row, index) => <tr key={`${row.created_at}-${index}`} className="border-t border-white/5 text-white/70"><td className="p-3">{new Date(row.created_at).toLocaleString()}</td><td className="p-3">{row.from_stage_key || "—"}</td><td className="p-3">{row.to_stage_key}</td><td className="p-3">{row.change_type}</td><td className="p-3">{row.reason || "—"}</td></tr>)}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-xs uppercase tracking-wider text-white/40">{label}</div><div className="mt-1 break-words text-lg font-black text-white">{value}</div></div>;
}

function Stat({ label, value }: { label: string; value: unknown }) {
  return <div><div className="text-xs uppercase text-white/40">{label}</div><div className="mt-1 font-bold text-white">{String(value ?? "—")}</div></div>;
}

function percent(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${(parsed * 100).toFixed(1)}%` : "—";
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(1) : "—";
}
