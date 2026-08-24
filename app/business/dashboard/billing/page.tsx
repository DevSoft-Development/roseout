import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationName } from "@/lib/locationName";
import { BusinessGrowthProPage } from "@/components/growth-pro/BusinessGrowthProPage";
import { getBillingPlanLabel, getBillingStatusLabel, hasPaidEntitlement, isBusinessProPlan } from "@/lib/billing/plans";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function formatDate(value?: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function planLabel(plan?: string | null) { return getBillingPlanLabel(plan); }

export default async function BusinessBillingPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  if (params.demo === "1" || params.fromDemoCenter === "1" || params.adminLocationMode === "1" || params.adminLocationId) {
    return <BusinessGrowthProPage module="billing" searchParams={params} />;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: locations } = await supabaseAdmin
    .from("locations")
    .select("id, name, restaurant_name, activity_name, city, state, subscription_plan, subscription_status, subscription_interval, stripe_price_id, current_period_start, current_period_end, next_billing_date, trial_ends_at, cancel_at_period_end, past_due_at, billing_grace_ends_at, stripe_customer_id, stripe_subscription_id, stripe_connect_account_id, stripe_connect_onboarding_status, stripe_connect_charges_enabled, stripe_connect_payouts_enabled, deposits_enabled, default_deposit_amount, owner_user_id, owner_email, claimed_by_email")
    .or(`owner_user_id.eq.${user.id},owner_email.eq.${user.email || ""},claimed_by_email.eq.${user.email || ""}`)
    .order("created_at", { ascending: false })
    .limit(50);

  const ownedLocations = locations || [];
  const selected = ownedLocations.find((location: any) => location.id === params.location) || ownedLocations[0];
  const status = selected?.subscription_status || "inactive";
  const preferredInterval = params.interval === "annual" ? "annual" : "monthly";
  const currentInterval = String(selected?.subscription_interval || "").toLowerCase() === "year" ? "annual" : "monthly";
  const isPro = isBusinessProPlan(selected?.subscription_plan) && hasPaidEntitlement({
    plan: selected?.subscription_plan,
    status,
    billingGraceEndsAt: selected?.billing_grace_ends_at,
  });
  const needsPaymentAttention = ["past_due", "grace_period", "unpaid", "incomplete"].includes(String(status).toLowerCase());
  const connectReady = Boolean(selected?.stripe_connect_charges_enabled && selected?.stripe_connect_payouts_enabled);

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(245,183,0,0.18),transparent_32%),#080808] px-5 py-12 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <Link href="/business/dashboard/analytics" className="text-sm font-black text-white/55 hover:text-white">← Business dashboard</Link>
          <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[#f5b700]">Billing</p>
              <h1 className="mt-2 text-4xl font-black tracking-[-0.05em] sm:text-6xl">Business Billing</h1>
              <p className="mt-3 max-w-2xl text-sm font-bold leading-6 text-white/55">Manage Partner Pro monthly or annual billing and your subscription lifecycle from one place.</p>
            </div>
            <Link href="/business/dashboard/promotions" className="rounded-full border border-white/10 px-5 py-3 text-sm font-black text-white hover:bg-white/10">Promotions</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        {ownedLocations.length === 0 ? (
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 text-center">
            <h2 className="text-2xl font-black">No business locations found</h2>
            <p className="mt-2 text-sm font-bold text-white/50">Find or add a location before starting Partner Pro.</p>
            <Link href="/business/claim/no-code" className="mt-5 inline-flex rounded-full bg-[#f5b700] px-6 py-3 text-sm font-black text-black">Find or add a business</Link>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr]">
            <aside className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-4">
              <p className="px-3 text-xs font-black uppercase tracking-[0.22em] text-white/35">Locations</p>
              <div className="mt-3 space-y-2">
                {ownedLocations.map((location: any) => (
                  <Link key={location.id} href={`/business/dashboard/billing?location=${location.id}`} className={`block rounded-2xl px-4 py-3 text-sm font-black ${selected?.id === location.id ? "bg-[#f5b700] text-black" : "bg-white/[0.04] text-white/70 hover:bg-white/10"}`}>
                    {getLocationName(location, "Untitled location")}
                    <span className="mt-1 block text-xs opacity-60">{[location.city, location.state].filter(Boolean).join(", ") || planLabel(location.subscription_plan)}</span>
                  </Link>
                ))}
              </div>
            </aside>

            <div className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] p-6 sm:p-8">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-[#f5b700]">{getLocationName(selected, "Selected location")}</p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <BillingTile label="Current Plan" value={planLabel(selected?.subscription_plan)} />
                <BillingTile label="Billing Status" value={getBillingStatusLabel(status)} />
                <BillingTile label="Billing Cycle" value={selected?.stripe_subscription_id ? (currentInterval === "annual" ? "Annual" : "Monthly") : "Not started"} />
                <BillingTile label="Next Billing Date" value={formatDate(selected?.next_billing_date || selected?.current_period_end)} />
                <BillingTile label="Current Period End" value={formatDate(selected?.current_period_end)} />
                <BillingTile label="Trial Ends" value={formatDate(selected?.trial_ends_at)} />
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {!selected?.stripe_subscription_id ? (
                  <>
                    <form action="/api/business/billing/checkout" method="POST">
                      <input type="hidden" name="location_id" value={selected.id} />
                      <input type="hidden" name="interval" value="monthly" />
                      <button className={`w-full rounded-full px-5 py-4 text-sm font-black text-black ${preferredInterval === "monthly" ? "bg-[#f5b700] hover:bg-amber-300" : "bg-white hover:bg-white/80"}`}>Partner Pro monthly — $99/mo</button>
                    </form>
                    <form action="/api/business/billing/checkout" method="POST">
                      <input type="hidden" name="location_id" value={selected.id} />
                      <input type="hidden" name="interval" value="annual" />
                      <button className={`w-full rounded-full px-5 py-4 text-sm font-black text-black ${preferredInterval === "annual" ? "bg-[#f5b700] hover:bg-amber-300" : "bg-white hover:bg-white/80"}`}>Partner Pro annual — $999/yr</button>
                    </form>
                  </>
                ) : (
                  <>
                    <div className="rounded-full bg-emerald-400/15 px-5 py-4 text-center text-sm font-black text-emerald-200">Partner Pro {isPro ? "active" : getBillingStatusLabel(status).toLowerCase()}</div>
                    <form action="/api/business/billing/change-plan" method="POST">
                      <input type="hidden" name="location_id" value={selected.id} />
                      <input type="hidden" name="action" value="change_interval" />
                      <input type="hidden" name="interval" value={currentInterval === "annual" ? "monthly" : "annual"} />
                      <button className="w-full rounded-full bg-white px-5 py-4 text-sm font-black text-black hover:bg-white/80">
                        Switch to {currentInterval === "annual" ? "$99 monthly" : "$999 annual"}
                      </button>
                    </form>
                  </>
                )}

                {selected?.stripe_customer_id ? (
                  <form action="/api/business/billing/portal" method="POST">
                    <input type="hidden" name="location_id" value={selected.id} />
                    <button className="w-full rounded-full border border-white/10 px-5 py-4 text-sm font-black text-white hover:bg-white/10">Manage payment method</button>
                  </form>
                ) : null}

                {selected?.cancel_at_period_end ? (
                  <form action="/api/business/billing/change-plan" method="POST">
                    <input type="hidden" name="location_id" value={selected.id} />
                    <input type="hidden" name="action" value="reactivate" />
                    <button className="w-full rounded-full border border-emerald-400/30 px-5 py-4 text-sm font-black text-emerald-100 hover:bg-emerald-500/10">Keep Partner Pro</button>
                  </form>
                ) : selected?.stripe_subscription_id ? (
                  <form action="/api/business/billing/change-plan" method="POST">
                    <input type="hidden" name="location_id" value={selected.id} />
                    <input type="hidden" name="action" value="cancel" />
                    <button className="w-full rounded-full border border-rose-400/30 px-5 py-4 text-sm font-black text-rose-100 hover:bg-rose-500/10">Cancel at period end</button>
                  </form>
                ) : null}
              </div>

              {selected?.cancel_at_period_end ? <p className="mt-5 rounded-3xl border border-amber-300/30 bg-amber-500/10 p-4 text-sm font-bold text-amber-100">Your plan is set to cancel at period end: {formatDate(selected.current_period_end)}. You can reactivate it above before that date.</p> : null}
              {needsPaymentAttention ? <p className="mt-5 rounded-3xl border border-rose-300/30 bg-rose-500/10 p-4 text-sm font-bold text-rose-100">Payment needs attention. Update your payment method to avoid losing paid features. Grace period ends {formatDate(selected?.billing_grace_ends_at)}.</p> : null}

              <div className="mt-8 rounded-3xl border border-white/10 bg-black/30 p-5">
                <h2 className="text-xl font-black">Partner Pro unlocks</h2>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {["Native reservations", "Business analytics", "Promoted listing readiness", "Deposit-ready bookings", "Concierge visibility", "Marketplace billing foundation"].map((item) => (
                    <div key={item} className="rounded-2xl bg-white/[0.04] px-4 py-3 text-sm font-bold text-white/65">{item}</div>
                  ))}
                </div>
              </div>

              <div className="mt-6 rounded-3xl border border-white/10 bg-black/30 p-5">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#f5b700]">TheOutHaven Payments</p>
                <h2 className="mt-2 text-xl font-black">Merchant payments & payouts</h2>
                <p className="mt-2 text-sm font-bold leading-6 text-white/55">Connect your business with Stripe to accept card guarantees, large-group deposits, paid events, and paid experiences. Your business is the merchant of record and Stripe settles eligible funds to your Stripe account.</p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {connectReady ? (
                    <>
                      <span className="rounded-full bg-emerald-400/15 px-4 py-2 text-sm font-black text-emerald-200">Stripe payments ready</span>
                      <a href="https://dashboard.stripe.com/" target="_blank" rel="noreferrer" className="rounded-full border border-white/10 px-5 py-3 text-sm font-black text-white hover:bg-white/10">Open Stripe Dashboard</a>
                    </>
                  ) : (
                    <form action="/api/business/stripe-connect/onboard" method="POST">
                      <input type="hidden" name="location_id" value={selected.id} />
                      <button className="rounded-full bg-white px-5 py-3 text-sm font-black text-black">{selected?.stripe_connect_account_id ? "Continue Stripe onboarding" : "Set up TheOutHaven Payments"}</button>
                    </form>
                  )}
                  <span className={`rounded-full px-4 py-2 text-sm font-black ${selected?.deposits_enabled ? "bg-amber-400/15 text-amber-100" : "bg-white/[0.06] text-white/55"}`}>
                    Deposits {selected?.deposits_enabled ? `on · $${Number(selected.default_deposit_amount || 0).toFixed(2)}` : "off"}
                  </span>
                </div>
                {!connectReady && selected?.stripe_connect_account_id ? <p className="mt-3 text-xs font-bold text-white/45">Stripe still needs information or verification before this location can accept payments. Continue onboarding to finish setup.</p> : null}
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function BillingTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">{label}</p>
      <p className="mt-2 text-2xl font-black capitalize">{value}</p>
    </div>
  );
}
