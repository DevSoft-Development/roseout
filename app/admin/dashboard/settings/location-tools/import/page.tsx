import { requireAdminRole } from "@/lib/admin-auth";
import { LocationToolShell, ToolCard } from "@/components/admin/location-tools/LocationToolShell";
import { ActionToolsClient } from "@/components/admin/location-tools/ActionToolsClient";
import { GoogleImportFormClient } from "@/components/admin/location-tools/GoogleImportFormClient";

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
        <pre className="max-h-[420px] overflow-auto rounded-2xl bg-black/50 p-4 text-xs text-white/70">
          {JSON.stringify(logs, null, 2)}
        </pre>
      </ToolCard>
    </LocationToolShell>
  );
}
