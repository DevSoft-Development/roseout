import Link from "next/link";
import { Activity, ArrowUpRight, MousePointerClick, UsersRound } from "lucide-react";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import {
  AdminActionButton,
  AdminEmptyState,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

type MetricRow = { social_post_id: string; provider: string; captured_at: string; views: number | null; reach: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null; clicks: number | null };

function metricScore(row: MetricRow) {
  const raw = Number(row.views || 0) * 0.02 + Number(row.reach || 0) * 0.01 + Number(row.likes || 0) * 0.5 + Number(row.comments || 0) * 2 + Number(row.shares || 0) * 5 + Number(row.saves || 0) * 5 + Number(row.clicks || 0) * 8;
  return Math.min(100, Math.round(20 * Math.log10(1 + Math.max(0, raw))));
}

export default async function MarketingAnalyticsPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.marketing);
  const supabaseAdmin = getAdminDatabaseClient();
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
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Marketing · Intelligence"
        title="Marketing Analytics"
        subtitle="Track audience growth, content performance, social-to-site traffic, registrations, completed outings, and the themes worth repeating."
        badge={<AdminStatusBadge tone={signups || completedOutings ? "green" : "muted"}>{completedOutings ? `${completedOutings} completed outings` : "Attribution monitoring active"}</AdminStatusBadge>}
        actions={<AdminActionButton href="/admin/dashboard/marketing"><ArrowUpRight className="h-4 w-4" />Marketing Center</AdminActionButton>}
      />

      <AdminKpiGrid>
        <AdminKpiCard label="Followers" value={followers} helper={`${followers7 >= 0 ? "+" : ""}${followers7} in 7 days`} icon={UsersRound} />
        <AdminKpiCard label="Views" value={totals.views} helper={`${totals.reach.toLocaleString()} reach`} icon={Activity} />
        <AdminKpiCard label="Social → site" value={siteVisits} helper={`${signups} registrations`} icon={MousePointerClick} />
        <AdminKpiCard label="Completed outings" value={completedOutings} helper="Attributed conversions" icon={ArrowUpRight} />
      </AdminKpiGrid>

      <section className="grid gap-5 xl:grid-cols-[1.7fr_.8fr]">
        <AdminSectionCard>
          <div className="flex flex-col gap-2 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Content performance</p>
              <h2 className="mt-1 text-xl font-black text-white">Top content</h2>
              <p className="mt-1 text-sm text-white/50">Ranked by weighted engagement plus attributed signups and completed outings.</p>
            </div>
            <AdminStatusBadge tone="muted">Content Score · 0–100</AdminStatusBadge>
          </div>
          {ranked.length ? (
            <div className="divide-y divide-white/10">
              {ranked.slice(0, 15).map((item) => (
                <Link
                  key={item.post.id}
                  href={item.content?.id ? `/admin/dashboard/marketing/content/${item.content.id}` : "/admin/dashboard/marketing/content"}
                  className="grid gap-3 px-5 py-4 transition hover:bg-white/[0.025] sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate font-black text-white">{item.content?.title || `${item.post.platform} post`}</p>
                    <p className="mt-1 text-xs capitalize text-white/45">
                      {item.post.platform} · {Number(item.metric.views || 0).toLocaleString()} views · {Number(item.metric.shares || 0)} shares · {Number(item.metric.saves || 0)} saves
                    </p>
                  </div>
                  <p className="text-xs font-semibold text-white/45">{item.funnel.signups} signups · {item.funnel.completed} outings</p>
                  <span className="min-w-12 text-right text-2xl font-black text-rose-100">{item.score}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-5"><AdminEmptyState title="No synced post metrics yet" body="Performance data will populate after connected social accounts publish and metric syncs complete." /></div>
          )}
        </AdminSectionCard>

        <AdminSectionCard>
          <div className="border-b border-white/10 px-5 py-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Conversion pulse</p>
            <h2 className="mt-1 text-xl font-black text-white">Marketing funnel</h2>
          </div>
          <dl className="divide-y divide-white/10 px-5">
            {[
              ["Social / campaign visits", siteVisits],
              ["Registrations", signups],
              ["Completed outings", completedOutings],
              ["Shares", totals.shares],
              ["Saves", totals.saves],
              ["Clicks", totals.clicks],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex items-center justify-between gap-4 py-4">
                <dt className="text-sm text-white/45">{label}</dt>
                <dd className="text-xl font-black text-white">{Number(value).toLocaleString()}</dd>
              </div>
            ))}
          </dl>
        </AdminSectionCard>
      </section>

      <AdminSectionCard>
        <div className="border-b border-white/10 px-5 py-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200">Pattern intelligence</p>
          <h2 className="mt-1 text-xl font-black text-white">Best themes, neighborhoods, and formats</h2>
          <p className="mt-1 text-sm text-white/50">Average content score across repeated creative themes.</p>
        </div>
        {themes.length ? (
          <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
            {themes.map((theme) => (
              <article key={theme.name} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <p className="font-black text-white">{theme.name}</p>
                <p className="mt-2 text-2xl font-black text-rose-100">{theme.avg}</p>
                <p className="mt-1 text-xs text-white/45">Average score · {theme.count} posts</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="p-5"><AdminEmptyState title="Not enough published content yet" body="More published and synced marketing content is needed before repeatable patterns can be ranked." /></div>
        )}
      </AdminSectionCard>
    </AdminPageShell>
  );
}
