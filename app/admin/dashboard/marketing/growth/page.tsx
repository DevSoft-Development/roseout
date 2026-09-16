import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function GrowthPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.marketing);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [{ data: rows }, { data: opportunities }, { data: metrics }] = await Promise.all([
    supabaseAdmin.from("social_growth_daily_snapshots").select("*").gte("snapshot_date", since).order("snapshot_date"),
    supabaseAdmin.from("social_growth_opportunities").select("id,provider,title,summary,area,timing,opportunity_strength,score,status,suggested_reply,source_url").eq("status", "new").order("score", { ascending: false }).limit(50),
    supabaseAdmin.from("social_post_metric_snapshots").select("social_post_id,provider,captured_at,views,reach,likes,comments,shares,saves,clicks").gte("captured_at", new Date(Date.now()-30*24*60*60*1000).toISOString()).order("captured_at", { ascending: false }).limit(5000),
  ]);
  const sum = (key: string) => (rows || []).reduce((total: number, row: any) => total + Number(row[key] || 0), 0);
  const follows = sum("followers_gained");
  const reach = sum("reach");
  const profileVisits = sum("profile_visits");
  const followPer1k = reach ? (follows / reach) * 1000 : 0;
  const profileFollow = profileVisits ? (follows / profileVisits) * 100 : 0;
  const themeCounts = new Map<string, number>(); const areaCounts = new Map<string, number>();
  for (const row of rows || []) { if ((row as any).top_theme) themeCounts.set((row as any).top_theme, (themeCounts.get((row as any).top_theme)||0)+1); if ((row as any).top_area) areaCounts.set((row as any).top_area, (areaCounts.get((row as any).top_area)||0)+1); }
  const best = (map: Map<string,number>) => [...map.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0] || "Not enough data yet";
  const recentMetrics = new Map<string, any>(); for (const row of metrics || []) if (!recentMetrics.has((row as any).social_post_id)) recentMetrics.set((row as any).social_post_id,row);
  const winners = [...recentMetrics.values()].sort((a,b)=>Number(b.shares||0)+Number(b.saves||0)+Number(b.clicks||0)-Number(a.shares||0)-Number(a.saves||0)-Number(a.clicks||0)).slice(0,5);
  const cards = [["Followers gained",follows.toLocaleString()],["People reached",reach.toLocaleString()],["Follows per 1,000 views",followPer1k.toFixed(1)],["Profile visit → follow",`${profileFollow.toFixed(1)}%`],["Website visits",sum("website_visits").toLocaleString()],["Outing searches",sum("outing_searches").toLocaleString()],["Business leads",sum("business_leads").toLocaleString()],["Paid customers",sum("paid_customers").toLocaleString()]];
  return <main className="min-h-screen bg-[#090706] px-4 py-6 text-white sm:px-6 lg:px-8"><div className="mx-auto max-w-[1500px] space-y-6"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-rose-300">Social Manager</p><h1 className="mt-2 text-4xl font-semibold">Growth</h1><p className="mt-2 text-white/55">See what is growing followers, visits, searches, leads, and customers.</p></div><Link href="/admin/dashboard/marketing/social-manager" className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold">Back to Social Manager</Link></div>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label,value])=><div key={String(label)} className="rounded-2xl border border-white/10 bg-white/[0.06] p-5"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/40">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></div>)}</section>
    <section className="grid gap-4 lg:grid-cols-3"><div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><p className="text-xs uppercase tracking-[0.16em] text-white/40">Best theme</p><p className="mt-2 text-2xl font-semibold">{best(themeCounts)}</p></div><div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><p className="text-xs uppercase tracking-[0.16em] text-white/40">Best area</p><p className="mt-2 text-2xl font-semibold">{best(areaCounts)}</p></div><div className="rounded-2xl border border-white/10 bg-white/[0.05] p-5"><p className="text-xs uppercase tracking-[0.16em] text-white/40">New monthly revenue</p><p className="mt-2 text-2xl font-semibold">${sum("new_mrr").toLocaleString()}</p></div></section>
    <section className="grid gap-5 xl:grid-cols-2"><div className="rounded-2xl border border-white/10 bg-white/[0.05]"><div className="border-b border-white/10 p-5"><h2 className="font-semibold">Growth opportunities</h2><p className="mt-1 text-sm text-white/45">People and topics worth acting on now.</p></div><div className="divide-y divide-white/10">{(opportunities||[]).slice(0,10).map((row:any)=><div key={row.id} className="p-5"><div className="flex justify-between gap-3"><div><p className="font-medium">{row.title}</p><p className="mt-1 text-sm text-white/45">{row.area||row.summary||row.provider}{row.timing?` · ${row.timing}`:""}</p>{row.suggested_reply?<p className="mt-3 rounded-xl bg-black/20 p-3 text-sm text-white/65">Suggested reply: {row.suggested_reply}</p>:null}</div><span className="h-fit rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200">{row.opportunity_strength === "very_strong" ? "Very strong" : row.opportunity_strength === "good" ? "Good" : "Low"}</span></div></div>)}{!opportunities?.length?<div className="p-8 text-center text-sm text-white/45">No new growth opportunities yet.</div>:null}</div></div>
      <div className="rounded-2xl border border-white/10 bg-white/[0.05]"><div className="border-b border-white/10 p-5"><h2 className="font-semibold">Posts worth repeating</h2><p className="mt-1 text-sm text-white/45">Strong saves, shares, and clicks from recent posts.</p></div><div className="divide-y divide-white/10">{winners.map((row:any)=><div key={row.social_post_id} className="p-5"><p className="font-medium capitalize">{row.provider} post</p><div className="mt-2 grid grid-cols-4 gap-2 text-sm text-white/55"><span>{Number(row.views||0).toLocaleString()} views</span><span>{Number(row.saves||0).toLocaleString()} saves</span><span>{Number(row.shares||0).toLocaleString()} shares</span><span>{Number(row.clicks||0).toLocaleString()} clicks</span></div></div>)}{!winners.length?<div className="p-8 text-center text-sm text-white/45">Post results will appear here as they are collected.</div>:null}</div></div></section>
  </div></main>;
}
