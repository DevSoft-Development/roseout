"use client";

import { useEffect, useState } from "react";

type Payload = {
  validation: any | null;
  readiness: any | null;
  experiments: any[];
};

const decisions = ["better", "same", "worse", "unsafe", "needs_review"];

export default function SearchRankingShadowValidationClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");

  async function load() {
    const response = await fetch("/api/admin/search-ranking-shadow-reviews", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || "Could not load shadow validation");
    setData(payload);
  }

  useEffect(() => {
    load().catch((error) => setMessage(error.message));
  }, []);

  async function review(experimentId: string, decision: string) {
    setBusyId(experimentId);
    setMessage("");
    try {
      const response = await fetch("/api/admin/search-ranking-shadow-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ experiment_id: experimentId, decision, reason_tags: [] }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not save review");
      setMessage("Review saved.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save review");
    } finally {
      setBusyId("");
    }
  }

  const validation = data?.validation;
  const readiness = data?.readiness;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-rose-300">Phase 4D.7</div>
          <h2 className="mt-1 text-xl font-black text-white">Shadow validation</h2>
          <p className="mt-1 text-sm text-white/60">Review control versus hybrid ordering before any live admin canary.</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${readiness?.ready_for_admin_5 ? "bg-emerald-500/20 text-emerald-200" : "bg-amber-500/20 text-amber-200"}`}>
          {readiness?.ready_for_admin_5 ? "Ready for admin 5%" : "Not ready"}
        </span>
      </div>

      {message ? <p className="mt-3 text-sm text-amber-200">{message}</p> : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Shadow searches" value={validation?.shadow_searches ?? 0} />
        <Metric label="Reviewed" value={validation?.reviewed_searches ?? 0} />
        <Metric label="Changed order" value={percent(validation?.changed_order_rate)} />
        <Metric label="Worse" value={validation?.worse_reviews ?? 0} />
        <Metric label="Unsafe" value={validation?.unsafe_reviews ?? 0} />
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
        <div className="text-xs uppercase tracking-wider text-white/40">Readiness blockers</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {(readiness?.blocking_reasons || []).length
            ? readiness.blocking_reasons.map((reason: string) => <span key={reason} className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-white/70">{reason.replaceAll("_", " ")}</span>)
            : <span className="text-sm text-emerald-200">No blockers</span>}
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {(data?.experiments ?? []).map((experiment) => {
          const current = experiment.search_ranking_experiment_reviews?.[0]?.decision;
          return (
            <div key={experiment.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-white">{experiment.market || "Unknown market"}</div>
                  <div className="mt-1 text-xs text-white/40">{new Date(experiment.created_at).toLocaleString()} · {experiment.latency_ms ?? "—"} ms · {experiment.pair_count ?? 0} pairs</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {decisions.map((decision) => (
                    <button key={decision} disabled={busyId === experiment.id} onClick={() => review(experiment.id, decision)} className={`rounded-lg px-2.5 py-1.5 text-xs font-bold disabled:opacity-40 ${current === decision ? "bg-rose-600 text-white" : "border border-white/10 text-white/70"}`}>
                      {decision.replaceAll("_", " ")}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <Order label="Control restaurants" values={experiment.restaurant_control_order} />
                <Order label="Hybrid restaurants" values={experiment.restaurant_hybrid_order} />
                <Order label="Control activities" values={experiment.activity_control_order} />
                <Order label="Hybrid activities" values={experiment.activity_hybrid_order} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: unknown }) {
  return <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-xs uppercase text-white/40">{label}</div><div className="mt-1 text-lg font-black text-white">{String(value ?? "—")}</div></div>;
}

function Order({ label, values }: { label: string; values: unknown }) {
  const rows = Array.isArray(values) ? values : [];
  return <div><div className="text-xs uppercase text-white/40">{label}</div><div className="mt-1 break-all text-xs text-white/70">{rows.length ? rows.join(" → ") : "—"}</div></div>;
}

function percent(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${(parsed * 100).toFixed(1)}%` : "—";
}
