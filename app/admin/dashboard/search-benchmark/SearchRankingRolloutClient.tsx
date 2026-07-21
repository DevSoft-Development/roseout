"use client";

import { useEffect, useState } from "react";

type Payload = {
  settings: any;
  analytics: any[];
  recent: any[];
};

export default function SearchRankingRolloutClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch("/api/admin/search-ranking-rollout", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || "Could not load rollout controls");
    setData(payload);
  }

  useEffect(() => {
    load().catch((error) => setMessage(error.message));
  }, []);

  async function update(patch: Record<string, unknown>) {
    if (!data) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/search-ranking-rollout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data.settings, ...patch }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not update rollout");
      setMessage("Rollout settings updated.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update rollout");
    } finally {
      setBusy(false);
    }
  }

  const settings = data?.settings;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-rose-300">Phase 4D rollout</div>
          <h2 className="mt-1 text-xl font-black text-white">Hybrid ranking canary</h2>
          <p className="mt-1 max-w-2xl text-sm text-white/60">
            Deterministic assignment, experiment logging, and manual rollout controls. The control ranking path always remains available.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={() => update({ enabled: false, rollout_percent: 0 })} className="rounded-lg border border-red-400/40 px-3 py-2 text-sm font-bold text-red-100 disabled:opacity-50">Emergency disable</button>
          <button disabled={busy} onClick={() => update({ enabled: true, admin_only: true, rollout_percent: 5 })} className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Start admin 5%</button>
        </div>
      </div>

      {message ? <p className="mt-3 text-sm text-amber-200">{message}</p> : null}

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <Metric label="Status" value={settings?.enabled ? "Enabled" : "Disabled"} />
        <Metric label="Rollout" value={`${Number(settings?.rollout_percent || 0)}%`} />
        <Metric label="Audience" value={settings?.admin_only ? "Admins only" : "Eligible users"} />
        <Metric label="Markets" value={(settings?.eligible_markets || []).join(", ") || "All"} />
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
        <table className="min-w-full text-left text-sm">
          <thead className="bg-white/5 text-white/50"><tr><th className="p-3">Time</th><th className="p-3">Variant</th><th className="p-3">Market</th><th className="p-3">Rollout</th><th className="p-3">Pairs</th><th className="p-3">Latency</th></tr></thead>
          <tbody>
            {(data?.recent ?? []).map((row, index) => <tr key={`${row.created_at}-${index}`} className="border-t border-white/5 text-white/70"><td className="p-3">{new Date(row.created_at).toLocaleString()}</td><td className="p-3">{row.variant}</td><td className="p-3">{row.market || "—"}</td><td className="p-3">{row.rollout_percent}%</td><td className="p-3">{row.pair_count}</td><td className="p-3">{row.latency_ms ?? "—"}</td></tr>)}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="text-xs uppercase tracking-wider text-white/40">{label}</div><div className="mt-1 text-xl font-black text-white">{value}</div></div>;
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