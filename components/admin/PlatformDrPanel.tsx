"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlatformDrStatus, PlatformDrSurface } from "@/lib/aws/platform-dr-client";

type RoutedPlatformDrStatus = PlatformDrStatus & {
  routedProbe?: PlatformDrStatus["primary"];
};

type ControlResponse = {
  ok: boolean;
  configured?: boolean;
  confirmation?: string;
  status?: RoutedPlatformDrStatus | null;
  error?: string;
};

type LiveResult = {
  failoverMs: number;
  failbackMs: number;
  surfaces: { path: string; ok: boolean; status: number; redirected: boolean }[];
};

type LiveDrillPhase =
  | "idle"
  | "arming"
  | "waiting_aws"
  | "checking_surfaces"
  | "failing_back"
  | "waiting_vercel"
  | "complete"
  | "failed";

const DEFAULT_CONFIRMATION = "LIVE PLATFORM FAILOVER";

const LIVE_DRILL_PROGRESS: Record<LiveDrillPhase, { progress: number; title: string; detail: string }> = {
  idle: {
    progress: 0,
    title: "Ready to start",
    detail: "The drill has not started. Production is still using the current primary routing state.",
  },
  arming: {
    progress: 10,
    title: "Starting protected failover",
    detail: "Checking AWS standby readiness and writing the expiring failover override.",
  },
  waiting_aws: {
    progress: 35,
    title: "Waiting for Route 53 to move traffic to AWS",
    detail: "The AWS control plane is independently probing the public Route 53 hostname so browser DNS caching cannot hide the switchover.",
  },
  checking_surfaces: {
    progress: 55,
    title: "Validating AWS production surfaces",
    detail: "Checking the public site, admin login, and location dashboard against the healthy AWS standby after the public hostname reaches AWS.",
  },
  failing_back: {
    progress: 72,
    title: "Clearing the failover override",
    detail: "The AWS-side override is being removed so Route 53 can restore Vercel as the primary.",
  },
  waiting_vercel: {
    progress: 90,
    title: "Waiting for Vercel recovery",
    detail: "The AWS control plane is independently confirming that the public hostname has returned to Vercel.",
  },
  complete: {
    progress: 100,
    title: "Live failover drill complete",
    detail: "AWS takeover and the return to Vercel were both verified successfully.",
  },
  failed: {
    progress: 100,
    title: "Drill stopped safely",
    detail: "The drill did not complete. Automatic failback was attempted and the expiring override remains the final safety net.",
  },
};

function badge(ok: boolean) {
  return ok
    ? "border-emerald-300/25 bg-emerald-500/10 text-emerald-100"
    : "border-rose-300/25 bg-rose-500/10 text-rose-100";
}

function probeLabel(probe: PlatformDrStatus["primary"]) {
  if (probe.healthy) return `${probe.latencyMs ?? "—"} ms`;
  return probe.error || (probe.status ? `HTTP ${probe.status}` : "Unavailable");
}

function SurfaceCard({ surface }: { surface: PlatformDrSurface }) {
  return (
    <article className="rounded-3xl border border-white/10 bg-black/20 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-white/35">{surface.key}</p>
          <h3 className="mt-1 text-lg font-black text-white">{surface.label}</h3>
          <p className="mt-1 text-xs font-semibold text-white/35">{surface.path}</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${badge(surface.primary.healthy && surface.standby.healthy)}`}>
          {surface.primary.healthy && surface.standby.healthy ? "ready" : "attention"}
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-white/35">Vercel primary</p>
          <p className={`mt-1 text-sm font-black ${surface.primary.healthy ? "text-emerald-200" : "text-rose-200"}`}>{probeLabel(surface.primary)}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-white/35">AWS standby</p>
          <p className={`mt-1 text-sm font-black ${surface.standby.healthy ? "text-emerald-200" : "text-rose-200"}`}>{probeLabel(surface.standby)}</p>
        </div>
      </div>
    </article>
  );
}

async function callControl(body?: Record<string, unknown>) {
  const response = await fetch("/api/admin/platform-dr", {
    method: body ? "POST" : "GET",
    cache: "no-store",
    credentials: "same-origin",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({})) as ControlResponse;
  if (!response.ok || !data.ok) throw new Error(data.error || "Platform DR request failed.");
  return data;
}

async function waitForOrigin(expected: string, timeoutMs = 90_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const data = await callControl();
      const routedStatus = data.status || null;
      if (routedStatus?.routedProbe?.origin === expected) {
        return { elapsedMs: Date.now() - startedAt, status: routedStatus };
      }
    } catch {
      // The public route may be changing while the control plane remains healthy. Keep checking until the deadline.
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`Timed out waiting for production traffic to reach ${expected}.`);
}

function verifyProductionSurfaces(status: RoutedPlatformDrStatus, expectedOrigin: "aws-dr" | "vercel") {
  const paths = ["/", "/admin/login", "/locations/dashboard"];
  const side = expectedOrigin === "aws-dr" ? "standby" : "primary";
  return paths.map((path) => {
    const surface = status.surfaces.find((candidate) => candidate.path === path);
    const probe = surface?.[side];
    return {
      path,
      ok: Boolean(probe?.healthy),
      status: probe?.status ?? 0,
      redirected: false,
    };
  });
}

export function PlatformDrPanel() {
  const [status, setStatus] = useState<RoutedPlatformDrStatus | null>(null);
  const [configured, setConfigured] = useState(false);
  const [confirmationPhrase, setConfirmationPhrase] = useState(DEFAULT_CONFIRMATION);
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(true);
  const [operation, setOperation] = useState<"simulate" | "live" | "failback" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveResult, setLiveResult] = useState<LiveResult | null>(null);
  const [livePhase, setLivePhase] = useState<LiveDrillPhase>("idle");
  const [liveStartedAt, setLiveStartedAt] = useState<number | null>(null);
  const [liveElapsedSeconds, setLiveElapsedSeconds] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const data = await callControl();
      setConfigured(Boolean(data.configured));
      setConfirmationPhrase(data.confirmation || DEFAULT_CONFIRMATION);
      setStatus(data.status || null);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load platform DR status.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!liveStartedAt || livePhase === "idle" || livePhase === "complete" || livePhase === "failed") return;
    const updateElapsed = () => setLiveElapsedSeconds(Math.max(0, Math.floor((Date.now() - liveStartedAt) / 1000)));
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1_000);
    return () => window.clearInterval(timer);
  }, [livePhase, liveStartedAt]);

  const allReady = useMemo(() => Boolean(
    status?.primary.healthy
      && status?.standby.healthy
      && status.compute.runningTasks >= 1
      && status.compute.healthyTargets >= 1
      && status.surfaces.every((surface) => surface.primary.healthy && surface.standby.healthy),
  ), [status]);

  const liveProgress = LIVE_DRILL_PROGRESS[livePhase];
  const routedOrigin = status?.routedProbe?.origin;
  const routingLabel = routedOrigin === "aws-dr" ? "AWS DR" : routedOrigin === "vercel" ? "Vercel" : "Checking";

  async function runSimulation() {
    setOperation("simulate");
    setError(null);
    setMessage(null);
    try {
      const data = await callControl({ action: "simulate" });
      setStatus(data.status || null);
      setMessage("Readiness test completed. No production routing was changed.");
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Readiness test failed.");
    } finally {
      setOperation(null);
    }
  }

  async function runLiveDrill() {
    const drillStartedAt = Date.now();
    setOperation("live");
    setError(null);
    setMessage(null);
    setLiveResult(null);
    setLivePhase("arming");
    setLiveStartedAt(drillStartedAt);
    setLiveElapsedSeconds(0);
    let started = false;
    try {
      await callControl({ action: "start_live", confirmation, durationSeconds: 180 });
      started = true;
      setLivePhase("waiting_aws");
      const awsRoute = await waitForOrigin("aws-dr");
      setStatus(awsRoute.status);
      if (awsRoute.status.routedProbe?.revision !== awsRoute.status.standby.revision) {
        throw new Error("Public traffic reached AWS, but the routed revision did not match the validated standby revision.");
      }
      setLivePhase("checking_surfaces");
      const surfaces = verifyProductionSurfaces(awsRoute.status, "aws-dr");
      if (surfaces.some((surface) => !surface.ok)) {
        throw new Error("AWS failover was reached, but one or more production surfaces returned a server error.");
      }
      setLivePhase("failing_back");
      await callControl({ action: "failback", confirmation });
      started = false;
      setLivePhase("waiting_vercel");
      const vercelRoute = await waitForOrigin("vercel");
      setStatus(vercelRoute.status);
      if (vercelRoute.status.routedProbe?.revision !== vercelRoute.status.primary.revision) {
        throw new Error("Public traffic returned to Vercel, but the routed revision did not match the validated primary revision.");
      }
      setLiveResult({ failoverMs: awsRoute.elapsedMs, failbackMs: vercelRoute.elapsedMs, surfaces });
      setLiveElapsedSeconds(Math.max(0, Math.floor((Date.now() - drillStartedAt) / 1000)));
      setLivePhase("complete");
      setMessage(`Live failover drill passed. AWS takeover: ${(awsRoute.elapsedMs / 1000).toFixed(1)}s. Vercel recovery: ${(vercelRoute.elapsedMs / 1000).toFixed(1)}s.`);
      setConfirmation("");
      await refresh();
    } catch (runError) {
      if (started) {
        setLivePhase("failing_back");
        try { await callControl({ action: "failback", confirmation }); } catch { /* gateway expiry is the final safety net */ }
      }
      setLiveElapsedSeconds(Math.max(0, Math.floor((Date.now() - drillStartedAt) / 1000)));
      setLivePhase("failed");
      setError(runError instanceof Error ? runError.message : "Live platform failover drill failed.");
      await refresh();
    } finally {
      setOperation(null);
    }
  }

  async function forceFailback() {
    setOperation("failback");
    setError(null);
    try {
      const data = await callControl({ action: "failback", confirmation });
      setStatus(data.status || null);
      setMessage("Failover override cleared. Route 53 can return traffic to Vercel after health recovery.");
      setConfirmation("");
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Failback failed.");
    } finally {
      setOperation(null);
    }
  }

  if (loading) return <p className="text-sm text-white/45">Loading platform failover state…</p>;

  return (
    <div className="space-y-5">
      {!configured ? (
        <div className="rounded-3xl border border-amber-300/25 bg-amber-500/10 p-5 text-sm leading-6 text-amber-100/80">
          The control page is installed, but the AWS platform DR gateway has not been connected to this deployment yet. The AWS deployment workflow will populate the server-only gateway URL and secret.
        </div>
      ) : null}

      {error ? <div className="rounded-3xl border border-rose-300/25 bg-rose-500/10 p-5 text-sm font-bold text-rose-100">{error}</div> : null}
      {message ? <div className="rounded-3xl border border-emerald-300/25 bg-emerald-500/10 p-5 text-sm font-bold text-emerald-100">{message}</div> : null}

      {status ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4"><p className="text-[10px] font-black uppercase text-white/35">Overall</p><p className={`mt-2 text-xl font-black ${allReady ? "text-emerald-200" : "text-amber-200"}`}>{allReady ? "Ready" : "Attention"}</p></div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4"><p className="text-[10px] font-black uppercase text-white/35">Vercel</p><p className={`mt-2 text-xl font-black ${status.primary.healthy ? "text-emerald-200" : "text-rose-200"}`}>{status.primary.healthy ? "Healthy" : "Failed"}</p></div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4"><p className="text-[10px] font-black uppercase text-white/35">AWS standby</p><p className={`mt-2 text-xl font-black ${status.standby.healthy ? "text-emerald-200" : "text-rose-200"}`}>{status.standby.healthy ? "Healthy" : "Failed"}</p></div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4"><p className="text-[10px] font-black uppercase text-white/35">ECS tasks</p><p className="mt-2 text-xl font-black text-white">{status.compute.runningTasks}/{status.compute.desiredTasks}</p></div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4"><p className="text-[10px] font-black uppercase text-white/35">Routing</p><p className={`mt-2 text-xl font-black ${routingLabel === "Vercel" ? "text-emerald-200" : routingLabel === "AWS DR" ? "text-amber-200" : "text-white/60"}`}>{routingLabel}</p></div>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            {status.surfaces.map((surface) => <SurfaceCard key={surface.key} surface={surface} />)}
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200">Safe readiness check</p>
                <h2 className="mt-1 text-2xl font-black text-white">Test both platforms without switching traffic</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">Probes the public site, admin login, and location dashboard against both the Vercel primary and AWS warm standby, plus ECS target health. It makes no DNS or failover-state changes.</p>
              </div>
              <button onClick={runSimulation} disabled={!configured || Boolean(operation)} className="rounded-2xl border border-white/15 bg-white/[0.06] px-5 py-3 text-sm font-black text-white transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-40">
                {operation === "simulate" ? "Testing…" : "Run readiness test"}
              </button>
            </div>
          </section>

          <section className="rounded-3xl border border-rose-300/30 bg-rose-500/[0.06] p-5">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200">Live production drill</p>
            <h2 className="mt-1 text-2xl font-black text-white">Force the real Route 53 failover path</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-white/55">Temporarily marks the Vercel primary unhealthy through the AWS health controller, waits for Route 53 to move the real production domains to AWS, verifies all three surfaces, then clears the override and measures recovery back to Vercel. The override self-expires even if this browser closes.</p>

            <div className={`mt-5 rounded-2xl border p-4 ${livePhase === "failed" ? "border-rose-300/25 bg-rose-500/10" : livePhase === "complete" ? "border-emerald-300/25 bg-emerald-500/10" : "border-white/10 bg-black/20"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">Live drill progress</p>
                  <p className="mt-1 text-sm font-black text-white">{liveProgress.title}</p>
                  <p className="mt-1 max-w-3xl text-xs leading-5 text-white/50">{liveProgress.detail}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-black text-white">{liveProgress.progress}%</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/35">{liveElapsedSeconds}s elapsed</p>
                </div>
              </div>
              <div className="mt-4 h-3 overflow-hidden rounded-full border border-white/10 bg-black/40" role="progressbar" aria-label="Live failover drill progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={liveProgress.progress}>
                <div
                  className={`h-full rounded-full transition-[width] duration-500 ${livePhase === "failed" ? "bg-rose-400" : livePhase === "complete" ? "bg-emerald-400" : "bg-white"}`}
                  style={{ width: `${liveProgress.progress}%` }}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[10px] font-bold uppercase tracking-wider text-white/35">
                <span>AWS transition window: up to 90s</span>
                <span>Override safety expiry: 180s</span>
                <span>Automatic failback on error</span>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-rose-300/20 bg-black/20 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-rose-200">Required confirmation</p>
              <code className="mt-2 block select-all rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm font-black text-white">{confirmationPhrase}</code>
              <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Type confirmation phrase" className="mt-3 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-white/25 focus:border-rose-300/40" />
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button onClick={runLiveDrill} disabled={!configured || !allReady || confirmation !== confirmationPhrase || Boolean(operation)} className="rounded-2xl border border-rose-300/30 bg-rose-500/20 px-5 py-3 text-sm font-black text-rose-100 transition hover:bg-rose-500/30 disabled:cursor-not-allowed disabled:opacity-40">
                {operation === "live" ? "Running live failover…" : "Run live failover test"}
              </button>
              <button onClick={forceFailback} disabled={!configured || status.state.mode !== "forced_failover" || confirmation !== confirmationPhrase || Boolean(operation)} className="rounded-2xl border border-emerald-300/25 bg-emerald-500/10 px-5 py-3 text-sm font-black text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40">
                {operation === "failback" ? "Clearing failover…" : "Emergency fail back to Vercel"}
              </button>
            </div>

            {liveResult ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className="rounded-2xl border border-white/10 p-3"><p className="text-[10px] font-black uppercase text-white/35">AWS takeover</p><p className="mt-1 text-xl font-black text-white">{(liveResult.failoverMs / 1000).toFixed(1)}s</p></div>
                <div className="rounded-2xl border border-white/10 p-3"><p className="text-[10px] font-black uppercase text-white/35">Vercel restore</p><p className="mt-1 text-xl font-black text-white">{(liveResult.failbackMs / 1000).toFixed(1)}s</p></div>
                {liveResult.surfaces.map((surface) => (
                  <div key={surface.path} className="rounded-2xl border border-white/10 p-3"><p className="truncate text-[10px] font-black uppercase text-white/35">{surface.path}</p><p className={`mt-1 text-sm font-black ${surface.ok ? "text-emerald-200" : "text-rose-200"}`}>{surface.ok ? `HTTP ${surface.status}` : "Failed"}</p></div>
                ))}
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}