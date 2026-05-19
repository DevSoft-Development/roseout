"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AnalyticsKpiCard from "@/components/analytics/AnalyticsKpiCard";
import BusinessTrafficChart from "@/components/analytics/BusinessTrafficChart";
import ReservationChart from "@/components/analytics/ReservationChart";
import BusiestHoursHeatmap from "@/components/analytics/BusiestHoursHeatmap";
import CustomerInsightsPanel from "@/components/analytics/CustomerInsightsPanel";

type LocationOption = { id: string; display_name: string; city?: string | null; state?: string | null; is_pro?: boolean };
type LockedFeature = { key: string; name: string; locked: boolean; cta: string };
type Trigger = { trigger_type: string; priority: string; reason: string; suggested_cta: string; created_at?: string };

type AnalyticsResponse = {
  success?: boolean;
  summary?: Record<string, number>;
  daily?: any[];
  hourly?: any[];
  heatmap?: any[];
  customer_insights?: any;
  visibility_score?: number;
  visibility_breakdown?: Array<{ label: string; score: number; max: number }>;
  visibility_checklist?: Array<{ label: string; done: boolean; cta: string }>;
  locked_features?: LockedFeature[];
  plan?: "pro" | "free";
  growth_recommendations?: Array<{ title: string; detail: string; cta: string }>;
  reservation_intelligence?: Record<string, number>;
  upgrade_triggers?: Trigger[];
  benchmarking?: Record<string, number>;
  predictive_insights?: Array<{ title: string; detail: string }>;
  promotion_opportunities?: Array<{ title: string; detail: string; cta: string }>;
  error?: string;
};

const proPrice = "$99/month";
const LOCKED_NAMES = ["Top Search Terms", "Customer Intent Insights", "Advanced Reservation Analytics", "Competitor Visibility", "Conversion Funnels", "AI Growth Recommendations", "Benchmarking", "Predictive Revenue Insights", "Promotion Analytics"];
const fNum = (v?: number) => Number(v || 0).toLocaleString();
const fPct = (v?: number) => `${Math.round(Number(v || 0) * 100)}%`;

export default function BusinessAnalyticsDashboard({ locations, admin = false }: { locations: LocationOption[]; admin?: boolean }) {
  const [selectedLocationId, setSelectedLocationId] = useState(locations[0]?.id || "");
  const [range, setRange] = useState("30d");
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const selectedLocation = useMemo(() => locations.find((location) => location.id === selectedLocationId) || locations[0], [locations, selectedLocationId]);
  const locked = !admin && selectedLocation?.is_pro === false;

  useEffect(() => {
    if (!selectedLocationId) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/business/analytics?location_id=${encodeURIComponent(selectedLocationId)}&range=${range}`)
      .then((response) => response.json())
      .then((json) => !cancelled && setData(json))
      .catch((error) => !cancelled && setData({ success: false, error: error.message }))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [selectedLocationId, range]);

  const summary = data?.summary || {};
  const daily = locked ? sampleDaily() : data?.daily || [];
  const hourly = locked ? sampleHourly() : data?.hourly || [];
  const insights = locked ? sampleInsights() : data?.customer_insights || {};
  const visibilityChecklist = data?.visibility_checklist || [];
  const lockedFeatures = data?.locked_features || LOCKED_NAMES.map((name, i) => ({ key: `${i}`, name, locked, cta: "Unlock Pro Insights" }));

  return <main className="min-h-screen bg-[#090706] text-white"><section className="relative overflow-hidden border-b border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(190,24,93,0.22),_transparent_35%),linear-gradient(135deg,#130b0a,#090706_58%,#000)] px-5 py-10 sm:px-8"><div className="mx-auto max-w-7xl"><p className="text-xs font-black uppercase tracking-[0.28em] text-[#f5b700]">Business growth</p><h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">Business Analytics</h1><div className="mt-5 flex flex-wrap gap-3"><select value={selectedLocationId} onChange={(e)=>setSelectedLocationId(e.target.value)} className="rounded-full border border-white/10 bg-black px-4 py-3 text-sm font-black text-white">{locations.map((l)=><option key={l.id} value={l.id}>{l.display_name}</option>)}</select><select value={range} onChange={(e)=>setRange(e.target.value)} className="rounded-full border border-white/10 bg-black px-4 py-3 text-sm font-black text-white"><option value="7d">7 days</option><option value="30d">30 days</option><option value="90d">90 days</option><option value="12m">12 months</option></select><Link href="/business/dashboard/billing" className="rounded-full bg-[#f5b700] px-5 py-3 text-sm font-black text-black">Upgrade to Pro — {proPrice}</Link></div></div></section>
  <section className="mx-auto max-w-7xl space-y-6 px-5 py-8 sm:px-8">{locked && <LockBanner />}<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><AnalyticsKpiCard label="Profile Views" value={fNum(summary.profile_views)} /><AnalyticsKpiCard label="Reservation Clicks" value={fNum(summary.reservation_starts)} /><AnalyticsKpiCard label="Reservations" value={fNum(summary.reservation_completions)} /><AnalyticsKpiCard label="Conversion Rate" value={fPct(summary.reservation_conversion_rate)} /></div>
  <div className="grid gap-6 xl:grid-cols-3"><Card title="Visibility Score"><p className="text-4xl font-black text-[#f5b700]">{Math.round(data?.visibility_score || 0)}/100</p><div className="mt-4 space-y-2">{(data?.visibility_breakdown||[]).map((b)=><p key={b.label} className="text-sm text-white/70">{b.label}: {b.score}/{b.max}</p>)}</div><div className="mt-4 space-y-2">{visibilityChecklist.slice(0,5).map((i)=><p key={i.label} className="text-xs font-bold text-white/60">{i.done?"✅":"•"} {i.label}</p>)}</div></Card>
  <Card title="Upgrade Triggers">{(data?.upgrade_triggers||[]).slice(0,4).map((t)=><div key={`${t.trigger_type}-${t.created_at}`} className="mb-2 rounded-xl bg-white/5 p-2 text-xs"><p className="font-black">{t.trigger_type} · {t.priority}</p><p className="text-white/60">{t.reason}</p><p className="text-[#f5b700]">{t.suggested_cta}</p></div>)}</Card>
  <Card title="Growth Recommendations">{(data?.growth_recommendations||[]).map((g)=><p key={g.title} className="mb-2 text-sm text-white/70">• {g.title}</p>)}<Link href="/business/dashboard/billing" className="mt-2 inline-flex rounded-full border border-white/20 px-3 py-2 text-xs font-black">Unlock Pro Insights</Link></Card></div>
  <div className="grid gap-6 xl:grid-cols-2"><BusinessTrafficChart daily={daily} /><ReservationChart daily={daily} /></div><div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]"><BusiestHoursHeatmap hourly={hourly} /><CustomerInsightsPanel insights={insights} /></div>
  <Card title="Pro Analytics Locks"><div className="grid gap-3 md:grid-cols-3">{lockedFeatures.map((f)=><div key={f.key} className="rounded-2xl border border-white/10 bg-black/30 p-4"><p className="text-sm font-black">🔒 {f.name}</p><p className="mt-2 text-xs text-white/50">Unlock with Pro</p><Link href="/business/dashboard/billing" className="mt-3 inline-flex rounded-full bg-[#f5b700] px-3 py-2 text-xs font-black text-black">Upgrade to Pro</Link></div>)}</div></Card>
  <div className="grid gap-6 xl:grid-cols-2"><TeaserCard title="Benchmarking" locked={locked}><p className="text-sm text-white/70">Views percentile: {Math.round(Number(data?.benchmarking?.views_percentile || 0))}%</p><p className="text-sm text-white/70">Clicks percentile: {Math.round(Number(data?.benchmarking?.clicks_percentile || 0))}%</p></TeaserCard><TeaserCard title="Predictive Revenue Insights" locked={locked}>{(data?.predictive_insights||[]).map((p)=><p key={p.title} className="text-sm text-white/70">• {p.detail}</p>)}</TeaserCard></div>
  </section></main>;
}

function Card({ title, children }: any) { return <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"><p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">{title}</p><div className="mt-3">{children}</div></div>; }
function TeaserCard({ title, children, locked }: any){return <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5"><p className="text-xs font-black uppercase tracking-[0.2em] text-white/35">{title}</p><div className={locked?"mt-3 blur-[2px] opacity-60":"mt-3"}>{children}</div>{locked&&<Link href="/business/dashboard/billing" className="mt-3 inline-flex rounded-full bg-[#f5b700] px-3 py-2 text-xs font-black text-black">Unlock with Pro</Link>}</div>}
function LockBanner(){return <div className="rounded-[2rem] border border-[#f5b700]/30 bg-[#f5b700]/10 p-6"><h2 className="text-2xl font-black">Unlock premium business growth tools</h2><p className="mt-2 text-sm text-white/70">Upgrade to Pro to access AI recommendations, reservation intelligence, benchmarking, and promotion analytics.</p><Link href="/business/dashboard/billing" className="mt-4 inline-flex rounded-full bg-[#f5b700] px-5 py-3 text-sm font-black text-black">Upgrade to Pro — $99/month</Link></div>}
function sampleDaily(){return Array.from({length:14},(_,i)=>({analytics_date:new Date(Date.now()-(13-i)*86400000).toISOString().slice(0,10),profile_views:40+i*6,search_appearances:240+i*18,search_clicks:22+i*3,reservation_completions:8+(i%5),reservation_cancellations:i%4===0?1:0}));}
function sampleHourly(){return Array.from({length:7*24},(_,i)=>({day_of_week:Math.floor(i/24),hour_of_day:i%24,profile_views:i%24>=17&&i%24<=22?14:2,search_clicks:i%24>=18&&i%24<=21?6:1,reservations:i%24>=18&&i%24<=20?3:0,intensity:i%24>=17&&i%24<=22?32:4}));}
function sampleInsights(){return { repeat_visitor_rate: 0.31, average_party_size: 3.4, top_outing_types:[{label:"date night",count:84}], popular_times:[{day_of_week:5,hour_of_day:20}]};}
