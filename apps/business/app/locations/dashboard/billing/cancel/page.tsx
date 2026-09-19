import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentBusinessLocation } from "@/lib/growth-pro/data";
import { getLocationName } from "@/lib/locationName";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";
import { stripeRequest } from "@/lib/stripe/server";
import { calculateSubscriptionTenureMonths, getRetentionOffer } from "@/lib/billing/retention";
import { ESSENTIALS_PLAN_NAME, essentialsIncludedFeatures, partnerProDowngradeChanges } from "@/lib/billing/plan-offerings";
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
    return <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-white"><h1 className="text-2xl font-black">No active subscription to downgrade</h1><Link href="/locations/dashboard/billing" className="mt-5 inline-flex rounded-full bg-white px-5 py-3 text-sm font-black text-black">Back to billing</Link></div>;
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
  const locationName = getLocationName(location, "this location");

  const usageDetail: Record<string, string | undefined> = {
    Analytics: `${Number(summary.profile_views || 0).toLocaleString()} profile views, ${Number(summary.search_clicks || 0).toLocaleString()} search clicks and ${Number(summary.completed_outings || 0).toLocaleString()} completed outings tracked in the last 90 days. Essentials keeps profile-view analytics only.`,
    "TheOutHaven Reserve bookings": reservationCount > 0 ? `${reservationCount.toLocaleString()} reservations managed in the last 90 days.` : undefined,
    "Reservation and waitlist dashboard": reservationCount > 0 ? `${reservationCount.toLocaleString()} reservations managed in the last 90 days.` : undefined,
    "Reservation deposits and Stripe payouts": paidDeposits > 0 || location.deposits_enabled ? `${paidDeposits.toLocaleString()} paid deposits in the last 90 days${location.deposits_enabled ? " · deposits are currently enabled" : ""}.` : undefined,
    "Placement in TheOutHaven search": `${Number(summary.search_clicks || 0).toLocaleString()} search clicks tracked in the last 90 days. Boosted placement returns to Standard.`,
  };

  return <div className="space-y-6 text-white">
    <section className="rounded-3xl border border-rose-400/20 bg-rose-500/[0.07] p-6 sm:p-8">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-200">Partner Pro → {ESSENTIALS_PLAN_NAME}</p>
      <h1 className="mt-3 text-3xl font-black sm:text-4xl">Review your downgrade before you continue</h1>
      <p className="mt-3 max-w-3xl text-sm font-bold leading-6 text-white/60">{locationName} will not be deleted. Partner Pro stays active until {formatDate(periodEnd)}. On that date, the location automatically moves to <span className="text-white">{ESSENTIALS_PLAN_NAME} — Free</span> and your public listing remains live.</p>
    </section>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Profile views · 90d" value={summary.profile_views || 0}/>
      <Metric label="Search clicks · 90d" value={summary.search_clicks || 0}/>
      <Metric label="Reservations · 90d" value={reservationCount}/>
      <Metric label="Completed outings · 90d" value={summary.completed_outings || 0}/>
    </section>

    <section className="rounded-3xl border border-emerald-400/20 bg-emerald-500/[0.07] p-6">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-200">What stays with {ESSENTIALS_PLAN_NAME}</p>
      <h2 className="mt-2 text-2xl font-black">Your location stays active on TheOutHaven</h2>
      <p className="mt-2 text-sm font-bold leading-6 text-white/55">These are the exact free-plan capabilities currently advertised on our Business Plans page.</p>
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {essentialsIncludedFeatures.map(({ feature, essentials }) => <div key={feature} className="rounded-2xl border border-emerald-300/10 bg-black/20 p-4"><p className="font-black">{feature}</p><p className="mt-1 text-sm font-bold text-emerald-100/65">{essentials}</p></div>)}
      </div>
    </section>

    <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200">What changes after downgrade</p>
      <h2 className="mt-2 text-2xl font-black">Partner Pro features that end or become limited</h2>
      <p className="mt-2 text-sm font-bold leading-6 text-white/50">This comparison uses the same feature matrix as `/business/plans`, so it stays in sync with your current offering.</p>
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {partnerProDowngradeChanges.map(({ feature, essentials, partnerPro }) => <div key={feature} className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-black">{feature}</p><span className="rounded-full border border-white/10 px-3 py-1 text-[11px] font-black text-white/55">{partnerPro} → {essentials === "—" ? "Not included" : essentials}</span></div>{usageDetail[feature] ? <p className="mt-2 text-sm font-bold leading-6 text-white/50">{usageDetail[feature]}</p> : null}</div>)}
      </div>
    </section>

    {!offerAlreadyUsed ? <section className="rounded-3xl border border-[#f5b700]/30 bg-[#f5b700]/10 p-6"><p className="text-xs font-black uppercase tracking-[0.2em] text-[#ffd85d]">A save offer based on your time with us</p><h2 className="mt-2 text-2xl font-black">{annual ? `${offer.discountPercent}% off your next annual renewal` : offer.label}</h2><p className="mt-2 text-sm font-bold leading-6 text-amber-50/70">You’ve been subscribed for about {tenureMonths} month{tenureMonths === 1 ? "" : "s"}. This offer is automatically calculated from tenure and can be used once for this subscription.</p></section> : <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-sm font-bold text-white/55">A retention discount has already been used on this subscription. You can still keep Partner Pro or continue to Essentials.</section>}

    <form action="/api/business/billing/cancel-retention" method="POST" className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
      <input type="hidden" name="location_id" value={location.id}/>
      <h2 className="text-xl font-black">Why are you thinking about downgrading?</h2>
      <p className="mt-2 text-sm font-bold text-white/50">Your answer is saved with the downgrade attempt so we can improve the product.</p>
      <div className="mt-5 grid gap-3 md:grid-cols-2">{reasonOptions.map(([value, label]) => <label key={value} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm font-bold hover:border-white/25"><input type="radio" name="reason_code" value={value} required className="h-4 w-4"/><span>{label}</span></label>)}</div>
      <label className="mt-5 block"><span className="text-sm font-black">Anything else you want us to know?</span><textarea name="reason_text" rows={4} maxLength={2000} placeholder="Tell us what would make TheOutHaven more valuable for your business…" className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/30"/></label>
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <Link href="/locations/dashboard/billing" className="flex items-center justify-center rounded-2xl border border-white/10 px-5 py-4 text-sm font-black hover:bg-white/10">Keep Partner Pro</Link>
        {!offerAlreadyUsed ? <button type="submit" name="decision" value="accept_offer" className="rounded-2xl bg-[#f5b700] px-5 py-4 text-sm font-black text-black hover:bg-amber-300">Accept {annual ? `${offer.discountPercent}% renewal discount` : offer.label}</button> : null}
        <button type="submit" name="decision" value="confirm_cancel" className="rounded-2xl border border-rose-400/40 px-5 py-4 text-sm font-black text-rose-100 hover:bg-rose-500/10">Yes, move to Essentials on {formatDate(periodEnd)}</button>
      </div>
      <p className="mt-4 text-xs font-bold leading-5 text-white/35">Confirming schedules the Partner Pro subscription to end at the close of the current paid period. Your location then continues on Essentials — Free. Existing location records are not deleted.</p>
    </form>
  </div>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-white/40">{label}</p><p className="mt-2 text-3xl font-black">{Number(value || 0).toLocaleString()}</p></div>; }
