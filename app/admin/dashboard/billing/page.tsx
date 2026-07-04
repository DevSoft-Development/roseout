import type { Metadata } from "next";
import type React from "react";
import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { BUSINESS_PRO_MONTHLY_CENTS, formatBillingMoney, getBillingPlanLabel, getBillingStatusLabel, isBusinessProPlan } from "@/lib/billing/plans";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Billing | TheOutHaven Admin", description: "Stripe billing operations command center." };

type Row = Record<string, any> & { id: string };
const SELECT = "id,name,restaurant_name,activity_name,owner_email,claimed_by_email,subscription_plan,subscription_status,subscription_amount_cents,subscription_interval,next_billing_date,current_period_end,trial_ends_at,stripe_customer_id,stripe_subscription_id,last_payment_failed_at,billing_grace_ends_at,canceled_at,created_at";
const nameOf = (r: Row) => r.name || r.restaurant_name || r.activity_name || "Untitled location";
const date = (v?: string | null) => v ? new Date(v).toLocaleDateString() : "—";
const amount = (r: Row) => Number(r.subscription_amount_cents || (isBusinessProPlan(r.subscription_plan) && r.subscription_status === "active" ? BUSINESS_PRO_MONTHLY_CENTS : 0));
function metricCount(rows: Row[], status: string) { return rows.filter((r) => String(r.subscription_status || "") === status).length; }
async function safeRows(table: string, columns = "*", limit = 200) { const result = await supabaseAdmin.from(table).select(columns).order("created_at", { ascending: false }).limit(limit); return result.error ? [] as Row[] : (result.data || []) as unknown as Row[]; }

export default async function BillingPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.billing);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const seven = new Date(Date.now() + 7 * 86400000);
  const thirty = new Date(Date.now() + 30 * 86400000);
  const [{ data, error }, logs] = await Promise.all([
    supabaseAdmin.from("locations").select(SELECT).limit(1000),
    safeRows("payment_logs", "id,event_type,stripe_event_id,stripe_customer_id,stripe_subscription_id,stripe_invoice_id,location_id,amount_paid_cents,amount_due_cents,currency,status,created_at", 100),
  ]);
  const locations = error ? [] as Row[] : (data || []) as Row[];
  const activePaid = locations.filter((r) => ["active", "grace_period", "comped"].includes(String(r.subscription_status)) && isBusinessProPlan(r.subscription_plan));
  const trialing = locations.filter((r) => r.subscription_status === "trialing");
  const pastDue = locations.filter((r) => ["past_due", "unpaid"].includes(String(r.subscription_status)));
  const canceledThisMonth = locations.filter((r) => r.canceled_at && new Date(r.canceled_at) >= monthStart);
  const mrrCents = activePaid.reduce((sum, r) => sum + (r.subscription_interval === "year" || r.subscription_interval === "annual" ? Math.round(amount(r) / 12) : amount(r)), 0);
  const collectedThisMonth = logs.filter((l) => l.event_type === "invoice.payment_succeeded" && new Date(l.created_at) >= monthStart).reduce((s, l) => s + Number(l.amount_paid_cents || 0), 0);
  const upcoming = (days: Date) => locations.filter((r) => r.next_billing_date && new Date(r.next_billing_date) <= days && new Date(r.next_billing_date) >= now);
  const upcomingRows = upcoming(thirty).sort((a,b) => new Date(a.next_billing_date).getTime() - new Date(b.next_billing_date).getTime()).slice(0, 20);
  const trialRows = trialing.filter((r) => r.trial_ends_at && new Date(r.trial_ends_at) <= thirty).slice(0, 20);

  return <main className="min-h-screen bg-[#090706] p-6 text-white"><div className="mx-auto max-w-[1400px] space-y-6">
    <section className="rounded-[2rem] border border-white/10 bg-[#120d0b] p-6"><p className="text-xs font-black uppercase tracking-[0.28em] text-rose-200/70">Stripe operations</p><div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><h1 className="text-3xl font-black">Billing command center</h1><p className="mt-2 max-w-3xl text-sm text-white/60">Real subscription lifecycle, Stripe event, collection, upcoming renewal, and failed payment data.</p></div><Link href="/admin/dashboard/plans" className="rounded-full bg-white px-4 py-2 text-sm font-black text-black">Open Plans</Link></div></section>
    {error ? <div className="rounded-3xl border border-amber-300/30 bg-amber-500/10 p-4 text-sm font-bold text-amber-100">Billing columns are unavailable until the production billing migration is applied.</div> : null}
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"><Metric label="Active paid locations" value={String(activePaid.length)} /><Metric label="Trialing locations" value={String(trialing.length)} /><Metric label="Past due locations" value={String(pastDue.length)} /><Metric label="Canceled this month" value={String(canceledThisMonth.length)} /><Metric label="MRR" value={formatBillingMoney(mrrCents)} /><Metric label="ARR" value={formatBillingMoney(mrrCents * 12)} /><Metric label="Collected this month" value={formatBillingMoney(collectedThisMonth)} /><Metric label="Upcoming next 7 days" value={String(upcoming(seven).length)} /><Metric label="Upcoming next 30 days" value={String(upcomingRows.length)} /><Metric label="Past due estimated amount" value={formatBillingMoney(pastDue.reduce((s,r)=>s+amount(r),0))} /></section>
    <Table title="Upcoming charges" rows={upcomingRows} columns={["Location", "Plan", "Status", "Next billing", "Amount", "Stripe customer"]} render={(r)=><><td>{nameOf(r)}</td><td>{getBillingPlanLabel(r.subscription_plan)}</td><td>{getBillingStatusLabel(r.subscription_status)}</td><td>{date(r.next_billing_date)}</td><td>{formatBillingMoney(amount(r))}</td><td>{r.stripe_customer_id || "—"}</td></>} />
    <Table title="Past due / failed payments" rows={pastDue} columns={["Location", "Status", "Failed at", "Grace ends", "Amount", "Open"]} render={(r)=><><td>{nameOf(r)}</td><td>{getBillingStatusLabel(r.subscription_status)}</td><td>{date(r.last_payment_failed_at)}</td><td>{date(r.billing_grace_ends_at)}</td><td>{formatBillingMoney(amount(r))}</td><td><Link className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-black" href={`/admin/dashboard/crm/${r.id}`}>Open</Link></td></>} />
    <Table title="Recent Stripe events" rows={logs.slice(0,20)} columns={["Event", "Status", "Amount paid", "Invoice", "Location", "Created"]} render={(r)=><><td>{r.event_type}</td><td>{r.status || "—"}</td><td>{formatBillingMoney(r.amount_paid_cents)}</td><td>{r.stripe_invoice_id || "—"}</td><td>{r.location_id || "—"}</td><td>{date(r.created_at)}</td></>} />
    <Table title="Trial ending soon" rows={trialRows} columns={["Location", "Trial ends", "Customer", "Subscription", "Open"]} render={(r)=><><td>{nameOf(r)}</td><td>{date(r.trial_ends_at)}</td><td>{r.stripe_customer_id || "—"}</td><td>{r.stripe_subscription_id || "—"}</td><td><Link className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-black" href={`/admin/dashboard/crm/${r.id}`}>Open</Link></td></>} />
  </div></main>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4"><p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></div>; }
function Table({ title, rows, columns, render }: { title: string; rows: Row[]; columns: string[]; render: (row: Row) => React.ReactNode }) { return <section className="rounded-[2rem] border border-white/10 bg-[#120d0b] p-5"><h2 className="text-xl font-black">{title}</h2><div className="mt-4 overflow-x-auto rounded-2xl border border-white/10"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-white/[0.05] text-xs uppercase tracking-[0.2em] text-white/45"><tr>{columns.map((h)=><th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody className="divide-y divide-white/10">{rows.map((r)=><tr key={r.id} className="[&_td]:px-4 [&_td]:py-3">{render(r)}</tr>)}{!rows.length ? <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-white/50">No records found.</td></tr> : null}</tbody></table></div></section>; }
