import type { Metadata } from "next";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";

export const metadata: Metadata = {
  title: "Platform Operations | Admin",
  description: "Unified release, recovery, and incident control center for TheOutHaven.",
};

export const dynamic = "force-dynamic";

type ReleaseRow = {
  release_id: string;
  git_sha: string;
  surface: string;
  provider: string;
  artifact_ref: string | null;
  environment: string;
  state: string;
  previous_good_release_id: string | null;
  runtime_version: string | null;
  azure_revision: string | null;
  aws_admin_image: string | null;
  aws_business_image: string | null;
  aws_reserve_image: string | null;
  worker_release: string | null;
  ios_build: string | null;
  android_build: string | null;
  ota_release: string | null;
  created_at: string;
  deployed_at: string | null;
  promoted_at: string | null;
  updated_at: string;
  rollback_reason: string | null;
};

type EventRow = {
  event_id: number;
  release_id: string;
  event_type: string;
  prior_state: string | null;
  new_state: string | null;
  source: string;
  provider: string | null;
  actor: string;
  reason: string | null;
  evidence: Record<string, unknown> | null;
  created_at: string;
};

type IncidentRow = {
  id: string;
  level: string;
  message: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function shortSha(value: string) {
  return value.slice(0, 12);
}

function stateTone(state: string): "green" | "amber" | "red" | "muted" {
  if (state === "STABLE" || state === "ROLLED_BACK") return "green";
  if (state === "FAILED" || state === "DEGRADED") return "red";
  if (["CANARY", "PROMOTING", "ROLLING_BACK", "CANDIDATE", "VALIDATING"].includes(state)) return "amber";
  return "muted";
}

function incidentState(row: IncidentRow) {
  return String(row.metadata?.state || (row.level === "critical" ? "open" : "recovered")).toLowerCase();
}

function releaseDetail(row: ReleaseRow) {
  return (
    row.azure_revision ||
    row.aws_admin_image ||
    row.aws_business_image ||
    row.aws_reserve_image ||
    row.worker_release ||
    row.ios_build ||
    row.android_build ||
    row.ota_release ||
    row.artifact_ref ||
    "—"
  );
}

export default async function PlatformOperationsPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.productionFinishLine);

  const db = await getAdminDatabaseClient();
  const [releaseResult, eventResult, incidentResult] = await Promise.all([
    db
      .from("platform_releases")
      .select("release_id,git_sha,surface,provider,artifact_ref,environment,state,previous_good_release_id,runtime_version,azure_revision,aws_admin_image,aws_business_image,aws_reserve_image,worker_release,ios_build,android_build,ota_release,created_at,deployed_at,promoted_at,updated_at,rollback_reason")
      .eq("environment", "production")
      .order("updated_at", { ascending: false })
      .limit(100),
    db
      .from("platform_release_events")
      .select("event_id,release_id,event_type,prior_state,new_state,source,provider,actor,reason,evidence,created_at")
      .order("created_at", { ascending: false })
      .limit(150),
    db
      .from("admin_system_logs")
      .select("id,level,message,metadata,created_at")
      .eq("category", "critical_alert")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const releases = (releaseResult.data || []) as ReleaseRow[];
  const events = (eventResult.data || []) as EventRow[];
  const incidents = (incidentResult.data || []) as IncidentRow[];

  const latestBySurface = new Map<string, ReleaseRow>();
  for (const release of releases) {
    const key = `${release.provider}:${release.surface}`;
    if (!latestBySurface.has(key)) latestBySurface.set(key, release);
  }
  const currentReleases = [...latestBySurface.values()];

  const latestIncidentByKey = new Map<string, IncidentRow>();
  for (const incident of incidents) {
    const key = String(incident.metadata?.incident_key || incident.message);
    if (!latestIncidentByKey.has(key)) latestIncidentByKey.set(key, incident);
  }
  const openIncidents = [...latestIncidentByKey.values()].filter(
    (incident) => incidentState(incident) === "open",
  );

  const recovering = currentReleases.filter((release) =>
    ["DEGRADED", "ROLLING_BACK", "FAILED"].includes(release.state),
  );
  const stable = currentReleases.filter((release) =>
    ["STABLE", "ROLLED_BACK"].includes(release.state),
  );

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Cloud & Platform"
        title="Platform Operations"
        subtitle="Unified release, recovery, and incident state across Azure, AWS, Supabase-backed release history, and mobile delivery."
        badge={
          <AdminStatusBadge tone={openIncidents.length || recovering.length ? "red" : "green"}>
            {openIncidents.length || recovering.length
              ? `${openIncidents.length + recovering.length} item(s) need attention`
              : "Platform stable"}
          </AdminStatusBadge>
        }
        actions={
          <>
            <AdminActionButton href="/admin/dashboard/infrastructure/operations" variant="primary">
              Refresh
            </AdminActionButton>
            <AdminActionButton href="/admin/dashboard/infrastructure/incidents">
              Critical Incidents
            </AdminActionButton>
          </>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Current surfaces", currentReleases.length, "Latest release per provider and surface"],
          ["Stable", stable.length, "Current releases in a proven state"],
          ["Recovery / failed", recovering.length, "Current releases needing operator attention"],
          ["Open incidents", openIncidents.length, "Five-minute AWS critical monitor"],
        ].map(([label, value, helper]) => (
          <article key={String(label)} className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">{label}</p>
            <p className="mt-2 text-3xl font-black">{value}</p>
            <p className="mt-1 text-xs text-white/45">{helper}</p>
          </article>
        ))}
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-black/25">
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="text-xl font-black">Current production releases</h2>
          <p className="mt-1 text-sm text-white/50">
            Latest release for every tracked Azure, AWS, worker, native-mobile, and runtime-patch surface.
          </p>
        </div>

        {releaseResult.error ? (
          <div className="p-5 text-sm font-bold text-amber-100">
            Release registry could not be loaded: {releaseResult.error.message}
          </div>
        ) : currentReleases.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-white/[0.04] text-[10px] font-black uppercase tracking-wider text-white/40">
                <tr>
                  <th className="px-5 py-3">Surface</th>
                  <th className="px-5 py-3">State</th>
                  <th className="px-5 py-3">Release</th>
                  <th className="px-5 py-3">Previous good</th>
                  <th className="px-5 py-3">Artifact / build</th>
                  <th className="px-5 py-3">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {currentReleases.map((release) => (
                  <tr key={release.release_id} className="align-top">
                    <td className="px-5 py-4">
                      <p className="font-black text-white">{release.surface}</p>
                      <p className="mt-1 text-xs font-bold uppercase text-white/35">{release.provider}</p>
                    </td>
                    <td className="px-5 py-4">
                      <AdminStatusBadge tone={stateTone(release.state)}>{release.state}</AdminStatusBadge>
                      {release.rollback_reason ? (
                        <p className="mt-2 max-w-xs text-xs text-rose-200/75">{release.rollback_reason}</p>
                      ) : null}
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-mono text-xs font-black text-white">{shortSha(release.git_sha)}</p>
                      <p className="mt-1 max-w-xs break-all text-[11px] text-white/35">{release.release_id}</p>
                    </td>
                    <td className="px-5 py-4 max-w-xs break-all text-xs text-white/55">
                      {release.previous_good_release_id || "Not set"}
                    </td>
                    <td className="px-5 py-4 max-w-md break-all text-xs leading-5 text-white/55">
                      {releaseDetail(release)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-xs font-bold text-white/45">
                      {formatDate(release.updated_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-white/50">No production releases are registered yet.</div>
        )}
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-black/25">
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="text-xl font-black">Release & recovery history</h2>
          <p className="mt-1 text-sm text-white/50">
            Append-only lifecycle events, canary transitions, failed deployments, and automatic recovery dispatches.
          </p>
        </div>

        {eventResult.error ? (
          <div className="p-5 text-sm font-bold text-amber-100">
            Release history could not be loaded: {eventResult.error.message}
          </div>
        ) : events.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-white/[0.04] text-[10px] font-black uppercase tracking-wider text-white/40">
                <tr>
                  <th className="px-5 py-3">Event</th>
                  <th className="px-5 py-3">State</th>
                  <th className="px-5 py-3">Release</th>
                  <th className="px-5 py-3">Actor</th>
                  <th className="px-5 py-3">Reason</th>
                  <th className="px-5 py-3">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {events.map((event) => (
                  <tr key={event.event_id} className="align-top">
                    <td className="px-5 py-4 font-black text-white">{event.event_type}</td>
                    <td className="px-5 py-4 text-xs text-white/55">
                      {event.prior_state || "—"} → {event.new_state || "—"}
                    </td>
                    <td className="px-5 py-4 max-w-sm break-all text-xs text-white/55">{event.release_id}</td>
                    <td className="px-5 py-4">
                      <p className="text-xs font-bold uppercase text-white/70">{event.actor}</p>
                      <p className="mt-1 text-[11px] text-white/35">{event.source}</p>
                    </td>
                    <td className="px-5 py-4 max-w-lg text-xs leading-5 text-white/55">{event.reason || "—"}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-xs font-bold text-white/45">
                      {formatDate(event.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-white/50">No release events have been recorded yet.</div>
        )}
      </section>

      <section className="rounded-3xl border border-white/10 bg-black/25 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">Recovery safety policy</h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-white/55">
              Automatic recovery is restricted to recent Azure consumer release failures with a proven previous-good release.
              Database promotion and failback remain guarded operator actions to prevent split-brain.
            </p>
          </div>
          <AdminActionButton href="/admin/dashboard/infrastructure/incidents">View incident history</AdminActionButton>
        </div>
      </section>
    </AdminPageShell>
  );
}
