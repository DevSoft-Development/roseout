import Link from "next/link";
import { redirect } from "next/navigation";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import { findCreatorForUser } from "@/lib/creator-partners/program";
import { getSiteUrl } from "@/lib/stripe/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function CreatorDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/creator/dashboard")}`);

  const creator = await findCreatorForUser(user.id, user.email);
  if (!creator) redirect("/creators/apply");
  if (creator.application_status !== "approved") {
    return <main className="min-h-screen bg-[#050505] text-white"><TheOutHavenHeader /><section className="mx-auto max-w-2xl px-5 pb-20 pt-32"><p className="text-xs font-black uppercase tracking-[0.22em] text-[#ff526b]">Creator Partners</p><h1 className="mt-4 text-4xl font-black">Your application is being reviewed.</h1><p className="mt-4 text-base font-semibold leading-7 text-white/55">We’ll email you when your Creator Partner account is approved. There’s nothing else you need to do right now.</p></section></main>;
  }

  const [{ data: referrals }, { data: commissions }] = await Promise.all([
    supabaseAdmin.from("gtm_referrals").select("id,status,referred_location_id,created_at,expires_at,locations:referred_location_id(name,restaurant_name,activity_name)").eq("creator_source_id", creator.id).order("created_at", { ascending: false }).limit(50),
    supabaseAdmin.from("creator_partner_commissions").select("id,status,amount_cents,validation_ends_at,paid_at,location_id,locations:location_id(name,restaurant_name,activity_name)").eq("creator_source_id", creator.id).order("created_at", { ascending: false }).limit(50),
  ]);

  const commissionRows = commissions || [];
  const paid = commissionRows.filter((row: any) => row.status === "paid").reduce((sum: number, row: any) => sum + Number(row.amount_cents || 0), 0);
  const pending = commissionRows.filter((row: any) => ["validating", "approved", "payable"].includes(row.status)).reduce((sum: number, row: any) => sum + Number(row.amount_cents || 0), 0);
  const conversions = commissionRows.filter((row: any) => row.status !== "reversed").length;
  const referralUrl = `${getSiteUrl()}/r/${encodeURIComponent(creator.slug || creator.creator_key)}`;
  const payoutReady = creator.stripe_connect_onboarding_status === "ready" && creator.stripe_connect_payouts_enabled;

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <TheOutHavenHeader />
      <section className="mx-auto max-w-6xl px-5 pb-20 pt-32 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div><p className="text-xs font-black uppercase tracking-[0.22em] text-[#ff526b]">Creator Partner</p><h1 className="mt-3 text-4xl font-black tracking-tight">Welcome, {creator.display_name}</h1><p className="mt-2 text-sm font-semibold text-white/50">Share your link. We track the business from introduction through Essentials+ automatically.</p></div>
          {!payoutReady ? <Link href="/api/creators/stripe-connect/onboard" className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-black">Set up payouts</Link> : <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-xs font-black text-emerald-200">Payouts ready</span>}
        </div>

        <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Businesses referred" value={String((referrals || []).length)} />
          <Stat label="Essentials+ customers" value={String(conversions)} />
          <Stat label="Waiting to clear" value={money(pending)} />
          <Stat label="Paid to you" value={money(paid)} />
        </div>

        <section className="mt-8 rounded-[2rem] border border-white/10 bg-white/[0.035] p-6">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-white/40">Your referral link</p>
          <p className="mt-3 break-all text-lg font-black">{referralUrl}</p>
          <p className="mt-2 text-sm font-semibold text-white/45">Businesses that start from this link stay connected to you for 90 days. You earn $75 when an eligible new referral becomes an Essentials+ customer and clears the 14-day validation period.</p>
        </section>

        <section className="mt-8 overflow-hidden rounded-[2rem] border border-white/10 bg-black">
          <div className="border-b border-white/10 p-6"><h2 className="text-2xl font-black">Your referrals</h2><p className="mt-1 text-sm font-semibold text-white/45">Simple status updates—no sales-system terminology.</p></div>
          <div className="divide-y divide-white/10">
            {(referrals || []).length ? (referrals || []).map((row: any) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-5"><div><p className="font-black">{locationName(row.locations)}</p><p className="mt-1 text-xs font-semibold text-white/40">Referred {new Date(row.created_at).toLocaleDateString("en-US")}</p></div><span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-black">{friendlyReferralStatus(row.status)}</span></div>) : <p className="px-6 py-10 text-sm font-semibold text-white/40">No referrals yet. Share your link with a business you think fits TheOutHaven.</p>}
          </div>
        </section>

        <section className="mt-8 overflow-hidden rounded-[2rem] border border-white/10 bg-black">
          <div className="border-b border-white/10 p-6"><h2 className="text-2xl font-black">Earnings</h2><p className="mt-1 text-sm font-semibold text-white/45">Commissions move automatically from validation to payout.</p></div>
          <div className="divide-y divide-white/10">
            {commissionRows.length ? commissionRows.map((row: any) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-5"><div><p className="font-black">{locationName(row.locations)}</p><p className="mt-1 text-xs font-semibold text-white/40">{friendlyCommissionStatus(row.status, row.validation_ends_at)}</p></div><p className="text-lg font-black">{money(Number(row.amount_cents || 0))}</p></div>) : <p className="px-6 py-10 text-sm font-semibold text-white/40">Your first $75 commission will appear here when a referred business joins Essentials+.</p>}
          </div>
        </section>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) { return <article className="rounded-3xl border border-white/10 bg-white/[0.035] p-5"><p className="text-xs font-black uppercase tracking-[0.15em] text-white/40">{label}</p><p className="mt-3 text-3xl font-black">{value}</p></article>; }
function money(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100); }
function locationName(value: any) { const row = Array.isArray(value) ? value[0] : value; return row?.name || row?.restaurant_name || row?.activity_name || "Referred business"; }
function friendlyReferralStatus(status: string) { return ({ referred: "Introduced", engaged: "Talking with TheOutHaven", claimed: "Business claimed", paid: "Joined Essentials+", expired: "Referral expired", invalid: "Not eligible" } as Record<string, string>)[status] || "In progress"; }
function friendlyCommissionStatus(status: string, validationEndsAt?: string | null) { if (status === "validating") return `Waiting to clear${validationEndsAt ? ` · ${new Date(validationEndsAt).toLocaleDateString("en-US")}` : ""}`; return ({ approved: "Approved — finish payout setup if needed", payable: "Ready for payout", paid: "Paid", reversed: "No longer eligible", needs_review: "Being reviewed" } as Record<string, string>)[status] || "In progress"; }
