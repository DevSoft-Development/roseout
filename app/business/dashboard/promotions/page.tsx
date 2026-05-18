import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationName } from "@/lib/locationName";

export const dynamic = "force-dynamic";

function formatCurrency(value: unknown) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value || 0));
}

export default async function BusinessPromotionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: locations } = await supabaseAdmin
    .from("locations")
    .select("id, name, restaurant_name, activity_name, city, state, is_promoted, promotion_tier, promotion_starts_at, promotion_ends_at, promotion_budget, subscription_plan, owner_user_id, owner_email, claimed_by_email")
    .or(`owner_user_id.eq.${user.id},owner_email.eq.${user.email || ""},claimed_by_email.eq.${user.email || ""}`)
    .order("created_at", { ascending: false });

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(225,6,42,0.2),transparent_32%),#080808] px-5 py-12 sm:px-8">
        <div className="mx-auto max-w-6xl">
          <Link href="/business/dashboard/billing" className="text-sm font-black text-white/55 hover:text-white">← Billing</Link>
          <p className="mt-6 text-xs font-black uppercase tracking-[0.28em] text-rose-300">Promoted listings</p>
          <h1 className="mt-2 text-4xl font-black tracking-[-0.05em] sm:text-6xl">Boost visibility without hurting relevance</h1>
          <p className="mt-3 max-w-2xl text-sm font-bold leading-6 text-white/55">Choose a tier and duration for qualified boosts in search, concierge, SEO collections, and marketplace placements.</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        <div className="grid gap-4 md:grid-cols-3">
          <Tier title="Starter" price="$49" duration="7 days" features={["Local search boost", "Basic impression tracking", "Discovery placements"]} />
          <Tier title="Growth" price="$149" duration="30 days" featured features={["Higher visibility boost", "Search + concierge placements", "Click and spend reporting"]} />
          <Tier title="Launch" price="$299" duration="30 days" features={["Top qualified boost", "SEO collection priority", "Marketplace-ready attribution"]} />
        </div>

        <div className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 sm:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-white/35">Your locations</p>
              <h2 className="mt-2 text-2xl font-black">Promotion controls</h2>
            </div>
            <Link href="/business/dashboard/billing" className="rounded-full bg-[#f5b700] px-5 py-3 text-sm font-black text-black">Manage billing</Link>
          </div>

          <div className="mt-6 grid gap-4">
            {(locations || []).map((location: any) => (
              <div key={location.id} className="rounded-3xl border border-white/10 bg-black/30 p-5">
                <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div>
                    <h3 className="text-xl font-black">{getLocationName(location, "Untitled location")}</h3>
                    <p className="mt-1 text-sm font-bold text-white/45">{[location.city, location.state].filter(Boolean).join(", ") || "Business location"}</p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-5">
                      <Metric label="Status" value={location.is_promoted ? "Enabled" : "Off"} />
                      <Metric label="Tier" value={location.promotion_tier || "None"} />
                      <Metric label="Budget" value={formatCurrency(location.promotion_budget)} />
                      <Metric label="Impressions" value={location.is_promoted ? "Tracked in analytics" : "—"} />
                      <Metric label="Clicks / Spend" value={location.is_promoted ? "In analytics" : "—"} />
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3 lg:w-[420px]">
                    {['starter', 'growth', 'launch'].map((tier) => (
                      <Link key={tier} href={`/checkout?plan=promotion&tier=${tier}&location=${location.id}`} className="rounded-full border border-white/10 px-4 py-3 text-center text-xs font-black capitalize text-white hover:bg-white/10">{tier}</Link>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            {(locations || []).length === 0 ? <p className="text-sm font-bold text-white/45">Claim a location to enable promotions.</p> : null}
          </div>
        </div>
      </section>
    </main>
  );
}

function Tier({ title, price, duration, features, featured = false }: { title: string; price: string; duration: string; features: string[]; featured?: boolean }) {
  return (
    <div className={`rounded-[2rem] border p-6 ${featured ? "border-rose-400/40 bg-rose-500/10" : "border-white/10 bg-white/[0.04]"}`}>
      <p className="text-xs font-black uppercase tracking-[0.22em] text-white/40">{duration}</p>
      <h2 className="mt-2 text-2xl font-black">{title}</h2>
      <p className="mt-2 text-4xl font-black">{price}</p>
      <div className="mt-5 space-y-2">
        {features.map((feature) => <p key={feature} className="rounded-2xl bg-white/[0.05] px-4 py-3 text-sm font-bold text-white/60">{feature}</p>)}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.04] p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">{label}</p>
      <p className="mt-1 text-sm font-black text-white/80">{value}</p>
    </div>
  );
}
