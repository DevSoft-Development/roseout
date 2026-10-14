import Link from "next/link";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { AdminPageHeader, AdminPageShell, AdminSectionCard } from "../../../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";
export default async function AcquisitionDashboard() {
 await requireAdminRole(["superadmin","admin"]);
 const db = getAdminDatabaseClient();
 const [all, searchable, lowLevel] = await Promise.all([
   db.from("locations").select("id",{count:"exact",head:true}),
   db.from("locations").select("id",{count:"exact",head:true}).eq("is_searchable",true),
   db.from("locations").select("id",{count:"exact",head:true}).eq("quality_status","low_level_review").eq("is_searchable",false),
 ]);
 const total=all.count ?? 0, visible=searchable.count ?? 0;
 return <AdminPageShell>
  <AdminPageHeader eyebrow="Location Intelligence V2" title="Acquisition & Provider Spending" subtitle="Quality-first metro acquisition; paid-provider metering requires reconciliation." />
  <AdminSectionCard title="Location inventory">
    <p>All locations: {total.toLocaleString()} · Searchable: {visible.toLocaleString()} · Low-level quarantined: {(lowLevel.count ?? 0).toLocaleString()}</p>
    <p>Targets: 10,000 / 25,000 / 50,000. Remaining: {[10000,25000,50000].map(x => Math.max(0,x-visible).toLocaleString()).join(" / ")}.</p>
  </AdminSectionCard>
  <AdminSectionCard title="Spending">
    <p>Google Places spending and hard-cap controls remain available in the existing dashboard.</p>
    <p><Link href="/admin/dashboard/settings/google-places">Open Google Places Budget</Link></p>
    <p>Cross-provider cost data not yet reconciled. No aggregate spending total is displayed until provider events are wired.</p>
  </AdminSectionCard>
  <AdminSectionCard title="Quality-first acquisition">
    <p>Local screening rules for fast-food chains, excluded categories, market boundaries and duplicate identities are available for integration. The rules are not yet enforcing production acquisition.</p>
  </AdminSectionCard>
 </AdminPageShell>;
}
