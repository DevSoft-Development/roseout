import Link from "next/link";
import { getCurrentBusinessLocation } from "@/lib/growth-pro/data";
import { getLocationName } from "@/lib/locationName";
import { getBillingPlanLabel, getBillingStatusLabel, hasPaidEntitlement, isBusinessProPlan } from "@/lib/billing/plans";
import { createClient } from "@/lib/supabase-server";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function formatDate(value?: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? String(value[0] || "").trim() : String(value || "").trim();
}

export default async function LocationBillingPage({ searchParams }: { searchParams?: SearchParams }) {
  const params = searchParams ? await searchParams : {};
  const requestedLocationId = firstParam(params.adminLocationId) || firstParam(params.locationId);
  let location: Record<string, any> | null = null;

  if (requestedLocationId) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const authorized = await requireOwnerOrAdminAccessToLocation(user.id, requestedLocationId);
      location = authorized?.location || null;
    }
  } else {
    location = await getCurrentBusinessLocation();
  }

  if (!location) {
    return (
      <main className="min-h-screen bg-[#050607] text-white">
        <div className="mx-auto max-w-6xl px-4 pb-10 pt-6 sm:px-6 sm:pt-8 lg:px-8">
          <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#111722] to-[#090c12] p-6 sm:p-8">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#ff6b86]">Billing & Payments</p>
            <h1 className="mt-2 text-2xl font-black sm:text-3xl">No location found</h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-white/45">We could not resolve the selected location for billing. Return to the location overview and reopen Billing & Payments.</p>
          </section>
        </div>
      </main>
    );
  }

  const status = String(location.subscription_status || "inactive");
  const isPro = isBusinessProPlan(location.subscription_plan) && hasPaidEntitlement({ plan: location.subscription_plan, status, billingGraceEndsAt: location.billing_grace_ends_at });
  const currentInterval = String(location.subscription_interval || "").toLowerCase() === "year" ? "annual" : "monthly";
  const connectReady = Boolean(location.stripe_connect_charges_enabled && location.stripe_connect_payouts_enabled);
  const connectStatus = String(location.stripe_connect_onboarding_status || (location.stripe_connect_account_id ? "pending" : "not_connected"));
  const requirementsDue = Number(location.stripe_connect_currently_due_count || 0) + Number(location.stripe_connect_past_due_count || 0);
  const connectMessage = params.connect === "ready"
    ? "Stripe is connected and this location can accept eligible payments and receive payouts."
    : params.connect === "action_required"
      ? "Stripe needs additional information before this location can accept all payments or receive payouts."
      : params.connect === "incomplete"
        ? "Stripe onboarding is not complete yet. Continue setup below."
        : params.connect === "error"
          ? "We could not refresh the Stripe connection. Try continuing onboarding again."
          : null;
  const message = params.retention === "accepted"
    ? "Your loyalty discount is active and your downgrade was stopped."
    : params.retention === "already_used"
      ? "A retention discount has already been used on this subscription."
      : params.cancellation === "scheduled"
        ? `Partner Pro will end on ${formatDate(location.current_period_end)} and this location will move to Essentials — Free.`
        : null;

  return (
    <main className="min-h-screen bg-[#050607] text-white">
      <div className="mx-auto max-w-6xl space-y-5 px-4 pb-10 pt-6 sm:px-6 sm:pt-8 lg:px-8">
        <section className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#111722] to-[#090c12] p-5 shadow-2xl shadow-black/20 sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[#ff6b86]">Billing & Payments</p>
              <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">{getLocationName(location, "Your location")}</h1>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-white/45">Manage your TheOutHaven plan and connect Stripe for reservation guarantees, large-group deposits, paid events, experiences, refunds, and payouts.</p>
            </div>
            <span className={`w-fit rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.1em] ${isPro ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100" : "border-white/10 bg-white/[0.04] text-white/55"}`}>{getBillingPlanLabel(location.subscription_plan)} · {getBillingStatusLabel(status)}</span>
          </div>
        </section>

        {message ? <div className="rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4 text-sm font-bold text-amber-100">{message}</div> : null}
        {connectMessage ? <div className={`rounded-2xl border p-4 text-sm font-bold ${params.connect === "ready" ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-100" : "border-amber-300/20 bg-amber-500/10 text-amber-100"}`}>{connectMessage}</div> : null}

        <section id="payments" className="rounded-3xl border border-[#ff2142]/25 bg-gradient-to-br from-[#171019] via-[#11131a] to-[#090c12] p-5 sm:p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#ff6b86]">Merchant payments</p>
              <h2 className="mt-2 text-2xl font-black">Stripe Connect</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-white/50">Connect this location’s Stripe account so customer funds go to the location while TheOutHaven can support payment-backed reservation policies, deposits, paid events, and experiences.</p>
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-black">
                <span className={`rounded-full border px-3 py-2 ${connectReady ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100" : connectStatus === "restricted" ? "border-amber-300/20 bg-amber-400/10 text-amber-100" : "border-white/10 bg-white/[0.04] text-white/55"}`}>{connectReady ? "Payments ready" : connectStatus === "restricted" ? "Action required" : location.stripe_connect_account_id ? "Setup in progress" : "Not connected"}</span>
                {location.stripe_connect_account_id ? <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-white/45">Account {String(location.stripe_connect_account_id).slice(0, 12)}…</span> : null}
                {requirementsDue > 0 ? <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-amber-100">{requirementsDue} Stripe requirement{requirementsDue === 1 ? "" : "s"} due</span> : null}
              </div>
            </div>
            <div className="flex min-w-[220px] flex-col gap-3 lg:max-w-[280px]">
              {!connectReady ? (
                <form action="/api/business/stripe-connect/onboard" method="POST">
                  <input type="hidden" name="location_id" value={location.id}/>
                  <button className="w-full rounded-2xl bg-[#e1062a] px-5 py-4 text-sm font-black text-white shadow-lg shadow-[#e1062a]/20 transition hover:bg-[#f0183d]">{location.stripe_connect_account_id ? "Continue Stripe setup" : "Connect Stripe"}</button>
                </form>
              ) : (
                <a href={`https://dashboard.stripe.com/${encodeURIComponent(String(location.stripe_connect_account_id))}`} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center rounded-2xl bg-white px-5 py-4 text-sm font-black text-black transition hover:bg-white/85">Open Stripe Dashboard</a>
              )}
              <p className="text-center text-[11px] font-semibold leading-5 text-white/35">Stripe handles merchant verification and payouts. Connecting Stripe does not automatically enable deposits or no-show charges; those remain controlled by this location’s reservation settings.</p>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Tile label="Plan" value={getBillingPlanLabel(location.subscription_plan)} />
          <Tile label="Billing cycle" value={location.stripe_subscription_id ? (currentInterval === "annual" ? "Annual" : "Monthly") : "Not started"} />
          <Tile label="Next billing" value={formatDate(location.next_billing_date || location.current_period_end)} />
          <Tile label="Status" value={getBillingStatusLabel(status)} />
        </section>

        <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#111722] to-[#090c12] p-5 sm:p-6">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#ff6b86]">TheOutHaven plan</p>
          <h2 className="mt-2 text-xl font-black">Subscription controls</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {!location.stripe_subscription_id ? <>
              <form action="/api/business/billing/checkout" method="POST"><input type="hidden" name="location_id" value={location.id}/><input type="hidden" name="interval" value="monthly"/><button className="w-full rounded-2xl bg-[#e1062a] px-5 py-4 text-sm font-black text-white transition hover:bg-[#f0183d]">Start monthly · $99/mo</button></form>
              <form action="/api/business/billing/checkout" method="POST"><input type="hidden" name="location_id" value={location.id}/><input type="hidden" name="interval" value="annual"/><button className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-4 text-sm font-black text-white transition hover:bg-white/10">Start annual · $999/yr</button></form>
            </> : <>
              <form action="/api/business/billing/change-plan" method="POST"><input type="hidden" name="location_id" value={location.id}/><input type="hidden" name="action" value="change_interval"/><input type="hidden" name="interval" value={currentInterval === "annual" ? "monthly" : "annual"}/><button className="w-full rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-4 text-sm font-black text-white transition hover:bg-white/10">Switch to {currentInterval === "annual" ? "$99 monthly" : "$999 annual"}</button></form>
              {location.stripe_customer_id ? <form action="/api/business/billing/portal" method="POST"><input type="hidden" name="location_id" value={location.id}/><button className="w-full rounded-2xl border border-white/10 px-5 py-4 text-sm font-black transition hover:bg-white/[0.06]">Update payment method</button></form> : null}
              {location.cancel_at_period_end ? <form action="/api/business/billing/change-plan" method="POST"><input type="hidden" name="location_id" value={location.id}/><input type="hidden" name="action" value="reactivate"/><button className="w-full rounded-2xl border border-emerald-400/25 px-5 py-4 text-sm font-black text-emerald-100 transition hover:bg-emerald-500/10">Keep Partner Pro</button></form> : <Link href="/locations/dashboard/billing/cancel" className="flex items-center justify-center rounded-2xl border border-[#ff2142]/25 px-5 py-4 text-center text-sm font-black text-[#ff9aaa] transition hover:bg-[#e1062a]/10">Review downgrade to Essentials</Link>}
            </>}
          </div>
          {location.cancel_at_period_end ? <p className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4 text-sm font-bold text-amber-100">Partner Pro remains active until {formatDate(location.current_period_end)}. After that, this location continues on Essentials — Free. You can reverse the downgrade above before then.</p> : null}
        </section>
      </div>
    </main>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs font-black uppercase tracking-[0.12em] text-white/35">{label}</p><p className="mt-2 text-2xl font-black text-white">{value}</p></div>;
}
