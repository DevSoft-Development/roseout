import type { Metadata } from "next";
import type React from "react";
import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { readAdminBillingSnapshot, type AdminBillingRow } from "@/lib/admin/admin-billing";
import { BUSINESS_PRO_MONTHLY_CENTS, formatBillingMoney, getBillingPlanLabel, getBillingStatusLabel, isBusinessProPlan } from "@/lib/billing/plans";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Billing | TheOutHaven Admin", description: "Stripe billing operations command center." };

type Row = AdminBillingRow;
const nameOf = (r: Row) => r.name || r.restaurant_name || r.activity_name || "Untitled location";
const date = (v?: string | null) => v ? new Date(v).toLocaleDateString() : "—";
const amount = (r: Row) => Number(r.subscription_amount_cents || (isBusinessProPlan(r.subscription_plan) && r.subscription_status === "active" ? BUSINESS_PRO_MONTHLY_CENTS : 0));

export default async function BillingPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.billing);
  const snapshot = await readAdminBillingSnapshot();
  const { metrics, upcomingRows, pastDueRows, recentEvents, trialRows, sourceError } = snapshot;

  return <main className="min-h-screen bg-[#090706] p-6 text-white"><div className="mx-auto max-w-[1400px] space-y-6">
    <section className="rounded-[2rem] border border-white/10 bg-[#120d0b] p-6"><p className="text-xs font-black uppercase tracking-[0.28em] text-rose-200/70">Stripe operations</p><div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><h1 className="text-3xl font-black">Billing command center</h1><p className="mt-2 max-w-3xl text-sm text-white/60">Real subscription lifecycle, Stripe event, collection, upcoming renewal, and failed payment data.</p></div><Link href="/admin/dashboard/plans" className="rounded-full bg-white px-4 py-2 text-sm font-black text-black">Open Plans</Link></div></section>
    {sourceError ? <div className="rounded-3xl border border-amber-300/30 bg-amber-500/10 p-4 text-sm font-bold text-amber-100">Billing data is temporarily unavailable from the primary read path.</div> : null}
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"><Metric label="Active paid locations" value={String(metrics.activePaidLocations)} /><Metric label="Trialing locations" value={String(metrics.trialingLocations)} /><Metric label="Past due locations" value={String(metrics.pastDueLocations)} /><Metric label="Canceled this month" value={String(metrics.canceledThisMonth)} /><Metric label="MRR" value={formatBillingMoney(metrics.mrrCents)} /><Metric label="ARR" value={formatBillingMoney(metrics.arrCents)} /><Metric label="Collected this month" value={formatBillingMoney(metrics.collectedThisMonthCents)} /><Metric label="Upcoming next 7 days" value={String(metrics.upcoming7d)} /><Metric label="Upcoming next 30 days" value={String(metrics.upcoming30d)} /><Metric label="Past due estimated amount" value={formatBillingMoney(metrics.pastDueEstimatedCents)} /></section>
    <Table title="Upcoming charges" rows={upcomingRows} columns={["Location", "Plan", "Status", "Next billing", "Amount", "Stripe customer"]} render={(r)=><><td>{nameOf(r)}</td><td>{getBillingPlanLabel(r.subscription_plan)}</td><td>{getBillingStatusLabel(r.subscription_status)}</td><td>{date(r.next_billing_date)}</td><td>{formatBillingMoney(amount(r))}</td><td>{r.stripe_customer_id || "—"}</td></>} />
    <Table title="Past due / failed payments" rows={pastDueRows} columns={["Location", "Status", "Failed at", "Grace ends", "Amount", "Open"]} render={(r)=><><td>{nameOf(r)}</td><td>{getBillingStatusLabel(r.subscription_status)}</td><td>{date(r.last_payment_failed_at)}</td><td>{date(r.billing_grace_ends_at)}</td><td>{formatBillingMoney(amount(r))}</td><td><Link className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-black" href={`/admin/dashboard/crm/${r.id}`}>Open</Link></td></>} />
    <Table title="Recent Stripe events" rows={recentEvents} columns={["Event", "Status", "Amount paid", "Invoice", "Location", "Created"]} render={(r)=><><td>{r.event_type}</td><td>{r.status || "—"}</td><td>{formatBillingMoney(r.amount_paid_cents)}</td><td>{r.stripe_invoice_id || "—"}</td><td>{r.location_id || "—"}</td><td>{date(r.created_at)}</td></>} />
    <Table title="Trial ending soon" rows={trialRows} columns={["Location", "Trial ends", "Customer", "Subscription", "Open"]} render={(r)=><><td>{nameOf(r)}</td><td>{date(r.trial_ends_at)}</td><td>{r.stripe_customer_id || "—"}</td><td>{r.stripe_subscription_id || "—"}</td><td><Link className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-black" href={`/admin/dashboard/crm/${r.id}`}>Open</Link></td></>} />
  </div></main>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4"><p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></div>; }
function Table({ title, rows, columns, render }: { title: string; rows: Row[]; columns: string[]; render: (row: Row) => React.ReactNode }) { return <section className="rounded-[2rem] border border-white/10 bg-[#120d0b] p-5"><h2 className="text-xl font-black">{title}</h2><div className="mt-4 overflow-x-auto rounded-2xl border border-white/10"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-white/[0.05] text-xs uppercase tracking-[0.2em] text-white/45"><tr>{columns.map((h)=><th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody className="divide-y divide-white/10">{rows.map((r)=><tr key={r.id} className="[&_td]:px-4 [&_td]:py-3">{render(r)}</tr>)}{!rows.length ? <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-white/50">No records found.</td></tr> : null}</tbody></table></div></section>; }
