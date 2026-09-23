import Link from "next/link";
import { getCurrentBusinessLocation } from "@/lib/growth-pro/data";
import { getLocationName } from "@/lib/locationName";
import { getLocationGrowthIntelligence } from "@/lib/analytics/growth-intelligence";
import {
  BusinessActionButton,
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
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
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
function signalClass(tone: "positive" | "attention" | "neutral") {
  if (tone === "positive") return "border-emerald-300/15 bg-emerald-500/[0.06]";
  if (tone === "attention") return "border-amber-300/15 bg-amber-500/[0.06]";
  return "border-blue-300/15 bg-blue-500/[0.06]";
}

export default async function LocationAnalyticsPage({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const params = searchParams ? await searchParams : {};
  const requestedLocationId = first(params.locationId) || first(params.adminLocationId) || first(params.demoLocationId) || undefined;
  const requestedRange = Number(first(params.range) || 30);
  const range = [7, 30, 90, 365].includes(requestedRange) ? requestedRange : 30;
  const location = await getCurrentBusinessLocation(requestedLocationId);

  if (!location?.id) {
    return (
      <BusinessPageShell>
        <BusinessPageHeader eyebrow="Essentials+" title="Growth Intelligence" subtitle="Connect or claim a location before viewing growth intelligence." badge={<BusinessStatusBadge tone="amber">Location required</BusinessStatusBadge>} />
      </BusinessPageShell>
    );
  }

  const locationId = String(location.id);
  const locationName = getLocationName(location, "Your location");
  const report = await getLocationGrowthIntelligence({ ...location, id: locationId }, range);
  const roi = report.roi;
  const demand = report.demand;

  return (
    <BusinessPageShell>
      <BusinessPageHeader
        eyebrow="Essentials+"
        title="Growth Intelligence"
        subtitle={<>Understand demand, discovery, conversion, revenue, and ROI for {locationName} from one canonical growth workspace.</>}
        badge={<BusinessStatusBadge tone="green">Live intelligence</BusinessStatusBadge>}
        actions={<><BusinessActionButton href={`/locations/dashboard/marketing-studio?locationId=${encodeURIComponent(locationId)}`} variant="primary">Marketing Studio</BusinessActionButton><BusinessActionButton href={`/locations/dashboard/visibility-health?locationId=${encodeURIComponent(locationId)}`}>Visibility Health</BusinessActionButton></>}
      />

      <div className="flex flex-wrap gap-2">
        {[7, 30, 90, 365].map((days) => (
          <Link key={days} href={`/locations/dashboard/analytics?locationId=${encodeURIComponent(locationId)}&range=${days}`} className={`rounded-full border px-4 py-2 text-xs font-black transition ${range === days ? "border-white bg-white text-black" : "border-[var(--business-border)] bg-[var(--business-panel)] text-[var(--business-muted)] hover:text-[var(--business-text)]"}`}>
            {days === 365 ? "1 year" : `${days} days`}
          </Link>
        ))}
      </div>

      <BusinessKpiGrid>
        <BusinessKpiCard label="Search demand" value={demand.searches30d.toLocaleString()} helper={`${pct(demand.trendPercent)} vs prior 7 days in ${demand.geographyLabel}`} />
        <BusinessKpiCard label="Search appearances" value={report.engagement.searchAppearances.toLocaleString()} helper={`${pct(report.trends.searchAppearancesPercent)} vs prior matching period`} />
        <BusinessKpiCard label="Search CTR" value={pct(report.engagement.searchCtrPercent)} helper={`${report.engagement.searchClicks.toLocaleString()} search clicks in this period`} />
        <BusinessKpiCard label="Booking completion" value={pct(report.engagement.bookingCompletionPercent)} helper={`${report.engagement.reservationCompletions.toLocaleString()} completed from ${report.engagement.reservationStarts.toLocaleString()} starts`} />
        <BusinessKpiCard label="Confirmed revenue" value={dollars(roi.confirmedRevenueCents)} helper="Payment-backed attributable revenue" />
        <BusinessKpiCard label="Confirmed ROI" value={pct(roi.confirmedRoiPercent)} helper="Confirmed revenue vs subscription + sponsored spend" />
        <BusinessKpiCard label="Verified visits" value={roi.verifiedVisits.toLocaleString()} helper="Canonical verified-visit records" />
        <BusinessKpiCard label="Profile views" value={report.engagement.profileViews.toLocaleString()} helper={`${pct(report.trends.profileViewsPercent)} vs prior matching period`} />
      </BusinessKpiGrid>

      <section className="rounded-[2rem] border border-[var(--business-border)] bg-[var(--business-panel-strong)] p-5 shadow-xl sm:p-7">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff6b86]">Executive signals</p>
        <h2 className="mt-2 text-2xl font-black text-[var(--business-text)]">What needs attention now</h2>
        <p className="mt-2 text-sm font-semibold text-[var(--business-muted)]">Signals are generated from observed Search V2 demand, location analytics, and canonical attribution. They do not fabricate demand or revenue.</p>
        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {report.signals.map((signal) => (
            <div key={signal.key} className={`rounded-2xl border p-5 ${signalClass(signal.tone)}`}>
              <h3 className="text-base font-black text-[var(--business-text)]">{signal.title}</h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-[var(--business-muted)]">{signal.detail}</p>
              <Link href={signal.href} className="mt-4 inline-flex text-xs font-black uppercase tracking-[0.14em] text-[#ff6b86]">{signal.actionLabel} →</Link>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,.9fr)]">
        <div className="rounded-[2rem] border border-[var(--business-border)] bg-[var(--business-panel-strong)] p-5 shadow-xl sm:p-7">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff6b86]">Live Search V2 demand</p>
          <h2 className="mt-2 text-2xl font-black text-[var(--business-text)]">What customers nearby are trying to do</h2>
          <p className="mt-2 text-sm font-semibold text-[var(--business-muted)]">{demand.searches30d.toLocaleString()} searches in the last 30 days around {demand.geographyLabel}. Current 7-day demand is {pct(demand.trendPercent)} versus the prior 7 days.</p>
          <div className="mt-5 space-y-3">
            {demand.demandOpportunities.slice(0, 6).map((item) => (
              <div key={item.query} className="rounded-2xl border border-[var(--business-border)] bg-[var(--business-panel)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-black text-[var(--business-text)]">“{item.query}”</p>
                  <span className="text-xs font-black text-[var(--business-muted)]">{item.searches30d} searches · {pct(item.trendPercent)} trend</span>
                </div>
                <p className="mt-2 text-xs font-semibold text-[var(--business-muted)]">{item.pairedIntentShare}% paired outing intent · {item.restaurantIntentShare}% restaurant · {item.activityIntentShare}% activity</p>
              </div>
            ))}
            {!demand.demandOpportunities.length && <p className="text-sm font-semibold text-[var(--business-muted)]">No demand theme has enough volume yet for a reliable opportunity signal.</p>}
          </div>
        </div>

        <div className="rounded-[2rem] border border-[var(--business-border)] bg-[var(--business-panel-strong)] p-5 shadow-xl sm:p-7">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff6b86]">Discovery → action</p>
          <h2 className="mt-2 text-2xl font-black text-[var(--business-text)]">Engagement funnel</h2>
          <div className="mt-5 space-y-3">
            {[
              ["Search appearances", report.engagement.searchAppearances, report.trends.searchAppearancesPercent],
              ["Search clicks", report.engagement.searchClicks, report.trends.searchClicksPercent],
              ["Profile views", report.engagement.profileViews, report.trends.profileViewsPercent],
              ["Reservation starts", report.engagement.reservationStarts, null],
              ["Reservation completions", report.engagement.reservationCompletions, report.trends.reservationCompletionsPercent],
            ].map(([label, value, trend]) => (
              <div key={String(label)} className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--business-border)] bg-[var(--business-panel)] p-4">
                <span className="font-bold text-[var(--business-muted)]">{label}</span>
                <div className="text-right"><div className="font-black text-[var(--business-text)]">{Number(value).toLocaleString()}</div>{trend != null && <div className="text-xs font-bold text-[var(--business-muted)]">{pct(Number(trend))}</div>}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-[var(--business-border)] bg-[var(--business-panel-strong)] p-5 shadow-xl sm:p-7">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff6b86]">ROI & Attribution</p>
        <h2 className="mt-2 text-2xl font-black text-[var(--business-text)]">Measurable return by channel</h2>
        <p className="mt-2 text-sm font-semibold text-[var(--business-muted)]">Confirmed and estimated revenue stay separate. Sponsored spend comes from the promotion ledger and Essentials+ cost is prorated to this reporting window.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Confirmed revenue" value={dollars(roi.confirmedRevenueCents)} />
          <Metric label="Estimated revenue" value={dollars(roi.estimatedRevenueCents)} />
          <Metric label="Total investment" value={dollars(roi.totalInvestmentCents)} />
          <Metric label="Blended ROI" value={pct(roi.blendedRoiPercent)} />
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--business-muted)]"><tr><th className="px-3 py-3">Channel</th><th className="px-3 py-3 text-right">Touchpoints</th><th className="px-3 py-3 text-right">Conversions</th><th className="px-3 py-3 text-right">Confirmed</th><th className="px-3 py-3 text-right">Estimated</th></tr></thead>
            <tbody>
              {(["organic", "sponsored", "owned", "unknown"] as const).map((channel) => {
                const row = roi.byChannel[channel];
                return <tr key={channel} className="border-t border-[var(--business-border)]"><td className="px-3 py-4 font-black text-[var(--business-text)]">{channelLabel(channel)}</td><td className="px-3 py-4 text-right font-bold text-[var(--business-muted)]">{row.touchpoints.toLocaleString()}</td><td className="px-3 py-4 text-right font-bold text-[var(--business-muted)]">{row.conversions.toLocaleString()}</td><td className="px-3 py-4 text-right font-black text-emerald-200">{dollars(row.confirmedRevenueCents)}</td><td className="px-3 py-4 text-right font-black text-amber-200">{dollars(row.estimatedRevenueCents)}</td></tr>;
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-blue-300/15 bg-blue-500/[0.06] p-4 text-sm font-semibold leading-6 text-blue-100/75">
        <strong className="text-blue-100">Revenue confidence:</strong> confirmed revenue only includes payment-backed amounts available to TheOutHaven. Estimated attribution remains separate and is excluded whenever the same conversion already has confirmed revenue.
      </section>
    </BusinessPageShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-[var(--business-border)] bg-[var(--business-panel)] p-4"><p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--business-muted)]">{label}</p><p className="mt-2 text-2xl font-black text-[var(--business-text)]">{value}</p></div>;
}
