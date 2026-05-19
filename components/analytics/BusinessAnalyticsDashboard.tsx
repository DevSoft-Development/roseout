"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AnalyticsKpiCard from "@/components/analytics/AnalyticsKpiCard";

type LocationOption = { id: string; display_name: string; city?: string | null; state?: string | null; is_pro?: boolean };
type AnalyticsResponse = { success?: boolean; summary?: Record<string, any>; daily?: any[]; customer_insights?: any; visibility?: any; engagement?: any; reservations?: any; recommendations?: string[]; error?: string };

const percent = (v?: number) => `${Math.round(Number(v || 0) * 100)}%`;
const num = (v?: number) => Number(v || 0).toLocaleString();

export default function BusinessAnalyticsDashboard({ locations, admin = false }: { locations: LocationOption[]; admin?: boolean }) {
  const [selectedLocationId, setSelectedLocationId] = useState(locations[0]?.id || "");
  const [range, setRange] = useState("30d");
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const selectedLocation = useMemo(() => locations.find((l) => l.id === selectedLocationId) || locations[0], [locations, selectedLocationId]);
  const locked = !admin && selectedLocation?.is_pro === false;

  useEffect(() => {
    if (!selectedLocationId) return;
    setLoading(true);
    fetch(`/api/business/analytics?location_id=${encodeURIComponent(selectedLocationId)}&range=${range}`).then((r) => r.json()).then((json) => setData(json)).catch((e) => setData({ success: false, error: e.message })).finally(() => setLoading(false));
  }, [selectedLocationId, range]);

  const s = data?.summary || {};
  const overview = [
    ["Profile Views", num(s.profile_views), `${Math.round(Number(s?.deltas?.profile_views_pct || 0))}% vs previous`],
    ["Search Appearances", num(s.search_appearances), null],
    ["Reservation Clicks", num(s.reservation_starts), null],
    ["Reservations Completed", num(s.reservation_completions), `${Math.round(Number(s?.deltas?.reservations_pct || 0))}% vs previous`],
    ["Saves / Favorites", num(s.saves), null],
    ["Plan This Outing", num(s.plan_outing_clicks), null],
    ["Conversion Rate", percent(s.reservation_conversion_rate), null],
    ["Trending Score", num(s.trending_score), null],
    ["Opportunity Score", num(s.opportunity_score), null],
  ];

  return <main className="min-h-screen bg-[#090706] text-white"><section className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
    <div className="mb-6 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-black">Business Analytics</h1>
      <select value={selectedLocationId} onChange={(e) => setSelectedLocationId(e.target.value)} className="rounded-full border border-white/10 bg-black px-4 py-2 text-sm">{locations.map((l) => <option key={l.id} value={l.id}>{l.display_name}</option>)}</select>
      <select value={range} onChange={(e) => setRange(e.target.value)} className="rounded-full border border-white/10 bg-black px-4 py-2 text-sm"><option value="7d">Weekly</option><option value="30d">Monthly</option><option value="90d">Quarterly</option><option value="12m">Yearly</option></select></div>

    {data?.error ? <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-4">{data.error}</div> : null}
    {loading ? <div className="rounded-2xl border border-white/10 bg-white/5 p-4">Loading analytics...</div> : null}

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{overview.map(([label, value, detail]) => <AnalyticsKpiCard key={label} label={String(label)} value={String(value)} detail={detail ? String(detail) : undefined} locked={locked} />)}</div>

    <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-xl font-black">Visibility</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 text-sm">
      <p>Homepage appearances: {num(data?.visibility?.homepage_appearances)}</p><p>Featured outing appearances: {num(data?.visibility?.featured_outing_appearances)}</p><p>/go appearances: {num(data?.visibility?.go_appearances)}</p><p>Promoted impressions: {num(data?.visibility?.promoted_impressions)}</p></div>
      <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="text-white/60"><th>Date</th><th>Views</th><th>Search</th></tr></thead><tbody>{(data?.daily || []).slice(-10).map((d) => <tr key={d.analytics_date} className="border-t border-white/10"><td>{d.analytics_date}</td><td>{num(d.profile_views)}</td><td>{num(d.search_appearances)}</td></tr>)}</tbody></table></div></section>

    <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-xl font-black">Engagement</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 text-sm">
      <p>Website clicks: {num(s.website_clicks)}</p><p>Reservation link clicks: {num(data?.engagement?.reservation_link_clicks)}</p><p>Phone clicks: {num(s.phone_clicks)}</p><p>Directions clicks: {num(s.directions_clicks)}</p><p>Saves/favorites: {num(s.saves)}</p><p>Social shares: {num(data?.engagement?.social_share_clicks)}</p><p>Engagement rate: {percent(data?.engagement?.engagement_rate)}</p><p>CTR: {percent(s.click_through_rate)}</p></div></section>

    <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-xl font-black">Reservations</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3 text-sm">
      <p>Reservations started: {num(s.reservation_starts)}</p><p>Reservations completed: {num(s.reservation_completions)}</p><p>Cancellation rate: {percent(s.cancellation_rate)}</p><p>Average party size: {Number(data?.reservations?.average_party_size || 0).toFixed(1)}</p><p>Busiest times: {(data?.reservations?.busiest_times || []).slice(0, 2).map((t: any) => `D${t.day_of_week} ${t.hour_of_day}:00`).join(", ") || "No data yet"}</p></div></section>

    <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-xl font-black">Customer Insights</h2><div className="mt-4 grid gap-3 text-sm"><p>Popular occasions: {(data?.customer_insights?.top_outing_types || []).map((t: any) => `${t.label} (${t.count})`).join(", ") || "No insights yet"}</p><p>Top search terms: {(data?.customer_insights?.top_search_terms || []).join(", ") || "Available on Pro"}</p></div></section>

    <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-xl font-black">Growth</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 text-sm"><p>Growth score: {num(s.growth_score)}</p><p>Trending status: {Number(s.trending_score || 0) > 60 ? "Trending up" : "Stable"}</p><p>Profile completeness: {num(s.profile_completeness)}%</p><p>Visibility score: {num(s.visibility_score)}</p></div><ul className="mt-4 list-disc pl-5 text-sm text-white/80">{(data?.recommendations || []).map((r) => <li key={r}>{r}</li>)}</ul></section>

    {locked ? <section className="mt-6 rounded-3xl border border-[#f5b700]/30 bg-[#f5b700]/10 p-5"><h2 className="text-xl font-black">Pro features</h2><p className="mt-2 text-sm">Unlock Top Search Terms, Customer Intent Insights, Conversion Funnels, and AI Growth Recommendations.</p><Link href="/checkout?plan=pro&billing=monthly" className="mt-4 inline-flex rounded-full bg-[#f5b700] px-4 py-2 font-bold text-black">Upgrade to Pro</Link></section> : null}

    <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-xl font-black">Actions</h2><div className="mt-4 flex flex-wrap gap-2 text-sm">{[["Edit Profile","/location/apply/claim"],["Add Reservation Link","/business/dashboard/promotions"],["Manage Layout","/business/dashboard/promotions"],["Upgrade to Pro","/pricing"],["Promote Listing","/business/dashboard/promotions"],["Request Featured Outing","/contact"],["View Public Page","/go"]].map(([l,href]) => <Link key={l} href={href} className="rounded-full border border-white/15 px-4 py-2">{l}</Link>)}</div></section>
  </section></main>;
}
