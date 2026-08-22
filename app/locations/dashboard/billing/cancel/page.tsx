import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentBusinessLocation } from "@/lib/growth-pro/data";
import { getLocationName } from "@/lib/locationName";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";
import { stripeRequest } from "@/lib/stripe/server";
import { calculateSubscriptionTenureMonths, getRetentionOffer } from "@/lib/billing/retention";
import { buildAnalyticsSummary, getEventLocationId, getOutingLocationId, type AnalyticsEventRow, type OutingRow } from "@/lib/analytics/new-business-analytics";

export const dynamic = "force-dynamic";
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type StripeSubscription = { id: string; created?: number; current_period_end?: number };

const reasonOptions = [["too_expensive", "The price is too high"], ["not_using_enough", "I’m not using it enough"], ["missing_features", "I need features you don’t have"], ["business_closed", "The business is closing / closed"], ["switching_service", "I’m switching to another service"], ["temporary_pause", "I only need to reduce costs temporarily"], ["other", "Other"]] as const;

function formatDate(value?: string | null) {
  if (!value) return "your current billing period end";
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(value));
}

async function resolveLocation(requestedLocationId?: string) {
  if (!requestedLocationId) return getCurrentBusinessLocation();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const access = await requireOwnerOrAdminAccessToLocation(user.id, requestedLocationId);
  if (!access) redirect("/locations/dashboard/billing");
  const { data } = await supabaseAdmin.from("locations").select("*").eq("id", requestedLocationId).maybeSingle();
  return data || null;
}

export default async function CancelLocationSubscriptionPage({ searchParams }: { searchParams?: SearchParams }) {
  const params = searchParams ? await searchParams : {};
  const requestedLocationId = typeof params.locationId === "string" ? params.locationId : undefined;
  const location = await resolveLocation(requestedLocationId);
  if (!location?.stripe_subscription_id) {
    return <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-white"><h1 className="text-2xl font-black">No active subscription to cancel</h1><Link href="/locations/dashboard/billing" className="mt-5 inline-flex rounded-full bg-white px-5 py-3 text-sm font-black text-black">Back to billing</Link></div>;
  }

  let subscription: StripeSubscription | null = null;
  try { subscription = await stripeRequest<StripeSubscription>(`/subscriptions/${encodeURIComponent(location.stripe_subscription_id)}`, { method: "GET" }); } catch { subscription = null; }
  const tenureMonths = calculateSubscriptionTenureMonths(subscription?.created);
  const offer = getRetentionOffer(tenureMonths);
  const annual = String(location.subscription_interval || "").toLowerCase() === "year";
  const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();

  const [eventResult, outingResult, reservationResult, paidDepositResult, acceptedOfferResult] = await Promise.all([
    supabaseAdmin.from("analytics_events").select("id,event_name,event_type,location_id,metadata,created_at").eq("location_id", location.id).gte("created_at", cutoff),
    supabaseAdmin.from("outings").select("id,created_at,location_id,restaurant_id,activity_id,status").or(`location_id.eq.${location.id},restaurant_id.eq.${location.id},activity_id.eq.${location.id}`).gte("created_at", cutoff),
    supabaseAdmin.from("location_reservations").select("id", { count: "exact", head: true }).eq("location_id", location.id).gte("created_at", cutoff),
    supabaseAdmin.from("location_reservations").select("id", { count: "exact", head: true }).eq("location_id", location.id).eq("deposit_status", "paid").gte("created_at", cutoff),
    supabaseAdmin.from("subscription_cancellation_feedback").select("id").eq("stripe_subscription_id", location.stripe_subscription_id).eq("offer_accepted", true).limit(1).maybeSingle(),
  ]);

  const events = ((eventResult.data || []) as AnalyticsEventRow[]).filter((row) => getEventLocationId(row) === location.id);
  const outings = ((outingResult.data || []) as OutingRow[]).filter((row) => getOutingLocationId(row) === location.id);
  const summary = buildAnalyticsSummary(events, outings);
  const reservationCount = reservationResult.count || 0;
  const paidDeposits = paidDepositResult.count || 0;
  const offerAlreadyUsed = Boolean(acceptedOfferResult.data?.id);
  const periodEnd = subscription?.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : location.current_period_end;
  const lossItems = [
    { title: "Business analytics", detail: `${Number(summary.profile_views || 0).toLocaleString()} profile views and ${Number(summary.search_clicks || 0).toLocaleString()} search clicks tracked in the last 90 days`, active: true },
    { title: "Reservation performance", detail: `${reservationCount.toLocaleString()} reservations plus ${Number(summary.reservation_starts || 0).toLocaleString()} tracked reserve starts in the last 90 days`, active: reservationCount > 0 || Number(summary.reservation_starts || 0) > 0 },
    { title: "Completed outing attribution", detail: `${Number(summary.reservation_completions || 0).toLocaleString()} completed outings attributed in the last 90 days`, active: Number(summary.reservation_completions || 0) > 0 },
    { title: "Reservation deposits", detail: `${paidDeposits.toLocaleString()} paid deposits in the last 90 days${location.deposits_enabled ? " · deposits are currently enabled" : ""}`, active: Boolean(location.deposits_enabled) || paidDeposits > 0 },
    { title: "Partner Pro discovery tools", detail: "Paid discovery, promotion, Growth Pro, and advanced location tools revert when the paid period ends", active: true },
  ].filter((item) => item.active);

  return <div className="space-y-6 text-white">
    <section className="rounded-3xl border border-rose-400/20 bg-rose-500/[0.07] p-6 sm:p-8"><p className="text-xs font-black uppercase tracking-[0.22em] text-rose-200">Before you cancel</p><h1 className="mt-3 text-3xl font-black sm:text-4xl">Review what {getLocationName(location, "this location")} will lose</h1><p className="mt-3 max-w-3xl text-sm font-bold leading-6 text-white/60">Nothing ends today. If you confirm cancellation, Partner Pro remains available until {formatDate(periodEnd)} and then the paid features below are removed.</p></section>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Profile views · 90d" value={summary.profile_views || 0}/><Metric label="Search clicks · 90d" value={summary.search_clicks || 0}/><Metric label="Reservations · 90d" value={reservationCount}/><Metric label="Completed outings · 90d" value={summary.reservation_completions || 0}/></section>
    <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6"><h2 className="text-xl font-black">Features and data access affected</h2><div className="mt-4 grid gap-3 lg:grid-cols-2">{lossItems.map((item) => <div key={item.title} className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="font-black">{item.title}</p><p className="mt-1 text-sm font-bold leading-6 text-white/50">{item.detail}</p></div>)}</div></section>
    {!offerAlreadyUsed ? <section className="rounded-3xl border border-[#f5b700]/30 bg-[#f5b700]/10 p-6"><p className="text-xs font-black uppercase tracking-[0.2em] text-[#ffd85d]">A save offer based on your time with us</p><h2 className="mt-2 text-2xl font-black">{annual ? `${offer.discountPercent}% off your next annual renewal` : offer.label}</h2><p className="mt-2 text-sm font-bold leading-6 text-amber-50/70">You’ve been subscribed for about {tenureMonths} month{tenureMonths === 1 ? "" : "s"}. This offer is automatically calculated from tenure and can be used once for this subscription.</p></section> : <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-sm font-bold text-white/55">A retention discount has already been used on this subscription. You can still keep the plan or continue with cancellation.</section>}
    <form action="/api/business/billing/cancel-retention" method="POST" className="rounded-3xl border border-white/10 bg-white/[0.04] p-6"><input type="hidden" name="location_id" value={location.id}/><h2 className="text-xl font-black">Why are you thinking about leaving?</h2><p className="mt-2 text-sm font-bold text-white/50">Your answer is saved with the cancellation attempt so we can improve the product.</p><div className="mt-5 grid gap-3 md:grid-cols-2">{reasonOptions.map(([value, label]) => <label key={value} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm font-bold hover:border-white/25"><input type="radio" name="reason_code" value={value} required className="h-4 w-4"/><span>{label}</span></label>)}</div><label className="mt-5 block"><span className="text-sm font-black">Anything else you want us to know?</span><textarea name="reason_text" rows={4} maxLength={2000} placeholder="Tell us what would make TheOutHaven more valuable for your business…" className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/30"/></label><div className="mt-6 grid gap-3 md:grid-cols-3"><Link href="/locations/dashboard/billing" className="flex items-center justify-center rounded-2xl border border-white/10 px-5 py-4 text-sm font-black hover:bg-white/10">Keep my plan</Link>{!offerAlreadyUsed ? <button type="submit" name="decision" value="accept_offer" className="rounded-2xl bg-[#f5b700] px-5 py-4 text-sm font-black text-black hover:bg-amber-300">Accept {annual ? `${offer.discountPercent}% renewal discount` : offer.label}</button> : null}<button type="submit" name="decision" value="confirm_cancel" className="rounded-2xl border border-rose-400/40 px-5 py-4 text-sm font-black text-rose-100 hover:bg-rose-500/10">Confirm cancellation</button></div><p className="mt-4 text-xs font-bold leading-5 text-white/35">Confirming cancellation schedules it for the end of the current paid period. It does not delete the location or erase existing records.</p></form>
  </div>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-white/40">{label}</p><p className="mt-2 text-3xl font-black">{Number(value || 0).toLocaleString()}</p></div>; }
