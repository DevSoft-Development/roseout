import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type MetricRow = { social_post_id: string; provider: string; captured_at: string; views: number | null; reach: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null; clicks: number | null };

function metricScore(row: MetricRow) {
  const raw = Number(row.views || 0) * 0.02 + Number(row.reach || 0) * 0.01 + Number(row.likes || 0) * 0.5 + Number(row.comments || 0) * 2 + Number(row.shares || 0) * 5 + Number(row.saves || 0) * 5 + Number(row.clicks || 0) * 8;
  return Math.min(100, Math.round(20 * Math.log10(1 + Math.max(0, raw))));
}

export default async function MarketingAnalyticsPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.marketing);
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [accountResult, postMetricResult, socialPostResult, attributionResult, clickResult] = await Promise.all([
    supabaseAdmin.from("social_account_metric_snapshots").select("connection_id,captured_at,followers,following,posts,views,reach").gte("captured_at", since30).order("captured_at", { ascending: false }).limit(5000),
    supabaseAdmin.from("social_post_metric_snapshots").select("social_post_id,provider,captured_at,views,reach,likes,comments,shares,saves,clicks").gte("captured_at", since30).order("captured_at", { ascending: false }).limit(10000),
    supabaseAdmin.from("social_posts").select("id,content_item_id,platform,platform_permalink,posted_at,marketing_content_items(id,title,occasion,neighborhood,market,content_type,source_type)").not("content_item_id", "is", null).order("posted_at", { ascending: false }).limit(1000),
    supabaseAdmin.from("marketing_attribution_events").select("content_item_id,social_post_id,campaign_id,event_type,occurred_at").gte("occurred_at", since30).limit(10000),
    supabaseAdmin.from("marketing_link_clicks").select("campaign_id,created_at").gte("created_at", since30).limit(10000),
  ]);
  const accountRows = accountResult.data || [];
  const postRows = (postMetricResult.data || []) as MetricRow[];
  const socialPosts = socialPostResult.data || [];
  const attribution = attributionResult.data || [];
  const clicks = clickResult.data || [];

  const latestAccount = new Map<string, any>();
  const sevenDayAccount = new Map<string, any>();
  for (const row of accountRows) {
    if (!latestAccount.has(row.connection_id)) latestAccount.set(row.connection_id, row);
    if (row.captured_at <= since7 && !sevenDayAccount.has(row.connection_id)) sevenDayAccount.set(row.connection_id, row);
  }
  const followers = [...latestAccount.values()].reduce((sum, row) => sum + Number(row.followers || 0), 0);
  const followers7 = [...latestAccount.entries()].reduce((sum, [id, row]) => sum + (Number(row.followers || 0) - Number(sevenDayAccount.get(id)?.followers || row.followers || 0)), 0);

  const latestPost = new Map<string, MetricRow>();
  for (const row of postRows) if (!latestPost.has(row.social_post_id)) latestPost.set(row.social_post_id, row);
  const latestMetrics = [...latestPost.values()];
  const totals = latestMetrics.reduce((acc, row) => ({ views: acc.views + Number(row.views || 0), reach: acc.reach + Number(row.reach || 0), shares: acc.shares + Number(row.shares || 0), saves: acc.saves + Number(row.saves || 0), comments: acc.comments + Number(row.comments || 0), clicks: acc.clicks + Number(row.clicks || 0) }), { views: 0, reach: 0, shares: 0, saves: 0, comments: 0, clicks: 0 });

  const metricByPost = new Map(latestMetrics.map((row) => [row.social_post_id, row]));
  const attributionByContent = new Map<string, { visits: number; signups: number; completed: number }>();
  for (const row of attribution) {
    if (!row.content_item_id) continue;
    const current = attributionByContent.get(row.content_item_id) || { visits: 0, signups: 0, completed: 0 };
    if (row.event_type === "site_visit") current.visits += 1;
    if (row.event_type === "signup") current.signups += 1;
    if (row.event_type === "completed_outing") current.completed += 1;
    attributionByContent.set(row.content_item_id, current);
  }

  const ranked = socialPosts.map((post: any) => {
    const metric = metricByPost.get(post.id) || ({ social_post_id: post.id, provider: post.platform, captured_at: post.posted_at || "", views: 0, reach: 0, likes: 0, comments: 0, shares: 0, saves: 0, clicks: 0 } as MetricRow);
    const content = Array.isArray(post.marketing_content_items) ? post.marketing_content_items[0] : post.marketing_content_items;
    const funnel = attributionByContent.get(post.content_item_id) || { visits: 0, signups: 0, completed: 0 };
    const base = metricScore(metric);
    const score = Math.min(100, base + Math.min(20, funnel.signups * 3 + funnel.completed * 7));
    return { post, metric, content, funnel, score };
  }).sort((a, b) => b.score - a.score);

  const categoryTotals = new Map<string, { count: number; score: number }>();
  for (const item of ranked) {
    for (const key of [item.content?.neighborhood, item.content?.occasion, item.content?.content_type].filter(Boolean)) {
      const current = categoryTotals.get(String(key)) || { count: 0, score: 0 };
      current.count += 1; current.score += item.score; categoryTotals.set(String(key), current);
    }
  }
  const themes = [...categoryTotals.entries()].map(([name, value]) => ({ name, ...value, avg: Math.round(value.score / Math.max(1, value.count)) })).sort((a, b) => b.avg - a.avg).slice(0, 8);

  const siteVisits = attribution.filter((row) => row.event_type === "site_visit").length + clicks.length;
  const signups = attribution.filter((row) => row.event_type === "signup").length;
  const completedOutings = attribution.filter((row) => row.event_type === "completed_outing").length;

  return (
    <main className="space-y-6 p-4 sm:p-6">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Marketing</p><h1 className="text-3xl font-semibold">Analytics</h1><p className="mt-1 text-sm text-neutral-600">Follower growth, content performance, social-to-site traffic, registrations, completed outings, and what to repeat.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {[ [followers, "Followers"], [followers7 >= 0 ? `+${followers7}` : followers7, "7d follower growth"], [totals.views, "Views"], [totals.reach, "Reach"], [totals.shares, "Shares"], [totals.saves, "Saves"], [siteVisits, "Social → site"], [signups, "Signups"] ].map(([value, label]) => <div key={String(label)} className="rounded-xl border bg-white p-4"><div className="text-xl font-semibold">{typeof value === "number" ? value.toLocaleString() : value}</div><div className="mt-1 text-xs font-semibold uppercase text-neutral-500">{label}</div></div>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border bg-white p-5 lg:col-span-2"><div className="flex items-center justify-between"><h2 className="font-semibold">Top content</h2><span className="text-xs text-neutral-500">Content Score 0–100</span></div><div className="mt-4 divide-y">{ranked.length ? ranked.slice(0, 15).map((item) => <Link key={item.post.id} href={item.content?.id ? `/admin/dashboard/marketing/content/${item.content.id}` : "/admin/dashboard/marketing/content"} className="grid gap-2 py-3 hover:bg-neutral-50 sm:grid-cols-[1fr_auto_auto]"><div><div className="font-medium">{item.content?.title || `${item.post.platform} post`}</div><div className="text-xs capitalize text-neutral-500">{item.post.platform} · {Number(item.metric.views || 0).toLocaleString()} views · {Number(item.metric.shares || 0)} shares · {Number(item.metric.saves || 0)} saves</div></div><div className="text-xs text-neutral-500">{item.funnel.signups} signups · {item.funnel.completed} outings</div><div className="text-lg font-semibold">{item.score}</div></Link>) : <div className="py-8 text-center text-sm text-neutral-500">Post metrics will populate after connected social accounts publish and sync.</div>}</div></section>
        <section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Conversion pulse</h2><dl className="mt-4 space-y-4"><div><dt className="text-sm text-neutral-500">Social / campaign visits</dt><dd className="text-2xl font-semibold">{siteVisits.toLocaleString()}</dd></div><div><dt className="text-sm text-neutral-500">Registrations</dt><dd className="text-2xl font-semibold">{signups.toLocaleString()}</dd></div><div><dt className="text-sm text-neutral-500">Completed outings</dt><dd className="text-2xl font-semibold">{completedOutings.toLocaleString()}</dd></div></dl></section>
      </div>
      <section className="rounded-2xl border bg-white p-5"><h2 className="font-semibold">Best themes / neighborhoods / formats</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{themes.length ? themes.map((theme) => <div key={theme.name} className="rounded-xl bg-neutral-50 p-4"><div className="font-semibold">{theme.name}</div><div className="mt-1 text-xs text-neutral-500">Avg score {theme.avg} · {theme.count} posts</div></div>) : <div className="text-sm text-neutral-500">More published content is needed before patterns can be ranked.</div>}</div></section>
    </main>
  );
}
