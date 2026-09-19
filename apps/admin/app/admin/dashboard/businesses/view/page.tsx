import Link from "next/link";
import { Building2, CalendarCheck2, CircleDollarSign, Link2Off, Search, ShieldCheck } from "lucide-react";
import ImpersonateButton from "@/components/admin/ImpersonateButton";
import BusinessCommunicationSection from "@/components/admin/business/BusinessCommunicationSection";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getUpgradeFlags, listBusinessCRM } from "@/lib/admin/business-crm";
import {
  AdminDataCard,
  AdminDetailPanel,
  AdminDetailSection,
  AdminEmptyState,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminSearchInput,
  AdminSectionCard,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

function crmTone(status?: string | null): "green" | "amber" | "blue" | "rose" | "muted" {
  const value = String(status || "").toLowerCase();
  if (["active", "customer", "claimed"].some((token) => value.includes(token))) return "green";
  if (["lead", "prospect", "outreach"].some((token) => value.includes(token))) return "blue";
  if (["risk", "churn", "inactive"].some((token) => value.includes(token))) return "amber";
  if (["blocked", "lost", "cancelled"].some((token) => value.includes(token))) return "rose";
  return "muted";
}

function BusinessViewContent({
  allBusinesses,
  filtered,
  selected,
  q,
  canImpersonate,
}: {
  allBusinesses: Awaited<ReturnType<typeof listBusinessCRM>>;
  filtered: Awaited<ReturnType<typeof listBusinessCRM>>;
  selected: Awaited<ReturnType<typeof listBusinessCRM>>[number] | null;
  q: string;
  canImpersonate: boolean;
}) {
  const claimed = allBusinesses.filter((business) => business.is_claimed).length;
  const upgrades = allBusinesses.filter((business) => business.opportunity_score >= 70).length;
  const missingReservations = allBusinesses.filter((business) => !business.reservation_url).length;

  return (
    <>
      <AdminKpiGrid>
        <AdminKpiCard label="Total businesses" value={allBusinesses.length} helper="CRM locations loaded" icon={Building2} />
        <AdminKpiCard label="Claimed" value={claimed} helper="Owner-connected businesses" icon={ShieldCheck} />
        <AdminKpiCard label="Upgrade opportunities" value={upgrades} helper="Opportunity score 70+" icon={CircleDollarSign} />
        <AdminKpiCard label="Missing reservation links" value={missingReservations} helper="Needs booking-link follow-up" icon={Link2Off} />
      </AdminKpiGrid>

      <AdminSectionCard className="p-4">
        <form className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Business directory</p>
            <h2 className="mt-1 text-xl font-black text-white">Find and manage businesses</h2>
            <p className="mt-1 text-sm text-white/50">
              Search business name, city, or state. Select a record to review CRM status, outreach, upgrade signals, and owner access.
            </p>
          </div>
          <div className="w-full lg:w-[420px]">
            <AdminSearchInput name="q" defaultValue={q} placeholder="Search business, city, state" aria-label="Search businesses" />
          </div>
        </form>
      </AdminSectionCard>

      <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(360px,0.9fr)_minmax(0,1.4fr)]">
        <AdminSectionCard>
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-200">Directory</p>
              <h2 className="mt-1 text-lg font-black text-white">{filtered.length.toLocaleString()} businesses</h2>
            </div>
            <Search className="h-4 w-4 text-white/30" />
          </div>

          {filtered.length ? (
            <div className="max-h-[72vh] space-y-2 overflow-y-auto p-3">
              {filtered.slice(0, 120).map((business) => {
                const active = selected?.id === business.id;
                return (
                  <Link
                    key={business.id}
                    href={`/admin/dashboard/businesses?locationId=${business.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                    className="block"
                  >
                    <AdminDataCard active={active}>
                      <div className="flex min-w-0 items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-black text-white">{business.name}</p>
                          <p className="mt-1 truncate text-xs font-semibold text-white/40">
                            {[business.city, business.state].filter(Boolean).join(", ") || "Location not set"}
                          </p>
                        </div>
                        <AdminStatusBadge tone={crmTone(business.crm_status)}>{business.crm_status || "Unclassified"}</AdminStatusBadge>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-xl border border-white/10 bg-black/20 p-2">
                          <p className="font-black uppercase tracking-[0.12em] text-white/30">Opportunity</p>
                          <p className="mt-1 font-black text-white/70">{Math.round(business.opportunity_score)}</p>
                        </div>
                        <div className="rounded-xl border border-white/10 bg-black/20 p-2">
                          <p className="font-black uppercase tracking-[0.12em] text-white/30">Churn risk</p>
                          <p className="mt-1 font-black text-white/70">{Math.round(business.churn_risk_score)}</p>
                        </div>
                      </div>
                    </AdminDataCard>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="p-4">
              <AdminEmptyState
                title="No businesses found"
                body="Try a broader business name, city, or state search."
              />
            </div>
          )}
        </AdminSectionCard>

        {selected ? (
          <AdminDetailPanel className="space-y-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-rose-200">Business brief</p>
              <h2 className="mt-2 text-2xl font-black text-white">{selected.name}</h2>
              <p className="mt-1 text-sm text-white/50">
                {[selected.city, selected.state].filter(Boolean).join(", ") || "Unknown city/state"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <AdminStatusBadge tone={crmTone(selected.crm_status)}>{selected.crm_status || "Unclassified"}</AdminStatusBadge>
                {selected.is_claimed ? <AdminStatusBadge tone="green">Claimed</AdminStatusBadge> : <AdminStatusBadge tone="amber">Unclaimed</AdminStatusBadge>}
              </div>
            </div>

            <AdminDetailSection title="Commercial signals">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/30">Opportunity score</p>
                  <p className="mt-1 text-2xl font-black text-white">{Math.round(selected.opportunity_score)}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/30">Churn risk</p>
                  <p className="mt-1 text-2xl font-black text-white">{Math.round(selected.churn_risk_score)}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {getUpgradeFlags(selected).length ? (
                  getUpgradeFlags(selected).map((flag) => <AdminStatusBadge key={flag} tone="rose">{flag}</AdminStatusBadge>)
                ) : (
                  <span className="text-sm font-semibold text-white/40">No upgrade flags currently detected.</span>
                )}
              </div>
            </AdminDetailSection>

            {canImpersonate ? (
              <AdminDetailSection title="Owner access">
                {selected.owner_user_id ? (
                  <ImpersonateButton
                    targetType="location_owner"
                    locationId={selected.id}
                    locationType={selected.location_type || "restaurants"}
                    userId={selected.owner_user_id}
                    label="Log in as owner"
                    className="inline-flex min-h-10 items-center justify-center rounded-xl border border-amber-200/30 bg-amber-500/10 px-4 text-xs font-black uppercase tracking-wide text-amber-50 hover:bg-amber-500/20 disabled:opacity-50"
                  />
                ) : (
                  <ImpersonateButton
                    targetType="admin_location"
                    locationId={selected.id}
                    locationType={selected.location_type || "restaurants"}
                    label="Open as location admin"
                    className="inline-flex min-h-10 items-center justify-center rounded-xl border border-sky-200/30 bg-sky-500/10 px-4 text-xs font-black uppercase tracking-wide text-sky-50 hover:bg-sky-500/20 disabled:opacity-50"
                  />
                )}
              </AdminDetailSection>
            ) : null}

            <BusinessCommunicationSection business={selected} />

            <AdminDetailSection title="CRM workspace">
              <div className="grid gap-2 text-sm font-semibold text-white/55 sm:grid-cols-2">
                {[
                  "Overview",
                  "Analytics",
                  "Sales / Plan",
                  "Upgrade Opportunity",
                  "Reservation Links",
                  "Claim Codes",
                  "Outreach",
                  "Follow Ups",
                  "Communication",
                  "Notes / History",
                  "Promotions",
                  "Churn Risk",
                ].map((label) => (
                  <div key={label} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                    {label}
                  </div>
                ))}
              </div>
            </AdminDetailSection>
          </AdminDetailPanel>
        ) : (
          <AdminEmptyState
            title="Select a business"
            body="Choose a business from the directory to review CRM details, communication history, and commercial signals."
          />
        )}
      </section>
    </>
  );
}

export default async function BusinessViewPage({
  searchParams,
  embedded = false,
}: {
  searchParams: Promise<{ q?: string; locationId?: string }>;
  embedded?: boolean;
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
    ? allBusinesses.filter((business) =>
        `${business.name} ${business.city || ""} ${business.state || ""}`.toLowerCase().includes(q),
      )
    : allBusinesses;
  const selected = filtered.find((business) => business.id === params.locationId) || filtered[0] || null;

  const content = (
    <BusinessViewContent
      allBusinesses={allBusinesses}
      filtered={filtered}
      selected={selected}
      q={q}
      canImpersonate={canImpersonate}
    />
  );

  if (embedded) return content;

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Businesses · CRM Command Center"
        title="Business View"
        subtitle="Review business relationships, ownership state, revenue opportunities, outreach, reservation readiness, and churn signals from one operating surface."
        badge={<AdminStatusBadge tone="blue">CRM operations</AdminStatusBadge>}
      />
      {content}
    </AdminPageShell>
  );
}
