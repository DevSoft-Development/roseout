import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function CreatorPartnersAdminPage() {
  const [{ data: creators }, { data: referrals }, { data: commissions }] = await Promise.all([
    supabaseAdmin.from("gtm_creator_sources").select("id,display_name,email,instagram_handle,tiktok_handle,follower_count,primary_market,application_status,program_tier,status,stripe_connect_onboarding_status,created_at").order("created_at", { ascending: false }).limit(200),
    supabaseAdmin.from("gtm_referrals").select("id,creator_source_id,status,attributed_mrr,created_at").not("creator_source_id", "is", null).order("created_at", { ascending: false }).limit(1000),
    supabaseAdmin.from("creator_partner_commissions").select("id,creator_source_id,status,amount_cents,created_at").order("created_at", { ascending: false }).limit(1000),
  ]);

  const creatorRows = creators || [];
  const referralRows = referrals || [];
  const commissionRows = commissions || [];
  const paidConversions = referralRows.filter((row: any) => row.status === "paid").length;
  const pendingCents = commissionRows.filter((row: any) => ["validating", "approved", "payable"].includes(row.status)).reduce((sum: number, row: any) => sum + Number(row.amount_cents || 0), 0);
  const paidCents = commissionRows.filter((row: any) => row.status === "paid").reduce((sum: number, row: any) => sum + Number(row.amount_cents || 0), 0);

  return (
    <main className="space-y-6 text-white">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-black uppercase tracking-[0.22em] text-rose-300">Marketing</p><h1 className="mt-2 text-3xl font-black">Creator Partners</h1><p className="mt-2 max-w-3xl text-sm font-semibold text-white/50">Applications, business referrals, Essentials+ conversions, commissions, and payout readiness in one place.</p></div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Stat label="Applications" value={String(creatorRows.filter((row: any) => row.application_status === "applied").length)} />
        <Stat label="Active creators" value={String(creatorRows.filter((row: any) => row.status === "active").length)} />
        <Stat label="Businesses referred" value={String(referralRows.length)} />
        <Stat label="Essentials+ customers" value={String(paidConversions)} />
        <Stat label="Commissions waiting" value={money(pendingCents)} />
        <Stat label="Paid to creators" value={money(paidCents)} />
      </section>

      <section className="overflow-hidden rounded-3xl border border-white/10 bg-black/25">
        <div className="border-b border-white/10 p-5"><h2 className="text-xl font-black">Creators</h2><p className="mt-1 text-xs font-semibold text-white/40">Approve strong local fits, then the system handles links, attribution, validation, and payouts.</p></div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/[0.04] text-xs font-black uppercase tracking-[0.12em] text-white/40"><tr><th className="px-5 py-4">Creator</th><th className="px-5 py-4">Audience</th><th className="px-5 py-4">Market</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Payouts</th><th className="px-5 py-4">Action</th></tr></thead>
            <tbody className="divide-y divide-white/10">
              {creatorRows.map((creator: any) => <tr key={creator.id}>
                <td className="px-5 py-4"><p className="font-black">{creator.display_name}</p><p className="mt-1 text-xs text-white/40">{creator.instagram_handle ? `@${creator.instagram_handle}` : creator.tiktok_handle ? `@${creator.tiktok_handle}` : creator.email}</p></td>
                <td className="px-5 py-4 font-semibold text-white/60">{creator.follower_count ? Number(creator.follower_count).toLocaleString("en-US") : "Not provided"}</td>
                <td className="px-5 py-4 font-semibold text-white/60">{creator.primary_market || "Not provided"}</td>
                <td className="px-5 py-4"><span className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-black capitalize">{String(creator.application_status || "").replaceAll("_", " ")}</span></td>
                <td className="px-5 py-4 text-xs font-black text-white/60">{creator.stripe_connect_onboarding_status === "ready" ? "Ready" : "Not ready"}</td>
                <td className="px-5 py-4">{creator.application_status === "applied" ? <form action={`/api/admin/marketing/creator-partners/${creator.id}/approve`} method="post" className="flex gap-2"><select name="tier" className="rounded-xl border border-white/10 bg-black px-2 py-2 text-xs font-bold"><option value="creator_partner">Creator Partner</option><option value="featured_creator">Featured Creator</option><option value="founding_creator">Founding Creator</option></select><button className="rounded-xl bg-[#e1062a] px-3 py-2 text-xs font-black">Approve</button></form> : <span className="text-xs font-semibold text-white/35">Automated</span>}</td>
              </tr>)}
              {!creatorRows.length ? <tr><td colSpan={6} className="px-5 py-10 text-center text-sm font-semibold text-white/40">No Creator Partner applications yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) { return <article className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><p className="text-[11px] font-black uppercase tracking-[0.12em] text-white/35">{label}</p><p className="mt-2 text-2xl font-black">{value}</p></article>; }
function money(cents: number) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100); }
