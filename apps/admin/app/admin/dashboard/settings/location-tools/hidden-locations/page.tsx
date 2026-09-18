import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { LocationToolShell } from "@/components/admin/location-tools/LocationToolShell";
import { HiddenLocationsRepairClient } from "@/components/admin/location-tools/HiddenLocationsRepairClient";

export const dynamic = "force-dynamic";

export default async function HiddenLocationsPage() {
  await requireAdminRole(["superadmin", "admin"]);

  const adminDb = getAdminDatabaseClient();
  const [hidden, notSearchable, lowLevel, contradictory] = await Promise.all([
    adminDb.from("locations").select("id", { count: "exact", head: true }).eq("is_hidden", true),
    adminDb.from("locations").select("id", { count: "exact", head: true }).eq("is_searchable", false),
    adminDb.from("locations").select("id", { count: "exact", head: true }).eq("is_low_level", true),
    adminDb.from("locations").select("id", { count: "exact", head: true }).eq("is_hidden", true).eq("is_searchable", true),
  ]);

  return (
    <LocationToolShell
      title="Hidden Locations Repair"
      description="Review hidden, low-level, and non-searchable locations. Select individual records or use bounded bulk actions to unhide or make eligible records searchable. Unsafe records are skipped with exact blocking reasons."
      stats={[
        { label: "Hidden", value: hidden.count || 0, tone: "rose" },
        { label: "Not searchable", value: notSearchable.count || 0, tone: "amber" },
        { label: "Low level", value: lowLevel.count || 0, tone: "white" },
        { label: "Hidden + searchable", value: contradictory.count || 0, tone: "emerald" },
      ]}
    >
      <HiddenLocationsRepairClient />
    </LocationToolShell>
  );
}
