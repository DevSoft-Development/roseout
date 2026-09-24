import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { listPermittedCrmLocationIds } from "@/lib/crm/location-scope";
import {
  AdminActionButton,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
} from "@/components/admin/AdminDesignSystem";
import { getLocationCustomerLifecycleDetail } from "@/lib/crm/location-customer-lifecycle";

export const dynamic = "force-dynamic";

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
    .format((Number(cents) || 0) / 100);

function dateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function tone(health: string) {
  if (health === "at_risk") return "red" as const;
  if (health === "needs_attention") return "amber" as const;
  return "green" as const;
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <dt className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">{label}</dt>
      <dd className="mt-2 text-sm font-bold text-white/85">{value || "—"}</dd>
    </div>
  );
}

export default async function CustomerLifecycleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.crm);
  const { id } = await params;
  const permittedLocationIds = await listPermittedCrmLocationIds(admin.user_id, admin.role);
  if (Array.isArray(permittedLocationIds) && !permittedLocationIds.includes(id)) notFound();
  const detail = await getLocationCustomerLifecycleDetail(id);
  if (!detail) notFound();

  const { row, opportunities, tasks, activities } = detail;
  const openTasks = tasks.filter((task: any) => !["completed", "cancelled"].includes(String(task.status || "").toLowerCase()));
  const openOpportunities = opportunities.filter((opp: any) => String(opp.status || "").toLowerCase() === "open");
  const crmHref = "/admin/dashboard/crm/" + row.id;
  const opportunitiesHref = "/admin/dashboard/crm/opportunities?location_id=" + encodeURIComponent(row.id);
  const workHref = "/admin/dashboard/crm/work-queue/new?location=" + encodeURIComponent(row.id) + (row.accountId ? "&account=" + encodeURIComponent(row.accountId) : "");
  const claimHref = "/admin/dashboard/crm/claim-codes?location_id=" + encodeURIComponent(row.id);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Locations CRM · Customer Journey"
        title={row.name}
        subtitle={row.stageLabel + " · " + row.planLabel + " · " + ([row.city, row.state].filter(Boolean).join(", ") || "Location account")}
        badge={<AdminStatusBadge tone={tone(row.health)}>{row.healthLabel}</AdminStatusBadge>}
        actions={
          <>
            <AdminActionButton href="/admin/dashboard/crm/customer-lifecycle" variant="primary">Customer lifecycle</AdminActionButton>
            <AdminActionButton href={crmHref}>Location CRM</AdminActionButton>
            <AdminActionButton href={opportunitiesHref}>Opportunities</AdminActionButton>
          </>
        }
      />

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-rose-950/45 via-[#111115] to-[#0b0b0d] p-5 shadow-xl shadow-black/20 sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200">Where this customer is now</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-white">{row.stageLabel}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">{row.stageHelper}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <AdminStatusBadge tone={tone(row.health)}>{row.healthLabel}</AdminStatusBadge>
              <AdminStatusBadge tone="blue">{row.interestLabel}</AdminStatusBadge>
              <AdminStatusBadge tone={row.isPaid ? "green" : "muted"}>{row.planLabel}</AdminStatusBadge>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Recommended next action</p>
            <p className="mt-2 text-lg font-black text-white">{row.nextAction}</p>
            <p className="mt-2 text-xs text-white/45">{row.nextActionDueAt ? "Due " + dateTime(row.nextActionDueAt) : "No due date set"}</p>
          </div>
        </div>
      </section>

      <AdminKpiGrid>
        <AdminKpiCard label="Monthly Value" value={row.monthlyValueCents ? money(row.monthlyValueCents) : "—"} helper={row.billingLabel} />
        <AdminKpiCard label="Open Opportunities" value={openOpportunities.length} helper="Commercial conversations in progress" />
        <AdminKpiCard label="Open Follow-ups" value={openTasks.length} helper="Tasks that still need action" />
        <AdminKpiCard label="Customer Activity" value={row.activity30d} helper="Recent profile, search, save, and reservation signals" />
      </AdminKpiGrid>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(340px,.75fr)]">
        <div className="space-y-5">
          <AdminSectionCard className="p-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-200">Customer journey</p>
                <h2 className="mt-1 text-xl font-black text-white">Relationship overview</h2>
              </div>
              <Link href={workHref} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-black text-white hover:bg-rose-500">
                Create follow-up
              </Link>
            </div>
            <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Info label="Customer stage" value={row.stageLabel} />
              <Info label="Claim status" value={row.claimStatus} />
              <Info label="Plan" value={row.planLabel} />
              <Info label="Billing" value={row.billingLabel} />
              <Info label="Renewal / next billing" value={dateTime(row.renewalDate)} />
              <Info label="Account" value={row.accountName || "Not connected yet"} />
              <Info label="Owner email" value={row.ownerEmail || "Not available"} />
              <Info label="Phone" value={row.phone || "Not available"} />
              <Info label="Website" value={row.website ? <a href={row.website} target="_blank" rel="noreferrer" className="text-rose-200 hover:text-rose-100">Open website</a> : "Not available"} />
            </dl>
          </AdminSectionCard>

          <AdminSectionCard className="overflow-hidden">
            <div className="border-b border-white/10 p-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-200">Revenue & opportunities</p>
              <h2 className="mt-1 text-xl font-black text-white">Commercial relationship</h2>
              <p className="mt-1 text-sm text-white/45">Claim conversion, paid plan, expansion, and renewal opportunities stay connected to this location.</p>
            </div>
            {opportunities.length ? (
              <div className="divide-y divide-white/10">
                {opportunities.map((opp: any) => (
                  <Link key={opp.id} href={"/admin/dashboard/crm/opportunities/" + opp.id} className="grid gap-3 p-5 transition hover:bg-white/[0.025] md:grid-cols-[minmax(0,1fr)_160px_140px] md:items-center">
                    <div>
                      <p className="font-black text-white">{opp.name}</p>
                      <p className="mt-1 text-xs text-white/40">{String(opp.pipeline_key || "commercial").replaceAll("_", " ")} · {String(opp.stage || "open").replaceAll("_", " ")}</p>
                    </div>
                    <div className="text-sm">
                      <span className="text-white/35">Next step</span>
                      <p className="font-bold text-white/75">{opp.next_step || "Set next step"}</p>
                    </div>
                    <div className="text-right">
                      <AdminStatusBadge tone={String(opp.status).toLowerCase() === "won" ? "green" : "blue"}>{String(opp.status || "open")}</AdminStatusBadge>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center">
                <p className="text-sm font-bold text-white/55">No commercial opportunity is open yet.</p>
                <Link href={opportunitiesHref} className="mt-3 inline-flex rounded-xl border border-rose-300/25 bg-rose-500/10 px-4 py-2 text-sm font-black text-rose-100">Open sales opportunities</Link>
              </div>
            )}
          </AdminSectionCard>

          <AdminSectionCard className="overflow-hidden">
            <div className="border-b border-white/10 p-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-200">Relationship history</p>
              <h2 className="mt-1 text-xl font-black text-white">Customer timeline</h2>
            </div>
            {activities.length ? (
              <div className="divide-y divide-white/10">
                {activities.map((activity: any) => (
                  <article key={activity.id} className="grid gap-2 p-5 sm:grid-cols-[150px_minmax(0,1fr)]">
                    <div className="text-xs font-semibold text-white/40">{dateTime(activity.occurred_at || activity.created_at)}</div>
                    <div>
                      <p className="font-black text-white">{activity.summary || activity.activity_type || "Customer activity"}</p>
                      {activity.description || activity.body ? <p className="mt-1 text-sm leading-6 text-white/50">{activity.description || activity.body}</p> : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="p-8 text-center text-sm text-white/45">Customer activity will appear here as outreach, claims, sales, support, and retention work is recorded.</p>
            )}
          </AdminSectionCard>
        </div>

        <aside className="space-y-5">
          <AdminSectionCard className="p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-200">Quick actions</p>
            <h2 className="mt-1 text-xl font-black text-white">Move the relationship forward</h2>
            <div className="mt-4 grid gap-2">
              {!row.isClaimed ? <Link href={claimHref} className="rounded-xl bg-rose-600 px-4 py-3 text-center text-sm font-black text-white hover:bg-rose-500">Send claim link</Link> : null}
              <Link href={workHref} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-sm font-black text-white/80 hover:bg-white/[0.07]">Schedule follow-up</Link>
              <Link href={opportunitiesHref} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-sm font-black text-white/80 hover:bg-white/[0.07]">View sales opportunities</Link>
              <Link href={"/admin/dashboard/businesses/" + encodeURIComponent(row.id)} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-center text-sm font-black text-white/80 hover:bg-white/[0.07]">Open business account</Link>
            </div>
          </AdminSectionCard>

          <AdminSectionCard className="p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-200">Retention</p>
            <h2 className="mt-1 text-xl font-black text-white">Customer health</h2>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="text-xs text-white/40">Current health</p>
                <div className="mt-2"><AdminStatusBadge tone={tone(row.health)}>{row.healthLabel}</AdminStatusBadge></div>
              </div>
              <Info label="Recent customer activity" value={String(row.activity30d) + " signals"} />
              <Info label="Renewal / next billing" value={dateTime(row.renewalDate)} />
              <Info label="Recommended action" value={row.nextAction} />
            </div>
          </AdminSectionCard>

          <AdminSectionCard className="overflow-hidden">
            <div className="border-b border-white/10 p-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-200">Team work</p>
              <h2 className="mt-1 text-xl font-black text-white">Follow-ups</h2>
            </div>
            {openTasks.length ? (
              <div className="divide-y divide-white/10">
                {openTasks.slice(0, 8).map((task: any) => (
                  <Link key={task.id} href={"/admin/dashboard/crm/work-queue/" + task.id} className="block p-4 hover:bg-white/[0.025]">
                    <p className="text-sm font-black text-white">{task.title || "Follow-up"}</p>
                    <p className="mt-1 text-xs text-white/40">{task.due_at ? "Due " + dateTime(task.due_at) : "No due date"} · {String(task.status || "open").replaceAll("_", " ")}</p>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="p-5 text-sm text-white/45">No open follow-ups.</p>
            )}
          </AdminSectionCard>
        </aside>
      </div>
    </AdminPageShell>
  );
}
