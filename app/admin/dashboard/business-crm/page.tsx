import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { getUpgradeFlags, listBusinessCRM } from "@/lib/admin-crm";

function fmt(n: number) {
  return Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(n || 0);
}

export default async function BusinessCRMPage() {
  await requireAdminRole(["superuser", "admin", "editor", "viewer"]);
  const businesses = await listBusinessCRM();

  const summary = {
    total: businesses.length,
    upgradeCandidates: businesses.filter((b) => b.opportunity_score >= 70).length,
    atRisk: businesses.filter((b) => b.churn_risk_score >= 65 || b.crm_status === "At Risk").length,
    unclaimed: businesses.filter((b) => !b.is_claimed).length,
  };

  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-200">Businesses · CRM Pipeline</p>
          <h1 className="mt-3 text-3xl font-black">Opportunity-focused business CRM</h1>
          <p className="mt-2 max-w-3xl text-sm text-white/65">
            Lightweight operational pipeline for outreach, upgrade opportunities, and churn prevention.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["In CRM", summary.total],
              ["Upgrade Opportunities", summary.upgradeCandidates],
              ["Unclaimed", summary.unclaimed],
              ["At Risk", summary.atRisk],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-white/55">{label}</p>
                <p className="mt-2 text-3xl font-black">{fmt(Number(value))}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.2em] text-white/55">
                <tr>
                  <th className="px-3 py-3">Business</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Opportunity</th>
                  <th className="px-3 py-3">Upgrade %</th>
                  <th className="px-3 py-3">Churn Risk</th>
                  <th className="px-3 py-3">Analytics (30d)</th>
                  <th className="px-3 py-3">Flags</th>
                </tr>
              </thead>
              <tbody>
                {businesses.map((business) => {
                  const flags = getUpgradeFlags(business);
                  return (
                    <tr key={business.id} className="border-t border-white/10 align-top">
                      <td className="px-3 py-4">
                        <Link href={`/admin/dashboard/businesses/${business.id}`} className="font-bold text-rose-200 hover:text-rose-100">
                          {business.name}
                        </Link>
                        <p className="mt-1 text-xs text-white/55">{[business.city, business.state].filter(Boolean).join(", ")}</p>
                      </td>
                      <td className="px-3 py-4">{business.crm_status}</td>
                      <td className="px-3 py-4 font-bold">{fmt(business.opportunity_score)}</td>
                      <td className="px-3 py-4">{fmt(business.upgrade_probability)}%</td>
                      <td className="px-3 py-4">{fmt(business.churn_risk_score)}</td>
                      <td className="px-3 py-4 text-xs text-white/70">
                        <div>Views: {fmt(business.profile_views_30d)}</div>
                        <div>Search: {fmt(business.search_appearances_30d)}</div>
                        <div>Bookings: {fmt(business.reservation_completions_30d)}</div>
                        <div>Conversion: {fmt(business.conversion_rate_30d * 100)}%</div>
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex flex-wrap gap-1">
                          {flags.slice(0, 3).map((flag) => (
                            <span key={flag} className="rounded-full border border-rose-200/30 bg-rose-500/10 px-2 py-1 text-[11px] font-semibold text-rose-100">
                              {flag}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
