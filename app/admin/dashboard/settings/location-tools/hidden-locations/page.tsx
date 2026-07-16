import { requireAdminRole } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { LocationToolShell } from "@/components/admin/location-tools/LocationToolShell";
import { HiddenLocationsRepairClient } from "@/components/admin/location-tools/HiddenLocationsRepairClient";

export const dynamic = "force-dynamic";

export default async function HiddenLocationsPage() {
  await requireAdminRole(["superadmin", "admin"]);

  const [hidden, notSearchable, lowLevel, contradictory] = await Promise.all([
    supabaseAdmin.from("locations").select("id", { count: "exact", head: true }).eq("is_hidden", true),
    supabaseAdmin.from("locations").select("id", { count: "exact", head: true }).eq("is_searchable", false),
    supabaseAdmin.from("locations").select("id", { count: "exact", head: true }).eq("is_low_level", true),
    supabaseAdmin.from("locations").select("id", { count: "exact", head: true }).eq("is_hidden", true).eq("is_searchable", true),
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
