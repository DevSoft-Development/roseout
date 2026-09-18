import type { Metadata } from "next";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

export const metadata: Metadata = {
  title: "Critical Incidents | Admin",
  description: "Critical platform incident and recovery history for TheOutHaven.",
};

export const dynamic = "force-dynamic";

type IncidentRow = {
  id: string;
  level: string;
  message: string;
  source: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function formatDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function incidentKey(row: IncidentRow) {
  return String(row.metadata?.incident_key || "unknown");
}

function incidentState(row: IncidentRow) {
  return String(
    row.metadata?.state || (row.level === "critical" ? "open" : "recovered"),
  ).toLowerCase();
}

function incidentTitle(row: IncidentRow) {
  const title = String(row.metadata?.title || "").trim();
  if (title) return title;
  return incidentKey(row)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (value) => value.toUpperCase());
}

function incidentDetail(row: IncidentRow) {
  const detail = String(row.metadata?.detail || "").trim();
  return detail || row.message;
}

function StatusBadge({
  state,
}: {
  state: "open" | "recovered";
}) {
  return (
    <span
      className={
        state === "open"
          ? "rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-1 text-xs font-black text-rose-100"
          : "rounded-full border border-emerald-300/20 bg-emerald-500/10 px-3 py-1 text-xs font-black text-emerald-100"
      }
    >
      {state === "open" ? "OPEN" : "RECOVERED"}
    </span>
  );
}

export default async function CriticalIncidentsPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.productionFinishLine);

  const { data, error } = await getAdminDatabaseClient()
    .from("admin_system_logs")
    .select("id,level,message,source,metadata,created_at")
    .eq("category", "critical_alert")
    .order("created_at", { ascending: false })
    .limit(200);

  const incidents = (data || []) as IncidentRow[];
  const latestByKey = new Map<string, IncidentRow>();
  for (const row of incidents) {
    const key = incidentKey(row);
    if (!latestByKey.has(key)) latestByKey.set(key, row);
  }

  const openNow = [...latestByKey.values()].filter(
    (row) => incidentState(row) === "open",
  );
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const last24h = incidents.filter((row) => {
    const value = new Date(row.created_at).getTime();
    return Number.isFinite(value) && value >= since;
  });
  const recoveries24h = last24h.filter(
    (row) => incidentState(row) === "recovered",
  );

  return (
    <main className="admin-page min-h-screen px-4 pb-14 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-300">
            System Health
          </p>
          <h1 className="mt-2 text-3xl font-black">Critical Incidents</h1>
          <p className="mt-2 max-w-3xl text-sm text-white/55">
            A durable history of critical platform incidents and recoveries
            recorded by the five-minute production monitor.
          </p>
          <a
            href="/admin/dashboard/infrastructure/incidents"
            className="mt-4 inline-flex rounded-full bg-rose-600 px-4 py-2 text-xs font-black"
          >
            Refresh
          </a>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            [
              "Open now",
              openNow.length,
              openNow.length
                ? "Critical conditions still active"
                : "No tracked critical incidents are open",
            ],
            ["Transitions · 24h", last24h.length, "Incident opens and recoveries"],
            [
              "Recoveries · 24h",
              recoveries24h.length,
              "Conditions returned to healthy",
            ],
            [
              "History shown",
              incidents.length,
              "Most recent 200 transitions",
            ],
          ].map(([label, value, helper]) => (
            <article
              key={String(label)}
              className="rounded-2xl border border-white/10 bg-black/25 p-4"
            >
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
                {label}
              </p>
              <p className="mt-2 text-3xl font-black">{value}</p>
              <p className="mt-1 text-xs text-white/45">{helper}</p>
            </article>
          ))}
        </section>

        {openNow.length ? (
          <section className="rounded-3xl border border-rose-400/40 bg-rose-950/20 p-5 sm:p-6">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-200">
              Open incidents
            </p>
            <div className="mt-4 space-y-3">
              {openNow.map((row) => (
                <article
                  key={row.id}
                  className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-black">{incidentTitle(row)}</p>
                      <p className="mt-2 text-sm leading-6 text-white/60">
                        {incidentDetail(row)}
                      </p>
                    </div>
                    <div className="text-right">
                      <StatusBadge state="open" />
                      <p className="mt-2 text-xs font-bold text-white/35">
                        {formatDate(row.created_at)}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : (
          <section className="rounded-3xl border border-emerald-300/20 bg-emerald-500/10 p-5">
            <p className="font-black text-emerald-100">
              No tracked critical incidents are currently open.
            </p>
            <p className="mt-2 text-sm text-emerald-100/70">
              CloudWatch remains the live alarm source; this page keeps the
              state-change history for operations review.
            </p>
          </section>
        )}

        <section className="overflow-hidden rounded-3xl border border-white/10 bg-black/25">
          <div className="border-b border-white/10 px-5 py-4">
            <h2 className="text-xl font-black">Incident history</h2>
            <p className="mt-1 text-sm text-white/50">
              Only state changes are recorded, so repeated healthy monitor runs
              do not create noise.
            </p>
          </div>

          {error ? (
            <div className="p-5 text-sm font-bold text-amber-100">
              Incident history could not be loaded: {error.message}
            </div>
          ) : incidents.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-white/[0.04] text-[10px] font-black uppercase tracking-wider text-white/40">
                  <tr>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Incident</th>
                    <th className="px-5 py-3">Details</th>
                    <th className="px-5 py-3">Source</th>
                    <th className="px-5 py-3">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {incidents.map((row) => {
                    const state =
                      incidentState(row) === "open" ? "open" : "recovered";
                    return (
                      <tr key={row.id} className="align-top">
                        <td className="px-5 py-4">
                          <StatusBadge state={state} />
                        </td>
                        <td className="px-5 py-4 font-black">
                          {incidentTitle(row)}
                        </td>
                        <td className="max-w-2xl px-5 py-4 leading-6 text-white/60">
                          {incidentDetail(row)}
                        </td>
                        <td className="px-5 py-4 text-white/45">
                          {row.source || "critical-platform-monitor"}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-xs font-bold text-white/45">
                          {formatDate(row.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-sm text-white/50">
              No critical incident transitions have been recorded yet. The next
              incident opening or recovery detected by the five-minute monitor
              will appear here.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
