import Link from "next/link";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { listBusinessCRM } from "@/lib/admin/business-crm";
import BusinessCommunicationSection from "@/components/admin/business/BusinessCommunicationSection";
import { AdminPageHeader, AdminPageShell, AdminStatusBadge } from "@/lib/admin-design-system";

export default async function Page() {
  await requireAdminRole(["superadmin", "admin", "ambassador"]);
  const businesses = await listBusinessCRM(60);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Admin CRM · Growth"
        title="Upgrade Opportunities"
        subtitle="Review businesses, open the full CRM record, and act on communication and commercial follow-up."
        badge={<AdminStatusBadge tone={businesses.length ? "blue" : "muted"}>{businesses.length} businesses</AdminStatusBadge>}
      />
      <div className="space-y-2">
          {businesses.map((business) => (<div key={business.id}>
            <Link key={business.id} href={`/admin/dashboard/businesses/view?locationId=${business.id}`} className="block rounded-xl border border-white/10 px-4 py-3 hover:bg-white/5">
              <p className="font-semibold">{business.name}</p>
              <p className="text-xs text-white/55">{business.crm_status} · Opp {Math.round(business.opportunity_score)} · Churn {Math.round(business.churn_risk_score)}</p>
            </Link>
            <div className="mt-2"><BusinessCommunicationSection business={business} compact /></div>
          </div>))}
      </div>
    </AdminPageShell>
  );
}
