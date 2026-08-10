import { requireAdminRole } from "@/lib/admin-auth";
import { LocationToolShell, ToolCard } from "@/components/admin/location-tools/LocationToolShell";
import { ActionToolsClient } from "@/components/admin/location-tools/ActionToolsClient";
import { GoogleImportFormClient } from "@/components/admin/location-tools/GoogleImportFormClient";
import { FriendlyKeyValueList, JsonDeveloperDetails } from "@/components/admin/FriendlyJsonView";

export const dynamic = "force-dynamic";

async function getLogs() {
  try {
    const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const response = await fetch(`${base}/api/admin/import-logs`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { logs: [], error: payload?.error || `Import logs request failed (${response.status}).` };
    }
    return payload;
  } catch (error) {
    return { logs: [], error: error instanceof Error ? error.message : "Import logs could not be loaded." };
  }
}

function asNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getRows(logs: any) {
  return Array.isArray(logs?.logs) ? logs.logs : Array.isArray(logs) ? logs : [];
}

function metricValue(log: any, keys: string[]) {
  for (const key of keys) {
    if (log?.[key] !== null && log?.[key] !== undefined) return asNumber(log[key]);
    if (log?.meta?.[key] !== null && log?.meta?.[key] !== undefined) return asNumber(log.meta[key]);
  }
  return 0;
}

function reasonValue(log: any, key: string) {
  const reasons = log?.failure_reasons || log?.meta?.failure_reasons || log?.meta?.skipped_by_reason || {};
  return asNumber(reasons?.[key]);
}

function summarize(rows: any[]) {
  return rows.slice(0, 30).reduce(
    (totals, log) => ({
      imported: totals.imported + metricValue(log, ["inserted", "inserted_count", "imported_count", "imported"]),
      duplicates: totals.duplicates + metricValue(log, ["duplicates", "duplicate_count", "skipped_duplicate"]),
      qualityRejected: totals.qualityRejected + reasonValue(log, "low_quality"),
      importErrors: totals.importErrors + metricValue(log, ["import_failed_count"]),
      needsReview: totals.needsReview + metricValue(log, ["needs_review_count"]),
    }),
    { imported: 0, duplicates: 0, qualityRejected: 0, importErrors: 0, needsReview: 0 },
  );
}

export default async function Page() {
  await requireAdminRole(["superadmin", "admin"]);
  const logs = await getLogs();
  const rows = getRows(logs);
  const totals = summarize(rows);
  const photoBacklog = asNumber(logs?.photo_backlog_count);
  const restaurantPhotoBacklog = asNumber(logs?.photo_backlog?.restaurants);
  const activityPhotoBacklog = asNumber(logs?.photo_backlog?.activities);

  return (
    <LocationToolShell
      title="Import Operations"
      description="Run bounded Google, NYC Open Data, and OSM imports, continue paused work, and review enrichment and publishing readiness."
    >
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard label="Imported" value={totals.imported} detail="Recent logged runs" />
        <MetricCard label="Duplicates blocked" value={totals.duplicates} detail="Existing records protected" />
        <MetricCard label="Quality rejected" value={totals.qualityRejected} detail="Skipped by quality gates" />
        <MetricCard
          label="Photo backlog"
          value={photoBacklog}
          detail={`${restaurantPhotoBacklog} restaurants · ${activityPhotoBacklog} activities`}
          warning={photoBacklog > 0}
        />
        <MetricCard label="Import errors" value={totals.importErrors} detail="True provider/import failures" danger={totals.importErrors > 0} />
        <MetricCard label="Needs review" value={totals.needsReview} detail="Manual review queue" warning={totals.needsReview > 0} />
      </section>

      {logs?.error ? (
        <div className="rounded-2xl border border-red-300/25 bg-red-500/10 p-4 text-sm font-bold text-red-100">
          KPI data could not be loaded: {String(logs.error)}
        </div>
      ) : null}

      {logs?.photo_backlog_error ? (
        <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm font-bold text-amber-50">
          Live photo backlog could not be loaded: {String(logs.photo_backlog_error)}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
        <ToolCard
          title="Google Places Import"
          description="Keep using the existing quality presets, market controls, continuation cursor, successful-location list, and duplicate review."
        >
          <GoogleImportFormClient />
        </ToolCard>

        <div className="space-y-5">
          <ToolCard title="Production readiness" description="A location is public-ready only after required enrichment succeeds.">
            <div className="space-y-2 text-sm font-bold text-white/70">
              {[
                "Correct market and valid coordinates",
                "Duplicate check cleared",
                "Business hours normalized",
                "Reservation status resolved",
                "Primary image cached in Supabase",
                "Canonical location synchronized",
                "Canonical search profile queued",
                "Quality and publishing gates passed",
              ].map((item) => (
                <div key={item} className="flex gap-3 rounded-xl border border-rose-300/15 bg-rose-500/[0.06] px-3 py-2.5">
                  <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-rose-400" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </ToolCard>

          <ToolCard title="Retry and repair" description="New imports cache photos automatically. These controls repair older or failed records.">
            <ActionToolsClient
              warning="Use bounded batches. Repair failed photos returns the live remaining backlog after each run."
              actions={[
                { label: "Retry Google import", endpoint: "/api/admin/run-google-import", body: { type: "both", limit: 5, maxQueries: 2, batch: "all", areas: "nyc" }, tone: "rose" },
                { label: "Repair failed photos", endpoint: "/api/admin/location-growth/repair-import-photo-failures", body: { limit: 25 }, tone: "white" },
                { label: "Enrich high-value locations", endpoint: "/api/admin/location-growth/enrich-high-value", body: { limit: 25 }, tone: "white" },
              ]}
            />
          </ToolCard>
        </div>
      </div>

      <ToolCard title="Other supported imports" description="The existing NYC Open Data and OSM components remain available.">
        <ActionToolsClient
          warning="Run small batches first. Imports can create or update location rows."
          actions={[
            { label: "NYC restaurants import", endpoint: "/api/admin/location-growth/import-nyc-restaurants", body: { limit: 25, offset: 0 }, tone: "white" },
            { label: "OSM activity import", endpoint: "/api/admin/location-growth/import-osm-activities", body: { categoryGroup: "nightlife", limit: 10, offset: 0 }, tone: "rose" },
            { label: "OSM dry run/test", endpoint: "/api/admin/location-growth/test-osm", body: { tagKey: "amenity", tagValue: "bar", bbox: "nyc", queryMode: "node_only" }, tone: "white" },
          ]}
        />
      </ToolCard>

      <ToolCard title="CSV import" description="No separate CSV upload component or API is present in the current codebase.">
        <div className="rounded-2xl border border-rose-300/10 bg-rose-500/[0.04] p-4 text-sm font-bold text-white/55">
          Continue using the supported Google, NYC Open Data, and OSM import actions on this page.
        </div>
      </ToolCard>

      <ToolCard title="Recent import runs" description="Import health is separated from photo-cache and quality-gate outcomes; raw JSON remains collapsed under Technical details.">
        <ImportLogsPanel logs={logs} />
      </ToolCard>
    </LocationToolShell>
  );
}

function MetricCard({ label, value, detail, danger = false, warning = false }: { label: string; value: number; detail: string; danger?: boolean; warning?: boolean }) {
  const tone = danger
    ? "border-red-400/25 bg-red-500/10"
    : warning
      ? "border-amber-300/20 bg-amber-400/10"
      : "border-rose-300/15 bg-[linear-gradient(145deg,rgba(236,11,91,.09),rgba(0,0,0,.28))]";

  return (
    <article className={`rounded-2xl border p-4 ${tone}`}>
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-rose-100/55">{label}</p>
      <p className="mt-2 text-3xl font-black text-white">{value.toLocaleString()}</p>
      <p className="mt-1 text-xs font-bold text-white/45">{detail}</p>
    </article>
  );
}

function ImportLogsPanel({ logs }: { logs: any }) {
  const rows = getRows(logs);
  if (!rows.length) {
    return <div className="rounded-2xl border border-rose-300/10 bg-rose-500/[0.04] p-4 text-sm font-bold text-white/45">No recent import logs found.</div>;
  }

  return (
    <div className="space-y-3">
      {rows.slice(0, 20).map((log: any, i: number) => {
        const status = log.status || log.run_status || log.meta?.run_status || (log.error ? "Failed" : "Unknown");
        const metrics = {
          checked: metricValue(log, ["checked", "checked_count"]),
          imported: metricValue(log, ["inserted", "inserted_count", "imported_count", "imported"]),
          updated: metricValue(log, ["updated", "updated_count"]),
          duplicates_blocked: metricValue(log, ["duplicates", "duplicate_count", "skipped_duplicate"]),
          quality_rejected: reasonValue(log, "low_quality"),
          images_cached: metricValue(log, ["images_cached_count"]),
          photo_issues_at_run: metricValue(log, ["image_cache_failed_count"]),
          import_errors: metricValue(log, ["import_failed_count"]),
          needs_review: metricValue(log, ["needs_review_count"]),
        };
        const failureReasons = log.failure_reasons || log.meta?.failure_reasons || log.meta?.skipped_by_reason;
        const photoErrors = Array.isArray(log.image_cache_errors) ? log.image_cache_errors : [];

        return (
          <article key={log.id || i} className="rounded-2xl border border-rose-300/10 bg-[linear-gradient(145deg,rgba(236,11,91,.05),rgba(0,0,0,.3))] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-rose-100/45">{log.job_name || log.name || log.import_name || "Import job"}</p>
                <h3 className="mt-1 font-black text-white">{log.summary || log.message || "Import run"}</h3>
                <p className="mt-1 text-sm text-white/55">
                  {log.created_at || log.run_date ? new Date(log.created_at || log.run_date).toLocaleString() : "No date"}
                  {log.market ? ` · ${log.market}` : ""}
                </p>
              </div>
              <span className="rounded-full border border-rose-300/15 bg-rose-500/10 px-3 py-1 text-xs font-black text-rose-100">{status}</span>
            </div>
            <div className="mt-3"><FriendlyKeyValueList data={metrics} /></div>
            {failureReasons && Object.keys(failureReasons).length ? (
              <div className="mt-3 rounded-xl border border-amber-300/15 bg-amber-400/10 p-3">
                <p className="text-xs font-black uppercase tracking-wider text-amber-100/70">Skipped or rejected</p>
                <div className="mt-2"><FriendlyKeyValueList data={failureReasons} /></div>
              </div>
            ) : null}
            {photoErrors.length ? (
              <div className="mt-3 rounded-xl border border-amber-300/15 bg-amber-400/10 p-3 text-sm font-bold text-amber-50/80">
                <p className="text-xs font-black uppercase tracking-wider text-amber-100/70">Photo cache errors from this run</p>
                <ul className="mt-2 space-y-1">
                  {photoErrors.slice(0, 5).map((message: string, index: number) => <li key={`${index}-${message}`}>{message}</li>)}
                </ul>
              </div>
            ) : null}
            {log.error && metricValue(log, ["import_failed_count"]) > 0 ? <p className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm font-bold text-red-100">{log.error}</p> : null}
            <div className="mt-3"><JsonDeveloperDetails data={log} /></div>
          </article>
        );
      })}
    </div>
  );
}
