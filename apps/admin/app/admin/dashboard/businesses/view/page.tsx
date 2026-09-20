import Link from "next/link";
import ImpersonateButton from "@/components/admin/ImpersonateButton";
import BusinessCommunicationSection from "@/components/admin/business/BusinessCommunicationSection";
import {
  AdminActionButton,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
} from "@/components/admin/AdminDesignSystem";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getUpgradeFlags, listBusinessCRM } from "@/lib/admin/business-crm";

export const dynamic = "force-dynamic";

const tabs = [
  ["Overview", "/admin/dashboard/businesses"],
  ["Outreach", "/admin/dashboard/businesses/outreach"],
  ["Follow-ups", "/admin/dashboard/businesses/followups"],
  ["Communications", "/admin/dashboard/businesses/communication-center"],
  ["Upgrade Opportunities", "/admin/dashboard/businesses/upgrade-opportunities"],
  ["Churn Risk", "/admin/dashboard/businesses/churn-risk"],
] as const;

export default async function BusinessViewPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; locationId?: string }>;
}) {
  const currentAdmin = await requireAdminRole([
    "superadmin",
    "admin",
    "manager",
    "editor",
    "reviewer",
    "ambassador",
    "experience_team",
    "viewer",
  ]);
  const canImpersonate = currentAdmin.role === "superadmin";
  const params = await searchParams;
  const q = (params.q || "").trim().toLowerCase();
  const allBusinesses = await listBusinessCRM(500);
  const filtered = q
    ? allBusinesses.filter((b) =>
        `${b.name} ${b.city || ""} ${b.state || ""}`.toLowerCase().includes(q),
      )
    : allBusinesses;
  const selected =
    filtered.find((b) => b.id === params.locationId) || filtered[0] || null;

  const claimed = allBusinesses.filter((b) => b.is_claimed).length;
  const upgrades = allBusinesses.filter((b) => b.opportunity_score >= 70).length;
  const missingReservations = allBusinesses.filter((b) => !b.reservation_url).length;

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Owners · CRM"
        title="Businesses"
        subtitle="Operate business CRM workflows, owner access, outreach, communication, upgrade opportunities, reservation readiness, and churn risk."
        badge={<AdminStatusBadge tone="green">{allBusinesses.length.toLocaleString()} businesses</AdminStatusBadge>}
        actions={<AdminActionButton href="/admin/dashboard/crm">Open CRM</AdminActionButton>}
      />

      <nav className="flex flex-wrap gap-2 rounded-[1.35rem] border border-white/10 bg-[#101012] p-3 shadow-xl shadow-black/20">
        {tabs.map(([label, href]) => (
          <Link
            key={href}
            href={href}
            className="rounded-xl border border-white/10 bg-white/[0.045] px-3.5 py-2 text-xs font-black text-white/70 transition hover:border-rose-200/30 hover:text-white"
          >
            {label}
          </Link>
        ))}
      </nav>

      <AdminKpiGrid>
        <AdminKpiCard label="Total businesses" value={allBusinesses.length} helper="CRM records in scope" />
        <AdminKpiCard label="Claimed" value={claimed} helper="Owner-linked locations" />
        <AdminKpiCard label="Upgrade opportunities" value={upgrades} helper="Opportunity score 70+" />
        <AdminKpiCard label="Missing reservations" value={missingReservations} helper="No reservation URL configured" />
      </AdminKpiGrid>

      <AdminSectionCard className="p-5">
        <form>
          <label className="text-xs font-black uppercase tracking-[0.14em] text-white/45">
            Search businesses
            <input
              name="q"
              defaultValue={q}
              placeholder="Business, city, or state"
              className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#0b0b0d] px-3 text-sm font-semibold normal-case tracking-normal text-white outline-none placeholder:text-white/25"
            />
          </label>
        </form>
      </AdminSectionCard>

      <section className="grid gap-5 xl:grid-cols-[1.05fr_1.45fr]">
        <AdminSectionCard>
          <div className="border-b border-white/10 px-5 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Business directory</p>
            <h2 className="mt-1 text-xl font-black text-white">Locations ({filtered.length})</h2>
          </div>
          <div className="max-h-[72vh] divide-y divide-white/10 overflow-y-auto">
            {filtered.slice(0, 120).map((business) => (
              <article key={business.id} className={selected?.id === business.id ? "bg-rose-500/[0.06]" : "hover:bg-white/[0.025]"}>
                <Link
                  href={`/admin/dashboard/businesses?locationId=${business.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                  className="block px-5 py-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-black text-white">{business.name}</p>
                      <p className="mt-1 text-xs text-white/45">
                        {business.crm_status} · Opp {Math.round(business.opportunity_score)} · Churn {Math.round(business.churn_risk_score)}
                      </p>
                    </div>
                    {selected?.id === business.id ? <AdminStatusBadge tone="rose">Selected</AdminStatusBadge> : null}
                  </div>
                </Link>
                {canImpersonate ? (
                  <div className="px-5 pb-4">
                    {business.owner_user_id ? (
                      <ImpersonateButton
                        targetType="location_owner"
                        locationId={business.id}
                        locationType={business.location_type || "restaurants"}
                        userId={business.owner_user_id}
                        label="Log in as owner"
                        className="rounded-xl border border-amber-200/30 bg-amber-500/10 px-3 py-2 text-xs font-black text-amber-50 hover:bg-amber-500/20 disabled:opacity-50"
                      />
                    ) : (
                      <ImpersonateButton
                        targetType="admin_location"
                        locationId={business.id}
                        locationType={business.location_type || "restaurants"}
                        label="Open as location admin"
                        className="rounded-xl border border-sky-200/30 bg-sky-500/10 px-3 py-2 text-xs font-black text-sky-50 hover:bg-sky-500/20 disabled:opacity-50"
                      />
                    )}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </AdminSectionCard>

        {selected ? (
          <div className="space-y-5">
            <AdminSectionCard className="p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Business workspace</p>
                  <h2 className="mt-1 text-2xl font-black text-white">{selected.name}</h2>
                  <p className="mt-1 text-sm text-white/55">{[selected.city, selected.state].filter(Boolean).join(", ") || "Unknown city/state"}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {getUpgradeFlags(selected).map((flag) => <AdminStatusBadge key={flag} tone="amber">{flag}</AdminStatusBadge>)}
                  </div>
                </div>
                {canImpersonate ? (
                  selected.owner_user_id ? (
                    <ImpersonateButton
                      targetType="location_owner"
                      locationId={selected.id}
                      locationType={selected.location_type || "restaurants"}
                      userId={selected.owner_user_id}
                      label="Log in as owner"
                      className="rounded-xl border border-amber-200/30 bg-amber-500/10 px-4 py-2 text-xs font-black uppercase tracking-wide text-amber-50 hover:bg-amber-500/20 disabled:opacity-50"
                    />
                  ) : (
                    <ImpersonateButton
                      targetType="admin_location"
                      locationId={selected.id}
                      locationType={selected.location_type || "restaurants"}
                      label="Open as location admin"
                      className="rounded-xl border border-sky-200/30 bg-sky-500/10 px-4 py-2 text-xs font-black uppercase tracking-wide text-sky-50 hover:bg-sky-500/20 disabled:opacity-50"
                    />
                  )
                ) : null}
              </div>
            </AdminSectionCard>

            <BusinessCommunicationSection business={selected} />

            <AdminSectionCard className="p-5">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Workspace coverage</p>
              <h3 className="mt-1 text-lg font-black text-white">CRM modules</h3>
              <p className="mt-2 text-sm leading-6 text-white/55">
                Overview · Analytics · Sales / Plan · Upgrade Opportunity · Reservation Links · Claim Codes · Outreach · Follow Ups · Communication · Notes / History · Promotions · Churn Risk
              </p>
            </AdminSectionCard>
          </div>
        ) : (
          <AdminSectionCard className="p-5">
            <p className="text-sm text-white/55">No businesses found.</p>
          </AdminSectionCard>
        )}
      </section>
    </AdminPageShell>
  );
}
