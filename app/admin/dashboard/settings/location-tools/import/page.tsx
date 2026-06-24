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
    return await response.json();
  } catch {
    return { logs: [] };
  }
}

export default async function Page() {
  await requireAdminRole(["superadmin", "admin"]);
  const logs = await getLogs();

  return (
    <LocationToolShell title="Import" description="Run bounded Google, NYC Open Data, and OSM import jobs, then inspect recent import logs.">
      <ToolCard title="Google Places Import" description="Import restaurants and activities by market, category, hours, and quality requirements.">
        <GoogleImportFormClient />
      </ToolCard>

      <ToolCard title="Other supported imports" description="Run small batches first. Imports can create or update location rows.">
        <ActionToolsClient
          warning="Run small batches first. Imports can create or update location rows."
          actions={[
            { label: "NYC restaurants import", endpoint: "/api/admin/location-growth/import-nyc-restaurants", body: { limit: 25, offset: 0 }, tone: "white" },
            { label: "OSM activity import", endpoint: "/api/admin/location-growth/import-osm-activities", body: { categoryGroup: "nightlife", limit: 10, offset: 0 }, tone: "emerald" },
            { label: "OSM dry run/test", endpoint: "/api/admin/location-growth/test-osm", body: { tagKey: "amenity", tagValue: "bar", bbox: "nyc", queryMode: "node_only" }, tone: "white" },
          ]}
        />
      </ToolCard>

      <ToolCard title="CSV import" description="No separate CSV upload component or API is present in this codebase. Use the Google, NYC, and OSM import actions on this page for supported admin imports.">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm font-bold text-white/55">
          CSV files are not accepted by the existing location import APIs exposed in this app.
        </div>
      </ToolCard>

      <ToolCard title="Recent import logs">
        <ImportLogsPanel logs={logs} />
      </ToolCard>
    </LocationToolShell>
  );
}


function ImportLogsPanel({ logs }: { logs: any }) {
  const rows = Array.isArray(logs?.logs) ? logs.logs : Array.isArray(logs) ? logs : [];
  if (!rows.length) return <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm font-bold text-white/45">No recent import logs found.</div>;
  return <div className="space-y-3">{rows.slice(0, 20).map((log: any, i: number) => {
    const status = log.status || (log.error ? "Failed" : log.partial ? "Partial" : log.success === true ? "Success" : "Unknown");
    const metrics = { inserted: log.inserted ?? log.inserted_count, updated: log.updated ?? log.updated_count, skipped: log.skipped ?? log.skipped_count, duplicates: log.duplicates ?? log.duplicate_count };
    return <article key={log.id || i} className="rounded-2xl border border-white/10 bg-black/25 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-widest text-white/40">{log.job_name || log.name || log.import_name || "Import job"}</p><h3 className="mt-1 font-black text-white">{log.summary || log.message || "Import log"}</h3><p className="mt-1 text-sm text-white/55">{log.created_at || log.run_date ? new Date(log.created_at || log.run_date).toLocaleString() : "No date"}</p></div><span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-white/75">{status}</span></div><div className="mt-3"><FriendlyKeyValueList data={metrics} /></div>{log.error ? <p className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm font-bold text-red-100">{log.error}</p> : null}<div className="mt-3"><JsonDeveloperDetails data={log} /></div></article>;
  })}</div>;
}
