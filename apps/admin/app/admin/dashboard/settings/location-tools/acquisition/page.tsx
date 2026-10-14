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
 const {data: providerSpend, error: spendError} = await db.rpc("get_location_acquisition_provider_spend");
 return <AdminPageShell>
  <AdminPageHeader eyebrow="Location Intelligence V2" title="Acquisition & Provider Spending" subtitle="Quality-first metro acquisition; paid-provider metering requires reconciliation." />
  <AdminSectionCard><h2 className="text-lg font-bold">Location inventory</h2>
    <p>All locations: {total.toLocaleString()} · Searchable: {visible.toLocaleString()} · Low-level quarantined: {(lowLevel.count ?? 0).toLocaleString()}</p>
    <p>Targets: 10,000 / 25,000 / 50,000. Remaining: {[10000,25000,50000].map(x => Math.max(0,x-visible).toLocaleString()).join(" / ")}.</p>
  </AdminSectionCard>
  <AdminSectionCard><h2 className="text-lg font-bold">Spending</h2>
    <p>Google Places spending and hard-cap controls remain available in the existing dashboard.</p>
    <p><Link href="/admin/dashboard/settings/google-places">Open Google Places Budget</Link></p>
    <p>Provider request telemetry below covers instrumented LI V2 operations only. Reconciled totals reflect recorded provider invoices, not assumed costs.</p>
    {spendError ? <p>Unified spend telemetry unavailable or awaiting database migration.</p> :
      Array.isArray(providerSpend) && providerSpend.length ? <table className="w-full text-sm">
       <thead><tr><th className="text-left">Provider</th><th>Attempts</th><th>Reserved estimate</th><th>Reconciled</th><th>Credits</th></tr></thead>
       <tbody>{providerSpend.map((item: any) => <tr key={item.provider}><td>{item.provider}</td><td className="text-right">{item.attempts}</td><td className="text-right">${Number(item.estimated_usd || 0).toFixed(2)}</td><td className="text-right">${Number(item.reconciled_usd || 0).toFixed(2)}</td><td className="text-right">${Number(item.credits_usd || 0).toFixed(2)}</td></tr>)}</tbody>
      </table> : <p>No metered provider attempts yet.</p>}
  </AdminSectionCard>
  <AdminSectionCard><h2 className="text-lg font-bold">Quality-first acquisition</h2>
    <p>Local screening rules for fast-food chains, excluded categories, market boundaries and duplicate identities are available for integration. The rules are not yet enforcing production acquisition.</p>
  </AdminSectionCard>
 </AdminPageShell>;
}
