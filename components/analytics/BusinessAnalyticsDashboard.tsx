"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AnalyticsKpiCard from "@/components/analytics/AnalyticsKpiCard";
import BusinessTrafficChart from "@/components/analytics/BusinessTrafficChart";
import ReservationChart from "@/components/analytics/ReservationChart";
import BusiestHoursHeatmap from "@/components/analytics/BusiestHoursHeatmap";
import CustomerInsightsPanel from "@/components/analytics/CustomerInsightsPanel";

type LocationOption = {
  id: string;
  display_name: string;
  city?: string | null;
  state?: string | null;
  is_pro?: boolean;
};

type AnalyticsResponse = {
  success?: boolean;
  summary?: Record<string, number>;
  daily?: any[];
  hourly?: any[];
  heatmap?: any[];
  customer_insights?: any;
  error?: string;
};

function formatNumber(value?: number) {
  return Number(value || 0).toLocaleString();
}

function formatCurrency(value?: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatPercent(value?: number) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

export default function BusinessAnalyticsDashboard({
  locations,
  admin = false,
}: {
  locations: LocationOption[];
  admin?: boolean;
}) {
  const [selectedLocationId, setSelectedLocationId] = useState(locations[0]?.id || "");
  const [range, setRange] = useState("30d");
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const selectedLocation = useMemo(
    () => locations.find((location) => location.id === selectedLocationId) || locations[0],
    [locations, selectedLocationId],
  );
  const locked = !admin && selectedLocation?.is_pro === false;

  useEffect(() => {
    if (!selectedLocationId) return;

    let cancelled = false;
    setLoading(true);

    fetch(`/api/business/analytics?location_id=${encodeURIComponent(selectedLocationId)}&range=${range}`)
      .then((response) => response.json())
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((error) => {
        if (!cancelled) setData({ success: false, error: error.message });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedLocationId, range]);

  const summary = data?.summary || {};
  const daily = locked ? sampleDaily() : data?.daily || [];
  const hourly = locked ? sampleHourly() : data?.hourly || [];
  const insights = locked ? sampleInsights() : data?.customer_insights || {};
  const heatmap = locked ? sampleHourly() : data?.heatmap || hourly;

  return (
    <main className="min-h-screen bg-[#090706] text-white">
      <section className="relative overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(190,24,93,0.22),_transparent_35%),linear-gradient(135deg,#130b0a,#090706_58%,#000)] px-5 py-10 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-5 flex flex-wrap gap-3">
            <Link href={admin ? "/admin/dashboard" : "/locations/dashboard"} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-black text-white/75 hover:bg-white/10">
              ← Back to {admin ? "Admin" : "Dashboard"}
            </Link>
          </div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-[#f5b700]">Pro analytics</p>
          <div className="mt-3 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <h1 className="text-4xl font-black tracking-tight sm:text-6xl">Business Analytics</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-white/60">Profile views, discovery, conversion, reservations, revenue, customer insights, and busiest-time heatmaps.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <select value={selectedLocationId} onChange={(event) => setSelectedLocationId(event.target.value)} className="rounded-full border border-white/10 bg-black px-4 py-3 text-sm font-black text-white">
                {locations.map((location) => <option key={location.id} value={location.id}>{location.display_name}</option>)}
              </select>
              <select value={range} onChange={(event) => setRange(event.target.value)} className="rounded-full border border-white/10 bg-black px-4 py-3 text-sm font-black text-white">
                <option value="7d">7 days</option>
                <option value="30d">30 days</option>
                <option value="90d">90 days</option>
                <option value="12m">12 months</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl space-y-6 px-5 py-8 sm:px-8">
        {locations.length === 0 ? (
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.05] p-8 text-center">
            <h2 className="text-2xl font-black">No locations available</h2>
            <p className="mt-2 text-sm font-bold text-white/50">Claim or select a location to view analytics.</p>
          </div>
        ) : null}

        {data?.error ? <div className="rounded-3xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm font-bold text-rose-100">{data.error}</div> : null}
        {loading ? <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-sm font-bold text-white/45">Loading analytics...</div> : null}

        {locked ? (
          <div className="rounded-[2rem] border border-[#f5b700]/30 bg-[#f5b700]/10 p-6">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#f5b700]">Locked preview</p>
            <h2 className="mt-2 text-3xl font-black">Upgrade to Pro to unlock analytics</h2>
            <p className="mt-2 max-w-2xl text-sm font-bold leading-6 text-white/60">Free locations can preview the analytics suite. Pro unlocks real KPIs, customer insights, revenue reporting, and heatmaps.</p>
            <Link href="/checkout?plan=pro&billing=monthly" className="mt-5 inline-flex rounded-full bg-[#f5b700] px-6 py-3 text-sm font-black text-black hover:bg-amber-300">Upgrade to Pro to unlock analytics</Link>
          </div>
        ) : null}

        <div className={locked ? "relative overflow-hidden rounded-[2rem]" : ""}>
          <div className={locked ? "pointer-events-none select-none opacity-60" : ""}>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <AnalyticsKpiCard label="Profile Views" value={formatNumber(locked ? 1280 : summary.profile_views)} locked={locked} />
              <AnalyticsKpiCard label="Search Appearances" value={formatNumber(locked ? 8100 : summary.search_appearances)} locked={locked} />
              <AnalyticsKpiCard label="Click-Through Rate" value={formatPercent(locked ? 0.18 : summary.click_through_rate)} locked={locked} />
              <AnalyticsKpiCard label="Reservations" value={formatNumber(locked ? 312 : summary.reservation_completions)} locked={locked} />
              <AnalyticsKpiCard label="Conversion Rate" value={formatPercent(locked ? 0.42 : summary.reservation_conversion_rate)} locked={locked} />
              <AnalyticsKpiCard label="Cancellation Rate" value={formatPercent(locked ? 0.08 : summary.cancellation_rate)} locked={locked} />
              <AnalyticsKpiCard label="Total Revenue" value={formatCurrency(locked ? 24600 : summary.total_revenue)} locked={locked} />
              <AnalyticsKpiCard label="Avg Booking Value" value={formatCurrency(locked ? 79 : summary.average_booking_value)} locked={locked} />
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-2">
              <BusinessTrafficChart daily={daily} />
              <ReservationChart daily={daily} />
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <BusiestHoursHeatmap hourly={hourly} />
              <CustomerInsightsPanel insights={insights} />
            </div>

            <div className="mt-6">
              <BusiestHoursHeatmap hourly={heatmap} title="Customer activity heatmap" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function sampleDaily() {
  return Array.from({ length: 14 }, (_, index) => ({
    analytics_date: new Date(Date.now() - (13 - index) * 86400000).toISOString().slice(0, 10),
    profile_views: 40 + index * 6,
    search_appearances: 240 + index * 18,
    search_clicks: 22 + index * 3,
    reservation_completions: 8 + (index % 5),
    reservation_cancellations: index % 4 === 0 ? 1 : 0,
  }));
}

function sampleHourly() {
  return Array.from({ length: 7 * 24 }, (_, index) => ({
    day_of_week: Math.floor(index / 24),
    hour_of_day: index % 24,
    profile_views: index % 24 >= 17 && index % 24 <= 22 ? 14 : 2,
    search_clicks: index % 24 >= 18 && index % 24 <= 21 ? 6 : 1,
    reservations: index % 24 >= 18 && index % 24 <= 20 ? 3 : 0,
    intensity: index % 24 >= 17 && index % 24 <= 22 ? 32 : 4,
  }));
}

function sampleInsights() {
  return {
    repeat_visitor_rate: 0.31,
    average_party_size: 3.4,
    top_outing_types: [
      { label: "date night", count: 84 },
      { label: "birthday", count: 41 },
      { label: "group outing", count: 35 },
    ],
    popular_times: [
      { day_of_week: 5, hour_of_day: 20 },
      { day_of_week: 6, hour_of_day: 19 },
      { day_of_week: 4, hour_of_day: 18 },
    ],
  };
}
