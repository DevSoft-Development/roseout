import Link from "next/link";
import { getCurrentBusinessLocation } from "@/lib/growth-pro/data";
import { getLocationName } from "@/lib/locationName";
import { getLocationEssentialsRoi } from "@/lib/analytics/location-roi";
import {
  BusinessKpiCard,
  BusinessKpiGrid,
  BusinessPageHeader,
  BusinessPageShell,
  BusinessStatusBadge,
} from "@/components/business/BusinessDesignSystem";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function dollars(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function pct(value: number | null) {
  if (value == null) return "—";
  return `${value > 0 ? "+" : ""}${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}

function channelLabel(value: string) {
  if (value === "organic") return "Organic discovery";
  if (value === "sponsored") return "Sponsored";
  if (value === "owned") return "Owned marketing";
  return "Unclassified";
}

export default async function LocationAnalyticsPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const requestedLocationId = first(params.locationId) || first(params.adminLocationId) || first(params.demoLocationId) || undefined;
  const requestedRange = Number(first(params.range) || 30);
  const range = [7, 30, 90, 365].includes(requestedRange) ? requestedRange : 30;
  const location = await getCurrentBusinessLocation(requestedLocationId);

  if (!location?.id) {
    return (
      <BusinessPageShell>
        <BusinessPageHeader
          eyebrow="Essentials+"
          title="ROI & Attribution"
          subtitle="Connect or claim a location before viewing return on investment."
          badge={<BusinessStatusBadge tone="amber">Location required</BusinessStatusBadge>}
        />
      </BusinessPageShell>
    );
  }

  const locationId = String(location.id);
  const locationName = getLocationName(location, "Your location");
  const report = await getLocationEssentialsRoi(locationId, range);

  return (
    <BusinessPageShell>
      <BusinessPageHeader
        eyebrow="Essentials+"
        title="ROI & Attribution"
        subtitle={<>See how TheOutHaven discovery, sponsored placement, bookings, verified visits, and paid products translate into measurable return for {locationName}.</>}
        badge={<BusinessStatusBadge tone="green">Canonical attribution</BusinessStatusBadge>}
      />

      <div className="flex flex-wrap gap-2">
        {[7, 30, 90, 365].map((days) => (
          <Link
            key={days}
            href={`/locations/dashboard/analytics?locationId=${encodeURIComponent(locationId)}&range=${days}`}
            className={`rounded-full border px-4 py-2 text-xs font-black transition ${range === days ? "border-white bg-white text-black" : "border-[var(--business-border)] bg-[var(--business-panel)] text-[var(--business-muted)] hover:text-[var(--business-text)]"}`}
          >
            {days === 365 ? "1 year" : `${days} days`}
          </Link>
        ))}
      </div>

      <BusinessKpiGrid>
        <BusinessKpiCard label="Confirmed revenue" value={dollars(report.confirmedRevenueCents)} helper="Paid deposits, experiences, and ticket orders with a confirmed payment source" />
        <BusinessKpiCard label="Estimated revenue" value={dollars(report.estimatedRevenueCents)} helper="Attributed value without a confirmed payment source; never mixed into confirmed revenue" />
        <BusinessKpiCard label="Total investment" value={dollars(report.totalInvestmentCents)} helper={`${dollars(report.promotionSpendCents)} promotion spend + ${dollars(report.subscriptionCostCents)} prorated Essentials+ cost`} />
        <BusinessKpiCard label="Confirmed ROI" value={pct(report.confirmedRoiPercent)} helper="Based only on confirmed revenue vs subscription + sponsored spend" />
        <BusinessKpiCard label="Blended ROI" value={pct(report.blendedRoiPercent)} helper="Confirmed revenue plus non-duplicated estimated attribution" />
        <BusinessKpiCard label="Verified visits" value={report.verifiedVisits.toLocaleString()} helper="Canonical verified-visit records in this period" />
        <BusinessKpiCard label="Reservations" value={report.reservations.toLocaleString()} helper="Reserve conversions linked into the attribution spine" />
        <BusinessKpiCard label="Paid bookings" value={report.paidBookings.toLocaleString()} helper="Paid experiences and event ticket orders" />
      </BusinessKpiGrid>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,.8fr)]">
        <div className="rounded-[2rem] border border-[var(--business-border)] bg-[var(--business-panel-strong)] p-5 shadow-xl sm:p-7">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff6b86]">Customer journey</p>
          <h2 className="mt-2 text-2xl font-black text-[var(--business-text)]">Discovery → booking → visit → revenue</h2>
          <p className="mt-2 max-w-3xl text-sm font-semibold text-[var(--business-muted)]">Every stage is sourced from the same canonical attribution spine. Counts are not stitched together from separate dashboard formulas.</p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["1", "Attributed touchpoints", report.funnel.touchpoints, "Search, profile, sponsored, social and owned interactions"],
              ["2", "Bookings", report.funnel.bookings, "Reserve + paid experience/ticket bookings"],
              ["3", "Verified visits", report.funnel.verifiedVisits, "Canonical visit verification"],
              ["4", "Revenue conversions", report.funnel.revenueConversions, "Confirmed or attributed revenue"],
            ].map(([step, label, value, helper]) => (
              <div key={String(step)} className="rounded-2xl border border-[var(--business-border)] bg-[var(--business-panel)] p-4">
                <div className="grid h-8 w-8 place-items-center rounded-full bg-[#e1062a] text-xs font-black text-white">{step}</div>
                <p className="mt-4 text-sm font-black text-[var(--business-text)]">{label}</p>
                <p className="mt-1 text-3xl font-black text-[var(--business-text)]">{Number(value).toLocaleString()}</p>
                <p className="mt-2 text-xs font-semibold leading-5 text-[var(--business-muted)]">{helper}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[2rem] border border-[var(--business-border)] bg-[var(--business-panel-strong)] p-5 shadow-xl sm:p-7">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff6b86]">Investment</p>
          <h2 className="mt-2 text-2xl font-black text-[var(--business-text)]">What you spent</h2>
          <div className="mt-5 space-y-3">
            <MoneyRow label="Sponsored placement spend" value={report.promotionSpendCents} />
            <MoneyRow label="Essentials+ subscription allocation" value={report.subscriptionCostCents} />
            <div className="border-t border-[var(--business-border)] pt-3"><MoneyRow label="Total investment" value={report.totalInvestmentCents} strong /></div>
          </div>
          <p className="mt-5 text-xs font-semibold leading-5 text-[var(--business-muted)]">Subscription cost is prorated to the selected reporting window. Sponsored spend comes from the promotion ledger, not campaign budget.</p>
        </div>
      </section>

      <section className="rounded-[2rem] border border-[var(--business-border)] bg-[var(--business-panel-strong)] p-5 shadow-xl sm:p-7">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff6b86]">Channel attribution</p>
          <h2 className="mt-2 text-2xl font-black text-[var(--business-text)]">Where measurable value came from</h2>
          <p className="mt-2 text-sm font-semibold text-[var(--business-muted)]">Organic, sponsored, and owned activity are separated before revenue is calculated.</p>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--business-muted)]">
              <tr>
                <th className="px-3 py-3">Channel</th>
                <th className="px-3 py-3 text-right">Touchpoints</th>
                <th className="px-3 py-3 text-right">Conversions</th>
                <th className="px-3 py-3 text-right">Confirmed</th>
                <th className="px-3 py-3 text-right">Estimated</th>
              </tr>
            </thead>
            <tbody>
              {(["organic", "sponsored", "owned", "unknown"] as const).map((channel) => {
                const row = report.byChannel[channel];
                return (
                  <tr key={channel} className="border-t border-[var(--business-border)]">
                    <td className="px-3 py-4 font-black text-[var(--business-text)]">{channelLabel(channel)}</td>
                    <td className="px-3 py-4 text-right font-bold text-[var(--business-muted)]">{row.touchpoints.toLocaleString()}</td>
                    <td className="px-3 py-4 text-right font-bold text-[var(--business-muted)]">{row.conversions.toLocaleString()}</td>
                    <td className="px-3 py-4 text-right font-black text-emerald-200">{dollars(row.confirmedRevenueCents)}</td>
                    <td className="px-3 py-4 text-right font-black text-amber-200">{dollars(row.estimatedRevenueCents)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-blue-300/15 bg-blue-500/[0.06] p-4 text-sm font-semibold leading-6 text-blue-100/75">
        <strong className="text-blue-100">Revenue confidence:</strong> confirmed revenue only includes payment-backed amounts available to TheOutHaven, such as Reserve deposits, paid experiences and ticket orders. Estimated attribution is displayed separately and is excluded whenever the same conversion already has confirmed revenue.
      </section>
    </BusinessPageShell>
  );
}

function MoneyRow({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={strong ? "font-black text-[var(--business-text)]" : "font-semibold text-[var(--business-muted)]"}>{label}</span>
      <span className={strong ? "text-xl font-black text-[var(--business-text)]" : "font-black text-[var(--business-text)]"}>{dollars(value)}</span>
    </div>
  );
}
