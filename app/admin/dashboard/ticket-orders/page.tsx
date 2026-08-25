import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type Params = Promise<Record<string, string | string[] | undefined>>;
type UnifiedOrder = {
  id: string;
  kind: "Event" | "Experience";
  title: string;
  customer: string;
  email: string;
  quantity: number;
  status: string;
  paymentStatus: string;
  delivery: string;
  checkin: string;
  grossCents: number;
  platformFeeCents: number;
  ownerNetCents: number;
  currency: string;
  ownerType: string;
  ownerId: string | null;
  providerAccountId: string | null;
  providerPaymentIntentId: string | null;
  createdAt: string;
};

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }
function money(cents: number, currency = "usd") { return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format((Number(cents) || 0) / 100); }
function pill(value: string) {
  const v = value.toLowerCase();
  const cls = v.includes("paid") || v.includes("confirmed") || v.includes("sent") || v.includes("checked") || v.includes("completed") ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200" : v.includes("failed") || v.includes("refund") || v.includes("cancel") || v.includes("dispute") ? "border-red-400/25 bg-red-400/10 text-red-200" : "border-white/10 bg-white/[0.04] text-white/65";
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-bold ${cls}`}>{value || "—"}</span>;
}

export default async function TicketOrdersPage({ searchParams }: { searchParams: Params }) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.ticketOrders);
  const params = await searchParams;
  const q = (first(params.q) || "").trim().toLowerCase();
  const type = (first(params.type) || "all").toLowerCase();
  const payment = (first(params.payment) || "all").toLowerCase();

  const [{ data: eventOrders, error: eventError }, { data: experienceBookings, error: experienceError }] = await Promise.all([
    supabaseAdmin.from("event_ticket_orders").select("id,event_id,purchaser_name,purchaser_email,quantity,status,email_delivery_status,sms_delivery_status,payment_status,currency,total_cents,platform_fee_cents,organizer_net_estimate_cents,provider_account_id,provider_payment_intent_id,created_at").order("created_at", { ascending: false }).limit(300),
    supabaseAdmin.from("experience_bookings").select("id,experience_id,customer_name,customer_email,party_size,status,email_delivery_status,sms_delivery_status,payment_status,amount_cents,checked_in_count,created_at").order("created_at", { ascending: false }).limit(300),
  ]);
  if (eventError) throw eventError;
  if (experienceError) throw experienceError;

  const eventIds = [...new Set((eventOrders || []).map((r) => r.event_id).filter(Boolean))];
  const experienceIds = [...new Set((experienceBookings || []).map((r) => r.experience_id).filter(Boolean))];
  const [{ data: events }, { data: experiences }, { data: tickets }] = await Promise.all([
    eventIds.length ? supabaseAdmin.from("events").select("id,title,location_id,organization_id").in("id", eventIds) : Promise.resolve({ data: [] as any[] }),
    experienceIds.length ? supabaseAdmin.from("experiences").select("id,title,location_id,organization_id,currency").in("id", experienceIds) : Promise.resolve({ data: [] as any[] }),
    eventIds.length ? supabaseAdmin.from("event_tickets").select("order_id,status").in("event_id", eventIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const eventMap = new Map((events || []).map((row: any) => [row.id, row]));
  const experienceMap = new Map((experiences || []).map((row: any) => [row.id, row]));
  const ticketMap = new Map((tickets || []).map((row: any) => [row.order_id, row.status]));

  const rows: UnifiedOrder[] = [
    ...(eventOrders || []).map((row: any) => {
      const item: any = eventMap.get(row.event_id) || {};
      return { id: row.id, kind: "Event" as const, title: item.title || "Event", customer: row.purchaser_name || "—", email: row.purchaser_email || "—", quantity: Number(row.quantity || 1), status: row.status || "—", paymentStatus: row.payment_status || (Number(row.total_cents || 0) > 0 ? "pending" : "free"), delivery: `${row.email_delivery_status || "—"} / ${row.sms_delivery_status || "—"}`, checkin: String(ticketMap.get(row.id) || "not_checked_in"), grossCents: Number(row.total_cents || 0), platformFeeCents: Number(row.platform_fee_cents || 0), ownerNetCents: Number(row.organizer_net_estimate_cents || 0), currency: row.currency || "usd", ownerType: item.location_id ? "Location" : item.organization_id ? "Organizer" : "TheOutHaven", ownerId: item.location_id || item.organization_id || null, providerAccountId: row.provider_account_id || null, providerPaymentIntentId: row.provider_payment_intent_id || null, createdAt: row.created_at };
    }),
    ...(experienceBookings || []).map((row: any) => {
      const item: any = experienceMap.get(row.experience_id) || {};
      return { id: row.id, kind: "Experience" as const, title: item.title || "Experience", customer: row.customer_name || "—", email: row.customer_email || "—", quantity: Number(row.party_size || 1), status: row.status || "—", paymentStatus: row.payment_status || (Number(row.amount_cents || 0) > 0 ? "pending" : "free"), delivery: `${row.email_delivery_status || "—"} / ${row.sms_delivery_status || "—"}`, checkin: Number(row.checked_in_count || 0) > 0 ? `${row.checked_in_count}/${row.party_size} checked in` : "not_checked_in", grossCents: Number(row.amount_cents || 0), platformFeeCents: 0, ownerNetCents: Number(row.amount_cents || 0), currency: item.currency || "usd", ownerType: item.location_id ? "Location" : item.organization_id ? "Organizer" : "TheOutHaven", ownerId: item.location_id || item.organization_id || null, providerAccountId: null, providerPaymentIntentId: row.provider_payment_intent_id || null, createdAt: row.created_at };
    }),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const filtered = rows.filter((row) => {
    if (type !== "all" && row.kind.toLowerCase() !== type) return false;
    if (payment !== "all" && row.paymentStatus.toLowerCase() !== payment) return false;
    if (q && !`${row.title} ${row.customer} ${row.email} ${row.id} ${row.providerPaymentIntentId || ""}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const paid = rows.filter((r) => r.paymentStatus === "paid");
  const gross = paid.reduce((sum, r) => sum + r.grossCents, 0);
  const fees = paid.reduce((sum, r) => sum + r.platformFeeCents, 0);
  const problem = rows.filter((r) => ["failed", "refunded", "disputed"].some((s) => r.paymentStatus.includes(s))).length;

  return <div className="min-h-screen bg-[#050607] p-5 text-white lg:p-8">
    <div className="mx-auto max-w-[1500px] space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.2em] text-[#ff6b86]">Commerce</p><h1 className="mt-2 text-3xl font-black">Ticket Orders</h1><p className="mt-2 max-w-3xl text-sm text-white/55">Unified operational ledger for Event ticket orders and Experience bookings. Stripe remains the payment source of truth; this workspace reflects fulfillment, delivery, payment and check-in state.</p></div><Link href="/admin/dashboard/payouts" className="rounded-xl border border-white/10 bg-white/[.05] px-4 py-3 text-sm font-bold">View payouts →</Link></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Orders", rows.length.toString()], ["Paid gross", money(gross)], ["Platform fees", money(fees)], ["Needs attention", problem.toString()]].map(([label,value]) => <div key={label} className="rounded-2xl border border-white/10 bg-white/[.035] p-5"><p className="text-xs font-bold uppercase tracking-wider text-white/40">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>)}</div>
      <form className="grid gap-3 rounded-2xl border border-white/10 bg-white/[.03] p-4 md:grid-cols-[1fr_180px_180px_auto]"><input name="q" defaultValue={first(params.q) || ""} placeholder="Search customer, order, item, payment ID" className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm outline-none"/><select name="type" defaultValue={type} className="rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm"><option value="all">All types</option><option value="event">Events</option><option value="experience">Experiences</option></select><select name="payment" defaultValue={payment} className="rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm"><option value="all">All payments</option><option value="paid">Paid</option><option value="pending">Pending</option><option value="free">Free</option><option value="refunded">Refunded</option><option value="disputed">Disputed</option></select><button className="rounded-xl bg-[#e1062a] px-5 py-3 text-sm font-black">Filter</button></form>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0b0d10]"><div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-sm"><thead className="border-b border-white/10 bg-white/[.035] text-[11px] uppercase tracking-wider text-white/40"><tr>{["Order","Item","Customer","Payment","Fulfillment","Owner","Gross / Fee","Created"].map(h=><th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody className="divide-y divide-white/[.06]">{filtered.map((row) => <tr key={`${row.kind}-${row.id}`} className="hover:bg-white/[.025]"><td className="px-4 py-4"><div className="font-black">{row.kind}</div><div className="mt-1 font-mono text-[10px] text-white/35">{row.id.slice(0,8)}</div></td><td className="px-4 py-4"><div className="max-w-[220px] font-bold">{row.title}</div><div className="mt-1 text-xs text-white/40">Qty {row.quantity}</div></td><td className="px-4 py-4"><div className="font-bold">{row.customer}</div><div className="mt-1 text-xs text-white/45">{row.email}</div></td><td className="px-4 py-4">{pill(row.paymentStatus)}<div className="mt-2">{pill(row.status)}</div>{row.providerPaymentIntentId ? <div className="mt-2 font-mono text-[10px] text-white/35">{row.providerPaymentIntentId}</div> : null}</td><td className="px-4 py-4"><div>{pill(row.checkin)}</div><div className="mt-2 text-xs text-white/45">Email / SMS: {row.delivery}</div></td><td className="px-4 py-4"><div className="font-bold">{row.ownerType}</div>{row.ownerId ? <div className="mt-1 font-mono text-[10px] text-white/35">{row.ownerId.slice(0,8)}</div> : null}</td><td className="px-4 py-4"><div className="font-black">{money(row.grossCents,row.currency)}</div><div className="mt-1 text-xs text-white/45">Fee {money(row.platformFeeCents,row.currency)}</div></td><td className="px-4 py-4 text-white/55">{new Date(row.createdAt).toLocaleString()}</td></tr>)}{filtered.length===0?<tr><td colSpan={8} className="px-6 py-14 text-center text-white/45">No Ticket Orders match these filters yet.</td></tr>:null}</tbody></table></div></div>
    </div>
  </div>;
}
