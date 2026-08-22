import Link from "next/link";
import { getCurrentBusinessLocation } from "@/lib/growth-pro/data";
import { getLocationName } from "@/lib/locationName";
import { getBillingPlanLabel, getBillingStatusLabel, hasPaidEntitlement, isBusinessProPlan } from "@/lib/billing/plans";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function formatDate(value?: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export default async function LocationBillingPage({ searchParams }: { searchParams?: SearchParams }) {
  const params = searchParams ? await searchParams : {};
  const location = await getCurrentBusinessLocation();

  if (!location) {
    return <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8"><h1 className="text-2xl font-black">No location found</h1><p className="mt-2 text-white/55">Connect a location before managing billing.</p></div>;
  }

  const status = String(location.subscription_status || "inactive");
  const isPro = isBusinessProPlan(location.subscription_plan) && hasPaidEntitlement({ plan: location.subscription_plan, status, billingGraceEndsAt: location.billing_grace_ends_at });
  const currentInterval = String(location.subscription_interval || "").toLowerCase() === "year" ? "annual" : "monthly";
  const message = params.retention === "accepted"
    ? "Your loyalty discount is active and your downgrade was stopped."
    : params.retention === "already_used"
      ? "A retention discount has already been used on this subscription."
      : params.cancellation === "scheduled"
        ? `Partner Pro will end on ${formatDate(location.current_period_end)} and this location will move to Essentials — Free.`
        : null;

  return <div className="space-y-6 text-white">
    <section className="rounded-3xl border border-white/10 bg-[linear-gradient(135deg,rgba(225,6,42,0.12),rgba(255,255,255,0.03))] p-6 sm:p-8">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-[#ff6b86]">Billing / Plan</p>
      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div><h1 className="text-3xl font-black sm:text-4xl">{getLocationName(location, "Your location")}</h1><p className="mt-2 max-w-2xl text-sm font-bold leading-6 text-white/55">Manage this location’s Partner Pro subscription, billing cycle, payment method, and downgrade directly from the location workspace.</p></div>
        <span className={`rounded-full px-4 py-2 text-sm font-black ${isPro ? "bg-emerald-400/15 text-emerald-100" : "bg-white/10 text-white/60"}`}>{getBillingPlanLabel(location.subscription_plan)} · {getBillingStatusLabel(status)}</span>
      </div>
    </section>

    {message ? <div className="rounded-3xl border border-amber-300/25 bg-amber-500/10 p-4 text-sm font-bold text-amber-100">{message}</div> : null}

    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Tile label="Plan" value={getBillingPlanLabel(location.subscription_plan)} />
      <Tile label="Billing cycle" value={location.stripe_subscription_id ? (currentInterval === "annual" ? "Annual" : "Monthly") : "Not started"} />
      <Tile label="Next billing" value={formatDate(location.next_billing_date || location.current_period_end)} />
      <Tile label="Status" value={getBillingStatusLabel(status)} />
    </section>

    <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
      <h2 className="text-xl font-black">Subscription controls</h2>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {!location.stripe_subscription_id ? <>
          <form action="/api/business/billing/checkout" method="POST"><input type="hidden" name="location_id" value={location.id}/><input type="hidden" name="interval" value="monthly"/><button className="w-full rounded-2xl bg-[#f5b700] px-5 py-4 text-sm font-black text-black">Start monthly · $99/mo</button></form>
          <form action="/api/business/billing/checkout" method="POST"><input type="hidden" name="location_id" value={location.id}/><input type="hidden" name="interval" value="annual"/><button className="w-full rounded-2xl bg-white px-5 py-4 text-sm font-black text-black">Start annual · $999/yr</button></form>
        </> : <>
          <form action="/api/business/billing/change-plan" method="POST"><input type="hidden" name="location_id" value={location.id}/><input type="hidden" name="action" value="change_interval"/><input type="hidden" name="interval" value={currentInterval === "annual" ? "monthly" : "annual"}/><button className="w-full rounded-2xl bg-white px-5 py-4 text-sm font-black text-black">Switch to {currentInterval === "annual" ? "$99 monthly" : "$999 annual"}</button></form>
          {location.stripe_customer_id ? <form action="/api/business/billing/portal" method="POST"><input type="hidden" name="location_id" value={location.id}/><button className="w-full rounded-2xl border border-white/10 px-5 py-4 text-sm font-black hover:bg-white/10">Update payment method</button></form> : null}
          {location.cancel_at_period_end ? <form action="/api/business/billing/change-plan" method="POST"><input type="hidden" name="location_id" value={location.id}/><input type="hidden" name="action" value="reactivate"/><button className="w-full rounded-2xl border border-emerald-400/30 px-5 py-4 text-sm font-black text-emerald-100 hover:bg-emerald-500/10">Keep Partner Pro</button></form> : <Link href="/locations/dashboard/billing/cancel" className="flex items-center justify-center rounded-2xl border border-rose-400/30 px-5 py-4 text-center text-sm font-black text-rose-100 hover:bg-rose-500/10">Review downgrade to Essentials</Link>}
        </>}
      </div>
      {location.cancel_at_period_end ? <p className="mt-5 rounded-2xl border border-amber-300/25 bg-amber-500/10 p-4 text-sm font-bold text-amber-100">Partner Pro remains active until {formatDate(location.current_period_end)}. After that, this location continues on Essentials — Free. You can reverse the downgrade above before then.</p> : null}
    </section>
  </div>;
}

function Tile({ label, value }: { label: string; value: string }) {
  return <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-white/40">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></div>;
}
