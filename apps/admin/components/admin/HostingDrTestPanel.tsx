"use client";

import { useEffect, useState } from "react";

type DrCheckStatus = "pass" | "warn" | "fail";

type DrCheck = {
  key: string;
  label: string;
  status: DrCheckStatus;
  detail: string;
};

type DrRun = {
  id: string;
  createdAt?: string;
  created_at?: string;
  mode: "simulation";
  status: DrCheckStatus;
  sourceNode?: string | null;
  targetNode?: string | null;
  siteCount?: number;
  passCount?: number;
  warnCount?: number;
  failCount?: number;
  summary: string;
  checks?: DrCheck[];
  results?: DrCheck[];
  site_count?: number;
  pass_count?: number;
  warn_count?: number;
  fail_count?: number;
};

type LiveDemoState = {
  locationId: string;
  name: string;
  websiteId: string;
  platformDomain: string;
  status: string;
  deploymentStatus: string;
  publishedVersion: number;
  currentNode: string | null;
  currentNodeRole: string | null;
  failedOver: boolean;
  sourceNode: string | null;
  lastDeployedAt: string | null;
};

function badge(status: DrCheckStatus) {
  if (status === "pass") return "border-emerald-300/25 bg-emerald-500/10 text-emerald-100";
  if (status === "warn") return "border-amber-300/25 bg-amber-500/10 text-amber-100";
  return "border-rose-300/25 bg-rose-500/10 text-rose-100";
}

function normalize(run: DrRun | null): DrRun | null {
  if (!run) return null;
  return {
    ...run,
    createdAt: run.createdAt || run.created_at,
    siteCount: run.siteCount ?? run.site_count ?? 0,
    passCount: run.passCount ?? run.pass_count ?? 0,
    warnCount: run.warnCount ?? run.warn_count ?? 0,
    failCount: run.failCount ?? run.fail_count ?? 0,
    checks: run.checks || run.results || [],
  };
}

export function HostingDrTestPanel() {
  const [run, setRun] = useState<DrRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<LiveDemoState | null>(null);
  const [liveConfirmation, setLiveConfirmation] = useState("");
  const [requiredConfirmation, setRequiredConfirmation] = useState("LIVE DR THEOUTHAVEN LOUNGE");
  const [liveRunning, setLiveRunning] = useState<"failover" | "failback" | null>(null);
  const [liveMessage, setLiveMessage] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/admin/hosting/dr-test", { cache: "no-store" }).then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Unable to load DR test history.");
        if (!cancelled) setRun(normalize(body.run));
      }),
      fetch("/api/admin/hosting/live-drill", { cache: "no-store" }).then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Unable to load live DR drill state.");
        if (!cancelled) {
          setLiveState(body.demo || null);
          if (body.confirmation) setRequiredConfirmation(body.confirmation);
        }
      }),
    ])
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Unable to load hosting DR state.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  async function execute() {
    setRunning(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/hosting/dr-test", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Hosting DR simulation failed.");
      setRun(normalize(body.run));
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Hosting DR simulation failed.");
    } finally {
      setRunning(false);
    }
  }

  async function executeLive(action: "failover" | "failback") {
    setLiveRunning(action);
    setLiveError(null);
    setLiveMessage(null);
    try {
      const response = await fetch("/api/admin/hosting/live-drill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, confirmation: liveConfirmation }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Live DR drill action failed.");
      setLiveState(body.state || null);
      setLiveConfirmation("");
      setLiveMessage(
        action === "failover"
          ? `LIVE FAILOVER COMPLETE: ${body.fromNode} → ${body.toNode}. Routing changed: ${body.routingChanged ? "yes" : "already pointed there"}.`
          : `LIVE FAILBACK COMPLETE: returned to ${body.toNode}. Routing changed: ${body.routingChanged ? "yes" : "already pointed there"}.`,
      );
    } catch (runError) {
      setLiveError(runError instanceof Error ? runError.message : "Live DR drill action failed.");
    } finally {
      setLiveRunning(null);
    }
  }

  const confirmationReady = liveConfirmation === requiredConfirmation;

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-200">Disaster recovery validation</p>
            <h2 className="mt-1 text-2xl font-black text-white">Hosting E2E failure simulation</h2>
            <p className="mt-2 max-w-3xl text-sm text-white/55">
              Simulates a primary web-node outage, validates exact-version Ohio takeover coverage, routing prerequisites, primary recovery, and automatic failback. This mode never changes live DNS, deploys a website, or reassigns a hosting node.
            </p>
          </div>
          <button
            type="button"
            onClick={execute}
            disabled={running}
            className="rounded-2xl border border-rose-300/25 bg-rose-500/15 px-5 py-3 text-sm font-black text-rose-100 transition hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? "Running simulation…" : "Run E2E DR Test"}
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4 text-sm text-amber-100/80">
          Real failover and DNS actions remain separate operations and require an explicit manual action. This panel is simulation-only.
        </div>

        {error ? <div className="mt-4 rounded-2xl border border-rose-300/25 bg-rose-500/10 p-4 text-sm font-bold text-rose-100">{error}</div> : null}
        {loading ? <p className="mt-4 text-sm text-white/45">Loading latest DR test result…</p> : null}

        {run ? (
          <div className="mt-5 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.16em] ${badge(run.status)}`}>{run.status}</span>
              <span className="text-sm font-black text-white">{run.summary}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div className="rounded-2xl border border-white/10 p-3"><p className="text-[10px] font-black uppercase text-white/35">Affected sites</p><p className="mt-1 text-xl font-black text-white">{run.siteCount ?? 0}</p></div>
              <div className="rounded-2xl border border-white/10 p-3"><p className="text-[10px] font-black uppercase text-white/35">Pass</p><p className="mt-1 text-xl font-black text-emerald-200">{run.passCount ?? 0}</p></div>
              <div className="rounded-2xl border border-white/10 p-3"><p className="text-[10px] font-black uppercase text-white/35">Warn</p><p className="mt-1 text-xl font-black text-amber-200">{run.warnCount ?? 0}</p></div>
              <div className="rounded-2xl border border-white/10 p-3"><p className="text-[10px] font-black uppercase text-white/35">Fail</p><p className="mt-1 text-xl font-black text-rose-200">{run.failCount ?? 0}</p></div>
              <div className="rounded-2xl border border-white/10 p-3"><p className="text-[10px] font-black uppercase text-white/35">Last run</p><p className="mt-1 text-sm font-black text-white">{run.createdAt ? new Date(run.createdAt).toLocaleString() : "Unknown"}</p></div>
            </div>

            <div className="space-y-2">
              {(run.checks || []).map((check) => (
                <div key={check.key} className="rounded-2xl border border-white/10 bg-black/15 p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${badge(check.status)}`}>{check.status}</span>
                    <p className="font-black text-white">{check.label}</p>
                  </div>
                  <p className="mt-2 text-sm text-white/50">{check.detail}</p>
                </div>
              ))}
            </div>
          </div>
        ) : !loading ? (
          <p className="mt-4 text-sm text-white/45">No DR simulation has been recorded yet.</p>
        ) : null}
      </section>

      <section className="rounded-3xl border border-rose-300/30 bg-rose-500/[0.06] p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-200">Manual production operation</p>
            <h2 className="mt-1 text-2xl font-black text-white">Controlled live DR drill — demo only</h2>
            <p className="mt-2 max-w-3xl text-sm text-white/55">
              Performs a real platform-wildcard routing change for the hidden TheOutHaven Lounge demo. The server rejects customer domains, public locations, non-demo locations, emergency deployment, and any target without the exact published replica.
            </p>
          </div>
          <span className="rounded-full border border-rose-300/30 bg-rose-500/15 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-rose-100">Live DNS</span>
        </div>

        {liveState ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-2xl border border-white/10 p-3"><p className="text-[10px] font-black uppercase text-white/35">Demo</p><p className="mt-1 text-sm font-black text-white">{liveState.name}</p></div>
            <div className="rounded-2xl border border-white/10 p-3"><p className="text-[10px] font-black uppercase text-white/35">Domain</p><p className="mt-1 truncate text-sm font-black text-white">{liveState.platformDomain}</p></div>
            <div className="rounded-2xl border border-white/10 p-3"><p className="text-[10px] font-black uppercase text-white/35">Version</p><p className="mt-1 text-xl font-black text-white">{liveState.publishedVersion}</p></div>
            <div className="rounded-2xl border border-white/10 p-3"><p className="text-[10px] font-black uppercase text-white/35">Current node</p><p className="mt-1 text-sm font-black text-white">{liveState.currentNode || "Unknown"}</p></div>
            <div className="rounded-2xl border border-white/10 p-3"><p className="text-[10px] font-black uppercase text-white/35">Drill state</p><p className={`mt-1 text-sm font-black ${liveState.failedOver ? "text-amber-200" : "text-emerald-200"}`}>{liveState.failedOver ? "On failover" : "On primary"}</p></div>
          </div>
        ) : <p className="mt-4 text-sm text-white/45">Live drill target is unavailable.</p>}

        <div className="mt-5 rounded-2xl border border-rose-300/20 bg-black/20 p-4">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-rose-200">Required confirmation</p>
          <p className="mt-2 text-sm text-white/55">Type the phrase exactly before either live action:</p>
          <code className="mt-2 block select-all rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm font-black text-white">{requiredConfirmation}</code>
          <input
            value={liveConfirmation}
            onChange={(event) => setLiveConfirmation(event.target.value)}
            placeholder="Type confirmation phrase"
            className="mt-3 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-white/25 focus:border-rose-300/40"
          />
        </div>

        {liveMessage ? <div className="mt-4 rounded-2xl border border-emerald-300/25 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-100">{liveMessage}</div> : null}
        {liveError ? <div className="mt-4 rounded-2xl border border-rose-300/25 bg-rose-500/10 p-4 text-sm font-bold text-rose-100">{liveError}</div> : null}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={!liveState || liveState.failedOver || !confirmationReady || Boolean(liveRunning)}
            onClick={() => executeLive("failover")}
            className="rounded-2xl border border-rose-300/30 bg-rose-500/20 px-5 py-3 text-sm font-black text-rose-100 transition hover:bg-rose-500/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {liveRunning === "failover" ? "Failing over…" : "Fail over demo to Ohio"}
          </button>
          <button
            type="button"
            disabled={!liveState || !liveState.failedOver || !confirmationReady || Boolean(liveRunning)}
            onClick={() => executeLive("failback")}
            className="rounded-2xl border border-emerald-300/25 bg-emerald-500/10 px-5 py-3 text-sm font-black text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {liveRunning === "failback" ? "Failing back…" : "Fail back demo to Virginia"}
          </button>
        </div>

        <p className="mt-4 text-xs font-semibold text-white/35">
          These buttons perform real routing changes. They are intentionally not chained together, and the API re-checks demo isolation and failover/failback prerequisites on every action.
        </p>
      </section>
    </div>
  );
}
