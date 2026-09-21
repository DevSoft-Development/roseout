import { notFound } from "next/navigation";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getBusinessCRM, getUpgradeFlags } from "@/lib/admin/business-crm";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

import {
  AdminActionButton,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

export default async function BusinessDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminRole(["superadmin", "admin", "manager", "editor", "reviewer", "ambassador", "experience_team", "viewer"]);
  const { id } = await params;
  const business = await getBusinessCRM(id);

  const { data: location } = await getAdminDatabaseClient()
    .from("locations")
    .select("id,name,restaurant_name,activity_name,address,city,state,zip,phone,website,category,cuisine,rating,google_place_id,source_table,source_id,intent_tags")
    .eq("id", id)
    .maybeSingle();

  if (!business && !location) notFound();

  const name = business?.name || location?.name || location?.restaurant_name || location?.activity_name || "Unknown location";
  const flags = business ? getUpgradeFlags(business) : [];

  return (
    <AdminPageShell>
        <AdminPageHeader
          eyebrow="CRM · Business Detail"
          title={name}
          subtitle={`${[location?.city, location?.state].filter(Boolean).join(", ") || "Location not set"} · ${location?.category || "Uncategorized"}`}
          badge={<AdminStatusBadge tone={business?.crm_status === "active" ? "green" : "blue"}>{business?.crm_status || "Unclaimed"}</AdminStatusBadge>}
          actions={<><AdminActionButton href="/admin/dashboard/businesses">Businesses</AdminActionButton><AdminActionButton href="/admin/dashboard/crm" variant="primary">Open CRM</AdminActionButton></>}
        />
        {flags.length ? <div className="flex flex-wrap gap-2">{flags.map((flag) => <AdminStatusBadge key={flag} tone="rose">{flag}</AdminStatusBadge>)}</div> : null}

        <AdminKpiGrid>
          <AdminKpiCard label="Opportunity Score" value={business?.opportunity_score ?? 0} helper="CRM opportunity score" />
          <AdminKpiCard label="Plan Status" value={business?.crm_status ?? "Unclaimed"} helper="Current CRM status" />
          <AdminKpiCard label="Churn Risk" value={business?.churn_risk_score ?? 0} helper="Retention risk score" />
          <AdminKpiCard label="Conversion" value={`${((business?.conversion_rate_30d ?? 0) * 100).toFixed(1)}%`} helper="30-day conversion rate" />
        </AdminKpiGrid>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-lg font-black">Overview</h2>
            <dl className="mt-3 space-y-2 text-sm text-white/80">
              <div><dt className="text-white/55">Address</dt><dd>{location?.address || "—"}</dd></div>
              <div><dt className="text-white/55">Phone</dt><dd>{location?.phone || "—"}</dd></div>
              <div><dt className="text-white/55">Website</dt><dd>{location?.website || "—"}</dd></div>
              <div><dt className="text-white/55">Cuisine/Type</dt><dd>{location?.cuisine || location?.category || "—"}</dd></div>
              <div><dt className="text-white/55">Rating</dt><dd>{location?.rating ?? "—"}</dd></div>
              <div><dt className="text-white/55">Google Place ID</dt><dd>{location?.google_place_id || "—"}</dd></div>
            </dl>
          </article>
          <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-lg font-black">Analytics</h2>
            <ul className="mt-3 space-y-2 text-sm text-white/80">
              <li>Views: {business?.profile_views_30d ?? 0}</li>
              <li>Clicks/Search: {business?.search_appearances_30d ?? 0}</li>
              <li>Saves: {business?.saves_30d ?? 0}</li>
              <li>Bookings: {business?.reservation_completions_30d ?? 0}</li>
            </ul>
          </article>
          <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-lg font-black">Claim Codes</h2>
            <p className="mt-3 text-sm text-white/70">Use Admin Locations → Claim Codes for regenerate/revoke. This detail route is now linked from CRM tools.</p>
          </article>
          <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-lg font-black">Outreach / Notes / Promotions</h2>
            <p className="mt-3 text-sm text-white/70">Outreach, notes, reservation link updates, upgrade opportunities, and featured/promotion states are available via admin APIs for this location id.</p>
          </article>
        </section>
    </AdminPageShell>
  );
}
