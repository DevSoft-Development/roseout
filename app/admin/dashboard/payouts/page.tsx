import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { stripeRequest } from "@/lib/stripe/server";

export const dynamic = "force-dynamic";

type BalanceAmount = { amount: number; currency: string };
type StripeBalance = { available?: BalanceAmount[]; pending?: BalanceAmount[] };
type StripePayout = { id: string; amount: number; currency: string; status: string; arrival_date?: number; created?: number; method?: string; type?: string; failure_code?: string | null; failure_message?: string | null; destination?: string | null };
type StripeList<T> = { data?: T[] };
type Owner = { ownerType: "Location" | "Organizer"; ownerId: string; name: string; accountId: string; apiVersion: string; onboarding: string; payoutsEnabled: boolean; chargesEnabled: boolean; requiresAction: boolean; updatedAt: string | null; };
type AccountSnapshot = Owner & { available: BalanceAmount[]; pending: BalanceAmount[]; payouts: StripePayout[]; error: string | null };

function money(amount: number, currency = "usd") { return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format((Number(amount) || 0) / 100); }
function total(items: BalanceAmount[] | undefined, currency = "usd") { return (items || []).filter((x) => String(x.currency).toLowerCase() === currency).reduce((sum, x) => sum + Number(x.amount || 0), 0); }
function statusClass(value: string) { const v = value.toLowerCase(); return v === "paid" || v === "complete" || v === "active" ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : v.includes("fail") || v.includes("cancel") || v.includes("restricted") ? "border-red-400/25 bg-red-400/10 text-red-200" : "border-amber-300/20 bg-amber-300/10 text-amber-100"; }
function badge(value: string) { return <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-bold ${statusClass(value)}`}>{value || "unknown"}</span>; }

async function loadSnapshot(owner: Owner): Promise<AccountSnapshot> {
  try {
    const [balance, payouts] = await Promise.all([
      stripeRequest<StripeBalance>("/balance", { method: "GET", stripeAccount: owner.accountId }),
      stripeRequest<StripeList<StripePayout>>("/payouts?limit=10", { method: "GET", stripeAccount: owner.accountId }),
    ]);
    return { ...owner, available: balance.available || [], pending: balance.pending || [], payouts: payouts.data || [], error: null };
  } catch (error) {
    return { ...owner, available: [], pending: [], payouts: [], error: error instanceof Error ? error.message : "Unable to read Stripe account" };
  }
}

export default async function PayoutsPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.payouts);
  const [{ data: locations, error: locationError }, { data: organizations, error: organizationError }, { data: payoutLogs }] = await Promise.all([
    supabaseAdmin.from("locations").select("id,name,restaurant_name,activity_name,stripe_connect_account_id,stripe_connect_account_api_version,stripe_connect_onboarding_status,stripe_connect_payouts_enabled,stripe_connect_charges_enabled,stripe_connect_requires_action,stripe_connect_updated_at").not("stripe_connect_account_id", "is", null).limit(100),
    supabaseAdmin.from("organizations").select("id,name,stripe_connect_account_id,stripe_connect_account_api_version,stripe_connect_onboarding_status,stripe_connect_payouts_enabled,stripe_connect_charges_enabled,stripe_connect_requires_action,stripe_connect_updated_at").not("stripe_connect_account_id", "is", null).limit(100),
    supabaseAdmin.from("payment_logs").select("id,event_type,payload,created_at,processing_error").like("event_type", "payout.%").order("created_at", { ascending: false }).limit(50),
  ]);
  if (locationError) throw locationError;
  if (organizationError) throw organizationError;

  const owners: Owner[] = [
    ...(locations || []).map((row: any) => ({ ownerType: "Location" as const, ownerId: row.id, name: row.name || row.restaurant_name || row.activity_name || "Location", accountId: String(row.stripe_connect_account_id), apiVersion: row.stripe_connect_account_api_version || "v1", onboarding: row.stripe_connect_onboarding_status || "unknown", payoutsEnabled: Boolean(row.stripe_connect_payouts_enabled), chargesEnabled: Boolean(row.stripe_connect_charges_enabled), requiresAction: Boolean(row.stripe_connect_requires_action), updatedAt: row.stripe_connect_updated_at || null })),
    ...(organizations || []).map((row: any) => ({ ownerType: "Organizer" as const, ownerId: row.id, name: row.name || "Organizer", accountId: String(row.stripe_connect_account_id), apiVersion: row.stripe_connect_account_api_version || "v1", onboarding: row.stripe_connect_onboarding_status || "unknown", payoutsEnabled: Boolean(row.stripe_connect_payouts_enabled), chargesEnabled: Boolean(row.stripe_connect_charges_enabled), requiresAction: Boolean(row.stripe_connect_requires_action), updatedAt: row.stripe_connect_updated_at || null })),
  ];
  const snapshots = await Promise.all(owners.map(loadSnapshot));
  const usdAvailable = snapshots.reduce((sum, s) => sum + total(s.available), 0);
  const usdPending = snapshots.reduce((sum, s) => sum + total(s.pending), 0);
  const recentPayouts = snapshots.flatMap((s) => s.payouts.map((p) => ({ ...p, ownerName: s.name, ownerType: s.ownerType, accountId: s.accountId }))).sort((a, b) => Number(b.created || 0) - Number(a.created || 0));
  const paid30d = recentPayouts.filter((p) => p.status === "paid" && Number(p.created || 0) >= Math.floor((Date.now() - 30 * 86400000) / 1000)).reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const failed = recentPayouts.filter((p) => p.status === "failed").length;

  return <div className="min-h-screen bg-[#050607] p-5 text-white lg:p-8">
    <div className="mx-auto max-w-[1500px] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.2em] text-[#ff6b86]">Commerce</p><h1 className="mt-2 text-3xl font-black">Payouts</h1><p className="mt-2 max-w-3xl text-sm text-white/55">Stripe Connect payout oversight for locations and organizers. TheOutHaven does not manually release seller funds here; connected businesses control payout settings in Stripe, while this workspace monitors readiness, balances, payout status and failures.</p></div><Link href="/admin/dashboard/ticket-orders" className="rounded-xl border border-white/10 bg-white/[.05] px-4 py-3 text-sm font-bold">← Ticket Orders</Link></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[["Connected accounts", owners.length.toString()], ["Available balance", money(usdAvailable)], ["Pending balance", money(usdPending)], ["Paid · recent", money(paid30d)], ["Failed payouts", failed.toString()]].map(([label,value]) => <div key={label} className="rounded-2xl border border-white/10 bg-white/[.035] p-5"><p className="text-xs font-bold uppercase tracking-wider text-white/40">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>)}</div>

      <section className="rounded-2xl border border-white/10 bg-[#0b0d10] p-5"><div className="mb-4"><h2 className="text-lg font-black">Connected account health</h2><p className="mt-1 text-sm text-white/45">Live balance data is read from each connected Stripe account.</p></div><div className="grid gap-3 lg:grid-cols-2">{snapshots.map((row) => <div key={row.accountId} className="rounded-2xl border border-white/10 bg-white/[.025] p-5"><div className="flex items-start justify-between gap-3"><div><div className="font-black">{row.name}</div><div className="mt-1 text-xs text-white/40">{row.ownerType} · {row.apiVersion.toUpperCase()} · {row.accountId}</div></div>{badge(row.onboarding)}</div><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl bg-black/25 p-3"><p className="text-[10px] uppercase tracking-wider text-white/35">Available</p><p className="mt-1 text-lg font-black">{money(total(row.available))}</p></div><div className="rounded-xl bg-black/25 p-3"><p className="text-[10px] uppercase tracking-wider text-white/35">Pending</p><p className="mt-1 text-lg font-black">{money(total(row.pending))}</p></div></div><div className="mt-4 flex flex-wrap gap-2">{badge(row.chargesEnabled ? "charges active" : "charges inactive")}{badge(row.payoutsEnabled ? "payouts active" : "payouts inactive")}{row.requiresAction ? badge("action required") : null}</div>{row.error ? <p className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-xs text-red-200">Stripe read error: {row.error}</p> : null}</div>)}{snapshots.length===0?<div className="col-span-full py-10 text-center text-white/45">No locations or organizers have connected Stripe accounts yet.</div>:null}</div></section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b0d10]"><div className="border-b border-white/10 p-5"><h2 className="text-lg font-black">Recent Stripe payouts</h2><p className="mt-1 text-sm text-white/45">Latest payouts reported directly by connected accounts.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-white/[.035] text-[11px] uppercase tracking-wider text-white/40"><tr>{["Owner","Payout","Amount","Status","Arrival","Method","Failure"].map((h)=><th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody className="divide-y divide-white/[.06]">{recentPayouts.slice(0,50).map((p) => <tr key={`${p.accountId}-${p.id}`}><td className="px-4 py-4"><div className="font-bold">{p.ownerName}</div><div className="text-xs text-white/40">{p.ownerType}</div></td><td className="px-4 py-4 font-mono text-xs text-white/55">{p.id}</td><td className="px-4 py-4 font-black">{money(p.amount,p.currency)}</td><td className="px-4 py-4">{badge(p.status)}</td><td className="px-4 py-4 text-white/55">{p.arrival_date ? new Date(p.arrival_date*1000).toLocaleDateString() : "—"}</td><td className="px-4 py-4 text-white/55">{p.method || p.type || "—"}</td><td className="px-4 py-4 text-xs text-red-200">{p.failure_message || p.failure_code || "—"}</td></tr>)}{recentPayouts.length===0?<tr><td colSpan={7} className="px-6 py-12 text-center text-white/45">No Stripe payouts have been reported yet.</td></tr>:null}</tbody></table></div></section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b0d10]"><div className="border-b border-white/10 p-5"><h2 className="text-lg font-black">Payout webhook audit</h2><p className="mt-1 text-sm text-white/45">Platform-received payout events used for investigation and failure monitoring.</p></div><div className="divide-y divide-white/[.06]">{(payoutLogs || []).map((log: any) => { const object = log.payload?.data?.object || {}; return <div key={log.id} className="grid gap-2 px-5 py-4 md:grid-cols-[180px_1fr_160px_1fr]"><div>{badge(log.event_type || "payout")}</div><div className="font-mono text-xs text-white/55">{object.id || log.id}</div><div className="text-sm font-bold">{object.amount ? money(object.amount, object.currency || "usd") : "—"}</div><div className="text-xs text-white/45">{log.processing_error || object.failure_message || new Date(log.created_at).toLocaleString()}</div></div>})}{(payoutLogs || []).length===0?<div className="px-6 py-10 text-center text-white/45">No payout webhook events yet.</div>:null}</div></section>
    </div>
  </div>;
}
