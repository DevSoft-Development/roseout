import Link from "next/link";

import {
  cvr,
  ctr,
  formatDollars,
  phase4Automations,
  phase4Campaigns,
  phase4MarketplaceOffers,
  phase4RevenueSnapshot,
} from "@/lib/phase4-platform";

const sections = [
  "Monetization expansion",
  "Marketplace + network effects",
  "AI automation at scale",
  "Enterprise and business tooling",
  "Mobile app readiness",
  "Trust, safety, and platform defensibility",
  "Performance at scale + financial reporting",
];

export default function AdminPlatformPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 text-zinc-100">
      <header className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">TheOutHaven</p>
        <h1 className="mt-2 text-3xl font-semibold">Production Phase 4 Control Tower</h1>
        <p className="mt-3 text-sm text-zinc-300">
          Scale + monetization + defensibility rollout surface for campaign operations,
          marketplace mechanics, AI copilots, automations, mobile readiness, and revenue observability.
        </p>
      </header>

      <section className="grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 md:grid-cols-2">
        {sections.map((section) => (
          <div key={section} className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm">
            {section}
          </div>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard label="MRR" value={formatDollars(phase4RevenueSnapshot.mrrCents)} />
        <MetricCard label="Ad Revenue" value={formatDollars(phase4RevenueSnapshot.adRevenueCents)} />
        <MetricCard label="Booking Revenue" value={formatDollars(phase4RevenueSnapshot.bookingRevenueCents)} />
        <MetricCard label="Active Businesses" value={String(phase4RevenueSnapshot.activeBusinesses)} />
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="text-xl font-semibold">Ad Campaign Management</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-zinc-400">
              <tr>
                <th className="px-3 py-2">Campaign</th><th className="px-3 py-2">Channel</th><th className="px-3 py-2">Spend</th><th className="px-3 py-2">CTR</th><th className="px-3 py-2">CVR</th>
              </tr>
            </thead>
            <tbody>
              {phase4Campaigns.map((campaign) => (
                <tr key={campaign.id} className="border-t border-zinc-800">
                  <td className="px-3 py-2">{campaign.name}</td>
                  <td className="px-3 py-2">{campaign.channel}</td>
                  <td className="px-3 py-2">{formatDollars(campaign.spendCents)}</td>
                  <td className="px-3 py-2">{(ctr(campaign) * 100).toFixed(1)}%</td>
                  <td className="px-3 py-2">{(cvr(campaign) * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-lg font-semibold">Marketplace Offers + Payout Rails</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {phase4MarketplaceOffers.map((offer) => (
              <li key={offer.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <p className="font-medium">{offer.title}</p>
                <p className="text-zinc-400">{offer.category} · {offer.hostType}</p>
                <p className="text-zinc-300">Price {formatDollars(offer.priceCents)} · Service fee {formatDollars(offer.serviceFeeCents)}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-lg font-semibold">Automation + AI Copilot Programs</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {phase4Automations.map((automation) => (
              <li key={automation.id} className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <p className="font-medium">{automation.name}</p>
                <p className="text-zinc-400">{automation.audience} · {automation.channel}</p>
                <p className="text-zinc-300">Trigger: {automation.trigger}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="text-sm text-zinc-400">
        API feed: <Link className="underline" href="/api/phase4/overview">/api/phase4/overview</Link>
      </footer>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs uppercase tracking-[0.15em] text-zinc-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
