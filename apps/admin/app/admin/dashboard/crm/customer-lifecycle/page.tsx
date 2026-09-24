import Link from "next/link";

import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import {
  AdminActionButton,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
} from "@/components/admin/AdminDesignSystem";
import {
  CUSTOMER_LIFECYCLE_META,
  CUSTOMER_LIFECYCLE_STAGES,
  listLocationCustomerLifecycle,
  type CustomerLifecycleStage,
  type LocationCustomerLifecycleRow,
} from "@/lib/crm/location-customer-lifecycle";

export const dynamic = "force-dynamic";

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format((Number(cents) || 0) / 100);

function dateLabel(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function healthTone(health: string) {
  if (health === "at_risk") return "red" as const;
  if (health === "needs_attention") return "amber" as const;
  return "green" as const;
}

function LifecycleCard({ row }: { row: LocationCustomerLifecycleRow }) {
  return (
    <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 shadow-xl shadow-black/10 transition hover:border-rose-300/25 hover:bg-white/[0.055]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/admin/dashboard/crm/customer-lifecycle/${row.id}`}
            className="block truncate text-sm font-black text-white hover:text-rose-200"
          >
            {row.name}
          </Link>
          <p className="mt-1 truncate text-xs font-semibold text-white/45">
            {[row.city, row.state].filter(Boolean).join(", ") || "Location details"}
          </p>
        </div>
        <AdminStatusBadge tone={healthTone(row.health)}>{row.healthLabel}</AdminStatusBadge>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl border border-white/10 bg-black/15 p-2.5">
          <span className="text-white/40">Plan</span>
          <p className="mt-1 font-black text-white">{row.planLabel}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/15 p-2.5">
          <span className="text-white/40">Interest</span>
          <p className="mt-1 font-black text-white">{row.interestLabel}</p>
        </div>
      </div>

      <div className="mt-4 border-t border-white/10 pt-3">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Next action</p>
        <p className="mt-1 text-sm font-bold text-white/80">{row.nextAction}</p>
        {row.nextActionDueAt ? (
          <p className="mt-1 text-xs text-white/40">Due {dateLabel(row.nextActionDueAt)}</p>
        ) : null}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-white/45">
        <span>{row.daysInStage == null ? "New" : `${row.daysInStage} days here`}</span>
        <span>{row.monthlyValueCents ? `${money(row.monthlyValueCents)}/mo` : "No paid plan"}</span>
      </div>
    </article>
  );
}

function BoardColumn({
  stage,
  rows,
}: {
  stage: CustomerLifecycleStage;
  rows: LocationCustomerLifecycleRow[];
}) {
  const meta = CUSTOMER_LIFECYCLE_META[stage];
  return (
    <section className="w-[310px] shrink-0 rounded-3xl border border-white/10 bg-black/20">
      <header className="sticky top-0 z-10 rounded-t-3xl border-b border-white/10 bg-[#101012]/95 p-4 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-black text-white">{meta.label}</h2>
          <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-xs font-black text-white/60">
            {rows.length}
          </span>
        </div>
        <p className="mt-1 text-xs leading-5 text-white/40">{meta.helper}</p>
      </header>
      <div className="grid max-h-[740px] gap-3 overflow-y-auto p-3">
        {rows.length ? rows.map((row) => <LifecycleCard key={row.id} row={row} />) : (
          <div className="rounded-2xl border border-dashed border-white/10 p-5 text-center text-xs text-white/35">
            No locations here right now.
          </div>
        )}
      </div>
    </section>
  );
}

export default async function CustomerLifecyclePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.crm);
  const params = await searchParams;
  const q = String(params.q || "").trim();
  const stage = String(params.stage || "all");
  const health = String(params.health || "all");
  const view = params.view === "table" ? "table" : "board";
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = [25, 50, 100].includes(Number(params.pageSize)) ? Number(params.pageSize) : 50;

  const result = await listLocationCustomerLifecycle({ q, stage, health, page, pageSize });
  const boardGroups = Object.fromEntries(
    CUSTOMER_LIFECYCLE_STAGES.map((key) => [key, result.boardRows.filter((row) => row.stage === key)]),
  ) as Record<CustomerLifecycleStage, LocationCustomerLifecycleRow[]>;

  const base = new URLSearchParams();
  if (q) base.set("q", q);
  if (stage !== "all") base.set("stage", stage);
  if (health !== "all") base.set("health", health);
  base.set("view", view);
  base.set("pageSize", String(pageSize));

  const pageHref = (nextPage: number) => {
    const next = new URLSearchParams(base);
    next.set("page", String(nextPage));
    return `/admin/dashboard/crm/customer-lifecycle?${next.toString()}`;
  };

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Locations CRM · Customer Journey"
        title="Customer Lifecycle"
        subtitle="See every location from first outreach through claim, paid membership, renewal, retention, cancellation, and win-back — in plain language."
        badge={<AdminStatusBadge tone={result.totals.atRisk ? "amber" : "green"}>{result.totals.atRisk} need attention</AdminStatusBadge>}
        actions={
          <>
            <AdminActionButton href="/admin/dashboard/crm" variant="primary">Locations CRM</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/crm/opportunities">Sales opportunities</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/crm/work-queue?view=tasks">Team follow-ups</AdminActionButton>
          </>
        }
      />

      <AdminKpiGrid>
        <AdminKpiCard label="All Locations" value={result.totals.total} helper="Visible in this lifecycle view" />
        <AdminKpiCard label="In Conversation" value={result.totals.inConversation} helper="Contacted, interested, or claiming" />
        <AdminKpiCard label="Claimed" value={result.totals.claimed} helper="Ownership connected" />
        <AdminKpiCard label="Paid Customers" value={result.totals.paid} helper={`${money(result.totals.mrrCents)} monthly value`} />
        <AdminKpiCard label="Renewals Coming Up" value={result.totals.renewals} helper="Within the next 45 days" />
        <AdminKpiCard label="Needs Attention" value={result.totals.atRisk} helper="Retention or billing follow-up" />
      </AdminKpiGrid>

      <AdminSectionCard className="p-4 sm:p-5">
        <form className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_210px_210px_150px_auto]">
          <label className="grid gap-2 text-xs font-black uppercase tracking-[0.14em] text-white/45">
            Find a location
            <input
              name="q"
              defaultValue={q}
              placeholder="Name, city, address, owner email…"
              className="min-h-11 rounded-xl border border-white/10 bg-[#0b0b0d] px-3 text-sm font-bold normal-case tracking-normal text-white outline-none placeholder:text-white/30 focus:border-rose-300/50"
            />
          </label>
          <label className="grid gap-2 text-xs font-black uppercase tracking-[0.14em] text-white/45">
            Customer stage
            <select name="stage" defaultValue={stage} className="min-h-11 rounded-xl border border-white/10 bg-[#0b0b0d] px-3 text-sm font-bold normal-case tracking-normal text-white">
              <option value="all">All stages</option>
              {CUSTOMER_LIFECYCLE_STAGES.map((key) => (
                <option key={key} value={key}>{CUSTOMER_LIFECYCLE_META[key].label}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-xs font-black uppercase tracking-[0.14em] text-white/45">
            Customer health
            <select name="health" defaultValue={health} className="min-h-11 rounded-xl border border-white/10 bg-[#0b0b0d] px-3 text-sm font-bold normal-case tracking-normal text-white">
              <option value="all">All customers</option>
              <option value="healthy">Healthy</option>
              <option value="needs_attention">Needs attention</option>
              <option value="at_risk">At risk</option>
            </select>
          </label>
          <label className="grid gap-2 text-xs font-black uppercase tracking-[0.14em] text-white/45">
            View
            <select name="view" defaultValue={view} className="min-h-11 rounded-xl border border-white/10 bg-[#0b0b0d] px-3 text-sm font-bold normal-case tracking-normal text-white">
              <option value="board">Journey board</option>
              <option value="table">Table</option>
            </select>
          </label>
          <div className="flex items-end">
            <button className="min-h-11 w-full rounded-xl bg-rose-600 px-5 text-sm font-black text-white transition hover:bg-rose-500">Apply</button>
          </div>
        </form>
      </AdminSectionCard>

      <AdminSectionCard className="overflow-hidden">
        <div className="border-b border-white/10 p-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-200">Commercial lifecycle</p>
              <h2 className="mt-1 text-xl font-black text-white">{view === "board" ? "Customer Journey Board" : "Location Customer List"}</h2>
              <p className="mt-1 text-sm text-white/45">
                Stages update from real claim, billing, engagement, and retention signals — not a separate manual status.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <AdminStatusBadge tone="green">{result.totals.paid} paid</AdminStatusBadge>
              <AdminStatusBadge tone="amber">{result.totals.renewals} renewals</AdminStatusBadge>
              <AdminStatusBadge tone="red">{result.totals.churned} canceled</AdminStatusBadge>
            </div>
          </div>
        </div>

        {view === "board" ? (
          <div className="flex gap-4 overflow-x-auto p-4 sm:p-5">
            {CUSTOMER_LIFECYCLE_STAGES.map((key) => (
              <BoardColumn key={key} stage={key} rows={boardGroups[key]} />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="bg-white/[0.025] text-[10px] font-black uppercase tracking-[0.16em] text-white/35">
                <tr>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Customer stage</th>
                  <th className="px-4 py-3">Health</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Monthly value</th>
                  <th className="px-4 py-3">Renewal</th>
                  <th className="px-4 py-3">Next action</th>
                  <th className="px-4 py-3">Open</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {result.rows.map((row) => (
                  <tr key={row.id} className="align-top text-white/70 hover:bg-white/[0.025]">
                    <td className="px-4 py-4">
                      <p className="font-black text-white">{row.name}</p>
                      <p className="mt-1 text-xs text-white/40">{[row.city, row.state].filter(Boolean).join(", ") || row.address || "—"}</p>
                    </td>
                    <td className="px-4 py-4"><span className="font-black text-white">{row.stageLabel}</span><p className="mt-1 max-w-[220px] text-xs text-white/40">{row.stageHelper}</p></td>
                    <td className="px-4 py-4"><AdminStatusBadge tone={healthTone(row.health)}>{row.healthLabel}</AdminStatusBadge></td>
                    <td className="px-4 py-4"><b className="text-white">{row.planLabel}</b><p className="mt-1 text-xs text-white/40">{row.billingLabel}</p></td>
                    <td className="px-4 py-4 font-black text-white">{row.monthlyValueCents ? money(row.monthlyValueCents) : "—"}</td>
                    <td className="px-4 py-4 text-xs">{dateLabel(row.renewalDate)}</td>
                    <td className="px-4 py-4"><p className="max-w-[240px] font-bold text-white">{row.nextAction}</p>{row.nextActionDueAt ? <p className="mt-1 text-xs text-white/40">Due {dateLabel(row.nextActionDueAt)}</p> : null}</td>
                    <td className="px-4 py-4"><Link href={`/admin/dashboard/crm/customer-lifecycle/${row.id}`} className="rounded-lg border border-rose-300/25 bg-rose-500/10 px-3 py-2 text-xs font-black text-rose-100">Customer view</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {view === "table" ? (
          <div className="flex items-center justify-between gap-3 border-t border-white/10 p-4 text-sm">
            <span className="text-white/45">Page {result.page} of {result.totalPages} · {result.total} locations</span>
            <div className="flex gap-2">
              <Link aria-disabled={result.page <= 1} href={result.page <= 1 ? "#" : pageHref(result.page - 1)} className={`rounded-xl border border-white/10 px-4 py-2 font-black ${result.page <= 1 ? "pointer-events-none text-white/20" : "text-white/70 hover:bg-white/[0.05]"}`}>Previous</Link>
              <Link aria-disabled={result.page >= result.totalPages} href={result.page >= result.totalPages ? "#" : pageHref(result.page + 1)} className={`rounded-xl border border-white/10 px-4 py-2 font-black ${result.page >= result.totalPages ? "pointer-events-none text-white/20" : "text-white/70 hover:bg-white/[0.05]"}`}>Next</Link>
            </div>
          </div>
        ) : null}
      </AdminSectionCard>
    </AdminPageShell>
  );
}
