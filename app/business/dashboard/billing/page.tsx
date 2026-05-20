import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationName } from "@/lib/locationName";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ location?: string }>;

function formatDate(value?: string | null) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function planLabel(plan?: string | null) {
  return String(plan || "free").toLowerCase() === "pro" ? "Business Pro" : "Free";
}

export default async function BusinessBillingPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const params = await searchParams;
  const { data: locations } = await supabaseAdmin
    .from("locations")
    .select("id, name, restaurant_name, activity_name, city, state, subscription_plan, subscription_status, current_period_end, trial_ends_at, stripe_customer_id, stripe_subscription_id, owner_user_id, owner_email, claimed_by_email")
    .or(`owner_user_id.eq.${user.id},owner_email.eq.${user.email || ""},claimed_by_email.eq.${user.email || ""}`)
    .order("created_at", { ascending: false });

  const ownedLocations = locations || [];
  const selected = ownedLocations.find((location: any) => location.id === params.location) || ownedLocations[0];
  const isPro = String(selected?.subscription_plan || "free").toLowerCase() === "pro" || String(selected?.subscription_status || "").toLowerCase() === "active";

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
                <BillingTile label="Billing Status" value={selected?.subscription_status || (isPro ? "active" : "free")} />
                <BillingTile label="Next Billing Date" value={formatDate(selected?.current_period_end)} />
                <BillingTile label="Trial Ends" value={formatDate(selected?.trial_ends_at)} />
              </div>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {!isPro ? (
                  <form action="/api/business/billing/checkout" method="POST">
                    <input type="hidden" name="location_id" value={selected.id} />
                    <button className="w-full rounded-full bg-[#f5b700] px-5 py-4 text-sm font-black text-black hover:bg-amber-300">Upgrade to Pro</button>
                  </form>
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
