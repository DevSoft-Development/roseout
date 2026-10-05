import type { Metadata } from "next";

import { getPublicStatusSummary, type PublicStatusTone } from "@/lib/status/public-status-v2";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "System Status",
  description: "Current and recent service health for TheOutHaven.",
  path: "/status",
});

const LABELS: Record<PublicStatusTone, string> = {
  operational: "Operational",
  degraded: "Degraded Performance",
  partial_outage: "Partial Outage",
  major_outage: "Major Outage",
  maintenance: "Maintenance",
  no_data: "Monitoring",
};

const DOT_CLASS: Record<PublicStatusTone, string> = {
  operational: "bg-emerald-500",
  degraded: "bg-amber-400",
  partial_outage: "bg-orange-500",
  major_outage: "bg-red-500",
  maintenance: "bg-sky-500",
  no_data: "bg-white/20",
};

const BAR_CLASS: Record<PublicStatusTone, string> = {
  operational: "bg-emerald-500",
  degraded: "bg-amber-400",
  partial_outage: "bg-orange-500",
  major_outage: "bg-red-500",
  maintenance: "bg-sky-500",
  no_data: "bg-white/10",
};

function headline(status: PublicStatusTone) {
  switch (status) {
    case "operational":
      return "All Systems Operational";
    case "degraded":
      return "Some Systems Degraded";
    case "partial_outage":
      return "Partial Service Outage";
    case "major_outage":
      return "Major Service Outage";
    case "maintenance":
      return "Scheduled Maintenance";
    default:
      return "System Monitoring Active";
  }
}

function statusTextClass(status: PublicStatusTone) {
  switch (status) {
    case "operational":
      return "text-emerald-300";
    case "degraded":
      return "text-amber-300";
    case "partial_outage":
      return "text-orange-300";
    case "major_outage":
      return "text-red-300";
    case "maintenance":
      return "text-sky-300";
    default:
      return "text-white/45";
  }
}

export default async function StatusPage() {
  const summary = await getPublicStatusSummary();

  const grouped = new Map<string, typeof summary.components>();
  for (const component of summary.components) {
    const current = grouped.get(component.group) || [];
    current.push(component);
    grouped.set(component.group, current);
  }

  return (
    <main className="min-h-dvh bg-[#050505] px-5 pb-24 pt-28 text-white sm:px-6 lg:px-8 lg:pt-32">
      <div className="mx-auto max-w-5xl">
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b0b0b]">
          <div className="border-b border-white/10 px-6 py-7 sm:px-8">
            <p className="text-xs font-black uppercase tracking-[0.28em] text-[#ff8a9b]">
              TheOutHaven Status
            </p>
            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-3xl font-black tracking-[-0.04em] sm:text-4xl">
                  {headline(summary.overallStatus)}
                </h1>
                <p className="mt-2 text-sm leading-6 text-white/45">
                  Live service health with availability history growing from the day tracking began, up to 90 days.
                </p>
              </div>
              <div className="inline-flex items-center gap-2 self-start rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-bold">
                <span className={`h-2.5 w-2.5 rounded-full ${DOT_CLASS[summary.overallStatus]}`} />
                <span className={statusTextClass(summary.overallStatus)}>
                  {LABELS[summary.overallStatus]}
                </span>
              </div>
            </div>
          </div>

          <div className="px-6 py-3 text-xs text-white/35 sm:px-8">
            Updated {new Date(summary.generatedAt).toLocaleString("en-US", { timeZone: "America/New_York" })} ET
          </div>
        </section>

        {summary.incidents.length > 0 ? (
          <section className="mt-8 rounded-[1.75rem] border border-red-500/25 bg-red-500/[0.06] p-6 sm:p-7">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-red-300">Active incident</p>
            <div className="mt-4 space-y-5">
              {summary.incidents.map((incident) => (
                <article key={incident.key}>
                  <h2 className="text-xl font-black">{incident.title}</h2>
                  {incident.detail ? (
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">{incident.detail}</p>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <div className="mt-8 space-y-6">
          {[...grouped.entries()].map(([group, components]) => (
            <section key={group} className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0b0b0b]">
              <div className="border-b border-white/10 px-6 py-4 sm:px-7">
                <h2 className="text-xs font-black uppercase tracking-[0.24em] text-white/45">{group}</h2>
              </div>

              <div className="divide-y divide-white/10">
                {components.map((component) => (
                  <article key={component.slug} className="px-6 py-6 sm:px-7">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT_CLASS[component.status]}`} />
                        <h3 className="text-base font-black">{component.label}</h3>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <span className={`font-bold ${statusTextClass(component.status)}`}>
                          {LABELS[component.status]}
                        </span>
                        <span className="text-white/25">•</span>
                        <span className="font-bold tabular-nums text-white/45">
                          {component.operationalPercent === null
                            ? "Collecting history"
                            : `${component.operationalPercent.toFixed(2)}%`}
                        </span>
                      </div>
                    </div>

                    <div className="mt-5">
                      {component.history.length ? (
                        <>
                          <div
                            className="grid gap-[2px]"
                            style={{
                              gridTemplateColumns: `repeat(${component.history.length}, minmax(2px, 1fr))`,
                            }}
                          >
                            {component.history.map((day) => (
                              <div
                                key={day.date}
                                className={`h-8 rounded-[2px] ${BAR_CLASS[day.status]}`}
                                title={`${day.date}: ${LABELS[day.status]}`}
                                aria-label={`${component.label} on ${day.date}: ${LABELS[day.status]}`}
                              />
                            ))}
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-white/25">
                            <span>
                              Tracking since {new Date(`${component.history[0].date}T12:00:00Z`).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                timeZone: "UTC",
                              })}
                            </span>
                            <span>{component.history.length} of 90 days tracked</span>
                          </div>
                        </>
                      ) : (
                        <p className="text-sm font-bold text-white/30">Monitoring history starts when the first service signal is recorded.</p>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="mt-8 rounded-[1.75rem] border border-white/10 bg-white/[0.025] p-6 sm:p-7">
          <h2 className="text-lg font-black">About these metrics</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/45">
            Service state is derived from TheOutHaven production release and incident monitoring.
            History begins on the first day a service has a recorded monitoring signal and grows
            until it reaches a rolling 90-day window.
          </p>
        </section>
      </div>
    </main>
  );
}
