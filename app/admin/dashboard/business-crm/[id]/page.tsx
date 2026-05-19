import { notFound } from "next/navigation";
import { requireAdminRole } from "@/lib/admin-auth";
import { getBusinessCRM, getUpgradeFlags } from "@/lib/admin-crm";

export default async function BusinessCRMDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminRole(["superuser", "admin", "editor", "viewer"]);
  const { id } = await params;
  const business = await getBusinessCRM(id);

  if (!business) notFound();

  const flags = getUpgradeFlags(business);

  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1300px] space-y-6">
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-white/55">Business CRM</p>
          <h1 className="mt-2 text-3xl font-black">{business.name}</h1>
          <p className="mt-2 text-sm text-white/65">Status: {business.crm_status}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {flags.map((flag) => (
              <span key={flag} className="rounded-full border border-rose-200/30 bg-rose-500/10 px-3 py-1 text-xs text-rose-100">{flag}</span>
            ))}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Opportunity Score", business.opportunity_score],
            ["Upgrade Probability", `${business.upgrade_probability}%`],
            ["Churn Risk Score", business.churn_risk_score],
            ["Trending Score", business.trending_score],
          ].map(([label, value]) => (
            <article key={String(label)} className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-white/55">{label}</p>
              <p className="mt-2 text-3xl font-black">{value}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-lg font-black">Analytics (Last 30 Days)</h2>
            <ul className="mt-3 space-y-2 text-sm text-white/80">
              <li>Profile Views: {business.profile_views_30d}</li>
              <li>Search Appearances: {business.search_appearances_30d}</li>
              <li>Saves / Favorites: {business.saves_30d}</li>
              <li>Reservation Clicks &amp; Bookings: {business.reservation_completions_30d}</li>
              <li>Conversion Rate: {(business.conversion_rate_30d * 100).toFixed(1)}%</li>
            </ul>
          </article>
          <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-lg font-black">Recommendations</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-white/80">
              <li>Recommend Pro Upgrade · confidence {Math.min(98, Math.round(business.opportunity_score))}%</li>
              <li>Recommend Promoted Listing · confidence {Math.round((business.traffic_score + business.search_appearances_30d / 10) / 2)}%</li>
              <li>Retention Recommendation: Prioritize follow up if churn risk exceeds 65.</li>
            </ul>
          </article>
        </section>
      </div>
    </main>
  );
}
