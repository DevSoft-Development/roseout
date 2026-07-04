import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationName } from "@/lib/locationName";
import { BusinessGrowthProPage } from "@/components/growth-pro/BusinessGrowthProPage";
import { getBillingPlanLabel, getBillingStatusLabel, isBusinessProPlan, isPaidBillingStatus } from "@/lib/billing/plans";

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
    .select("id, name, restaurant_name, activity_name, city, state, subscription_plan, subscription_status, current_period_start, current_period_end, next_billing_date, trial_ends_at, cancel_at_period_end, past_due_at, billing_grace_ends_at, stripe_customer_id, stripe_subscription_id, owner_user_id, owner_email, claimed_by_email")
    .or(`owner_user_id.eq.${user.id},owner_email.eq.${user.email || ""},claimed_by_email.eq.${user.email || ""}`)
    .order("created_at", { ascending: false })
    .limit(50);

  const ownedLocations = locations || [];
  const selected = ownedLocations.find((location: any) => location.id === params.location) || ownedLocations[0];
  const status = selected?.subscription_status || "inactive";
  const isPro = isBusinessProPlan(selected?.subscription_plan) && isPaidBillingStatus(status);
  const isPastDue = ["past_due", "unpaid"].includes(String(status).toLowerCase());

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(245,183,0,0.18),transparent_32%),#080808] px-5 py-12 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <Link href="/business/dashboard/analytics" className="text-sm font-black text-white/55 hover:text-white">← Business dashboard</Link>
          <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[#f5b700]">Billing</p>
              <h1 className="mt-2 text-4xl font-black tracking-[-0.05em] sm:text-6xl">Business Billing</h1>
              <p className="mt-3 max-w-2xl text-sm font-bold leading-6 text-white/55">Manage the $99/month Business Pro plan, Stripe billing, and subscription lifecycle from one place.</p>
            </div>
            <Link href="/business/dashboard/promotions" className="rounded-full border border-white/10 px-5 py-3 text-sm font-black text-white hover:bg-white/10">Promotions</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        {ownedLocations.length === 0 ? (
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 text-center">
            <h2 className="text-2xl font-black">No business locations found</h2>
            <p className="mt-2 text-sm font-bold text-white/50">Claim or add a location before starting Business Pro.</p>
            <Link href="/location/apply" className="mt-5 inline-flex rounded-full bg-[#f5b700] px-6 py-3 text-sm font-black text-black">Add a business</Link>
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
                <BillingTile label="Next Billing Date" value={formatDate(selected?.next_billing_date || selected?.current_period_end)} />
                <BillingTile label="Current Period End" value={formatDate(selected?.current_period_end)} />
                <BillingTile label="Trial Ends" value={formatDate(selected?.trial_ends_at)} />
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {!isPro ? (
                  <>
                    <form action="/api/business/billing/checkout" method="POST">
                      <input type="hidden" name="location_id" value={selected.id} />
                      <input type="hidden" name="interval" value="monthly" />
                      <button className="w-full rounded-full bg-[#f5b700] px-5 py-4 text-sm font-black text-black hover:bg-amber-300">Upgrade monthly — $99/mo</button>
                    </form>
                    <form action="/api/business/billing/checkout" method="POST">
                      <input type="hidden" name="location_id" value={selected.id} />
                      <input type="hidden" name="interval" value="annual" />
                      <button className="w-full rounded-full bg-white px-5 py-4 text-sm font-black text-black hover:bg-white/80">Upgrade annual — $999/yr</button>
                    </form>
                  </>
                ) : (
                  <div className="rounded-full bg-emerald-400/15 px-5 py-4 text-center text-sm font-black text-emerald-200">Business Pro active</div>
                )}

                <form action="/api/business/billing/portal" method="POST">
                  <input type="hidden" name="location_id" value={selected.id} />
                  <button className="w-full rounded-full border border-white/10 px-5 py-4 text-sm font-black text-white hover:bg-white/10">Manage Billing</button>
                </form>

                <form action="/api/business/billing/change-plan" method="POST">
                  <input type="hidden" name="location_id" value={selected.id} />
                  <input type="hidden" name="plan" value="free" />
                  <button className="w-full rounded-full border border-rose-400/30 px-5 py-4 text-sm font-black text-rose-100 hover:bg-rose-500/10">Downgrade to Free</button>
                </form>
              </div>

              {selected?.cancel_at_period_end ? <p className="mt-5 rounded-3xl border border-amber-300/30 bg-amber-500/10 p-4 text-sm font-bold text-amber-100">Your plan is set to cancel at period end: {formatDate(selected.current_period_end)}.</p> : null}
              {isPastDue ? <p className="mt-5 rounded-3xl border border-rose-300/30 bg-rose-500/10 p-4 text-sm font-bold text-rose-100">Payment needs attention. Please manage billing to update your payment method. Grace period ends {formatDate(selected?.billing_grace_ends_at)}.</p> : null}

              <div className="mt-8 rounded-3xl border border-white/10 bg-black/30 p-5">
                <h2 className="text-xl font-black">Business Pro ($99/month) unlocks</h2>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {["Native reservations", "Business analytics", "Promoted listing readiness", "Deposit-ready bookings", "Concierge visibility", "Marketplace billing foundation"].map((item) => (
                    <div key={item} className="rounded-2xl bg-white/[0.04] px-4 py-3 text-sm font-bold text-white/65">{item}</div>
                  ))}
                </div>
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
