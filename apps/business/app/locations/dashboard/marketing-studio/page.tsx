import LocationSocialComposer from "@/components/marketing/LocationSocialComposer";
import LocationSocialInsightsSync from "@/components/marketing/LocationSocialInsightsSync";
import { getCurrentBusinessLocation } from "@/lib/growth-pro/data";
import { getLocationName } from "@/lib/locationName";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationSearchV2DemandInsights } from "@/lib/marketing/location-demand-insights";
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
type SocialConnectionRow = {
  id: string;
  provider: string;
  display_name: string | null;
  username: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  last_sync_at: string | null;
  last_error: string | null;
  updated_at: string;
};
type SocialPostRow = {
  id: string;
  social_connection_id: string | null;
  platform: string;
  caption: string | null;
  status: string;
  platform_permalink: string | null;
  posted_at: string | null;
  scheduled_at: string | null;
  error_message: string | null;
  last_metrics_sync_at: string | null;
};
type SocialPostMetricRow = {
  social_post_id: string;
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  clicks: number | null;
  captured_at: string;
};
type SocialAccountMetricRow = {
  connection_id: string;
  followers: number | null;
  posts: number | null;
  views: number | null;
  reach: number | null;
  captured_at: string;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function publicMediaUrls(location: Record<string, unknown>) {
  const values: unknown[] = [location.main_image, location.image_url];
  if (Array.isArray(location.images)) values.push(...location.images);
  else if (typeof location.images === "string") values.push(...location.images.split(","));
  return [...new Set(values.map((value) => typeof value === "string" ? value.trim() : "").filter((value) => /^https:\/\//i.test(value)))];
}

function metric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toLocaleString() : "—";
}

export default async function LocationMarketingStudioPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const params = searchParams ? await searchParams : {};
  const requestedLocationId = first(params.locationId) || first(params.adminLocationId) || first(params.demoLocationId) || undefined;
  const location = await getCurrentBusinessLocation(requestedLocationId);

  if (!location?.id) {
    return <BusinessPageShell><BusinessPageHeader eyebrow="Marketing & Growth" title="Marketing Studio" subtitle="Connect or claim a location before publishing social content." badge={<BusinessStatusBadge tone="amber">Location required</BusinessStatusBadge>} /></BusinessPageShell>;
  }

  const locationId = String(location.id);
  const { data: socialConnections } = await supabaseAdmin
    .from("marketing_social_connections")
    .select("id,provider,display_name,username,status,metadata,last_sync_at,last_error,updated_at")
    .eq("scope", "location")
    .eq("location_id", locationId)
    .in("provider", ["instagram", "facebook", "tiktok", "youtube"])
    .neq("status", "disconnected")
    .order("updated_at", { ascending: false });
  const socialByProvider = new Map<string, SocialConnectionRow>();
  for (const row of socialConnections || []) {
    if (!socialByProvider.has(String(row.provider))) socialByProvider.set(String(row.provider), row as SocialConnectionRow);
  }
  const connectedChannelCount = ["instagram", "facebook", "tiktok", "youtube"].filter((provider) => socialByProvider.get(provider)?.status === "connected").length;

  const connectedConnectionIds = [...socialByProvider.values()]
    .filter((row) => row.status === "connected")
    .map((row) => row.id);

  const { data: postsData } = connectedConnectionIds.length
    ? await supabaseAdmin
        .from("social_posts")
        .select("id,social_connection_id,platform,caption,status,platform_permalink,posted_at,scheduled_at,error_message,last_metrics_sync_at")
        .in("social_connection_id", connectedConnectionIds)
        .order("created_at", { ascending: false })
        .limit(24)
    : { data: [] };
  const posts = (postsData || []) as SocialPostRow[];

  const postIds = posts.map((post) => post.id);
  const [{ data: accountMetricRowsData }, { data: postMetricRowsData }] = await Promise.all([
    connectedConnectionIds.length
      ? supabaseAdmin
          .from("social_account_metric_snapshots")
          .select("connection_id,followers,posts,views,reach,captured_at")
          .in("connection_id", connectedConnectionIds)
          .order("captured_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] }),
    postIds.length
      ? supabaseAdmin
          .from("social_post_metric_snapshots")
          .select("social_post_id,views,reach,likes,comments,shares,saves,clicks,captured_at")
          .in("social_post_id", postIds)
          .order("captured_at", { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [] }),
  ]);
  const accountMetricRows = (accountMetricRowsData || []) as SocialAccountMetricRow[];
  const postMetricRows = (postMetricRowsData || []) as SocialPostMetricRow[];

  const latestAccountMetricByConnection = new Map<string, SocialAccountMetricRow>();
  for (const row of accountMetricRows) {
    if (!latestAccountMetricByConnection.has(row.connection_id)) latestAccountMetricByConnection.set(row.connection_id, row);
  }
  const latestMetricByPost = new Map<string, SocialPostMetricRow>();
  for (const row of postMetricRows) {
    if (!latestMetricByPost.has(row.social_post_id)) latestMetricByPost.set(row.social_post_id, row);
  }
  const aggregate = [...latestMetricByPost.values()].reduce((sum, row) => ({
    views: sum.views + Number(row.views || 0),
    likes: sum.likes + Number(row.likes || 0),
    comments: sum.comments + Number(row.comments || 0),
    shares: sum.shares + Number(row.shares || 0),
    clicks: sum.clicks + Number(row.clicks || 0),
  }), { views: 0, likes: 0, comments: 0, shares: 0, clicks: 0 });
  const publishedPostCount = posts.filter((post) => post.status === "posted").length;

  const mediaOptions = publicMediaUrls(location as Record<string, unknown>);
  const locationName = getLocationName(location, "Your location");
  const demand = await getLocationSearchV2DemandInsights({
    id: locationId,
    city: location.city || null,
    state: location.state || null,
    borough: location.borough || null,
    neighborhood: location.neighborhood || null,
    zip_code: location.zip_code || location.postal_code || null,
    postal_code: location.postal_code || location.zip_code || null,
    county: location.county || null,
    market: location.market || null,
  }).catch(() => null);

  return (
    <BusinessPageShell>
      <BusinessPageHeader
        eyebrow="Marketing & Growth"
        title="Marketing Studio"
        subtitle={<>Create once, tailor by channel, publish or schedule, and measure social content for {locationName} from one workspace.</>}
        badge={<BusinessStatusBadge tone={connectedChannelCount ? "green" : "amber"}>{connectedChannelCount ? `${connectedChannelCount} social channel${connectedChannelCount === 1 ? "" : "s"} connected` : "No social channels connected"}</BusinessStatusBadge>}
        actions={<><BusinessActionButton href={`/locations/dashboard/social-accounts?locationId=${encodeURIComponent(locationId)}`} variant="primary">Social Accounts</BusinessActionButton><BusinessActionButton href={`/locations/dashboard/analytics?locationId=${encodeURIComponent(locationId)}`}>Analytics</BusinessActionButton></>}
      />

      <BusinessKpiGrid>
        <BusinessKpiCard label="Connected channels" value={metric(connectedChannelCount)} helper="Instagram · Facebook · TikTok · YouTube" />
        <BusinessKpiCard label="Recent published posts" value={metric(publishedPostCount)} helper="Across connected channels" />
        <BusinessKpiCard label="Recent views" value={metric(aggregate.views)} helper="Known provider metrics" />
        <BusinessKpiCard label="Recent engagement" value={metric(aggregate.likes + aggregate.comments + aggregate.shares)} helper="Likes + comments + shares where available" />
        <BusinessKpiCard label="Search demand" value={metric(demand?.searches30d)} helper={demand ? `Search V2 · ${demand.geographyLabel} · 30d` : "Search V2 unavailable"} />
        <BusinessKpiCard label="Search CTR" value={demand?.locationPerformance ? `${(demand.locationPerformance.ctr30d * 100).toFixed(1)}%` : "—"} helper="Location result clicks / impressions · 30d" />
      </BusinessKpiGrid>

        <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5 shadow-xl sm:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff6b86]">Live Search V2 demand</p>
              <h2 className="mt-2 text-2xl font-black">What people are trying to do nearby</h2>
              <p className="mt-2 max-w-3xl text-sm font-semibold text-white/45">Marketing Studio now uses real TheOutHaven search demand from the last 30 days around {demand?.geographyLabel || "this location"} instead of relying only on static business profile information.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-right">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">7-day demand trend</p>
              <p className={`mt-1 text-xl font-black ${Number(demand?.trendPercent || 0) >= 0 ? "text-emerald-200" : "text-amber-200"}`}>{demand?.trendPercent == null ? "—" : `${demand.trendPercent >= 0 ? "+" : ""}${demand.trendPercent}%`}</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-white/45">Top opportunities</p>
              <div className="mt-3 space-y-2">
                {(demand?.demandOpportunities || []).length ? (demand?.demandOpportunities || []).slice(0, 6).map((item, index) => <div key={item.query} className="flex items-start justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-black text-white/80">{index + 1}. {item.query}</p><p className="mt-1 text-[11px] font-semibold text-white/35">{item.searches7d} searches in 7d · {item.searches30d} in 30d</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${Number(item.trendPercent || 0) >= 0 ? "bg-emerald-500/10 text-emerald-200" : "bg-amber-500/10 text-amber-200"}`}>{item.trendPercent == null ? "new" : `${item.trendPercent >= 0 ? "+" : ""}${item.trendPercent}%`}</span></div>) : <p className="text-sm font-semibold text-white/35">No nearby Search V2 demand has been recorded yet.</p>}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-white/45">Demand gaps</p>
              <p className="mt-1 text-xs font-semibold text-white/35">Queries that generated zero-result searches can become content, offer, profile-data, or inventory opportunities.</p>
              <div className="mt-3 space-y-2">
                {(demand?.demandGaps || []).length ? (demand?.demandGaps || []).map((item) => <div key={item.query} className="flex items-start justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-black text-white/80">{item.query}</p><p className="mt-1 text-[11px] font-semibold text-white/35">{item.searches30d} searches · {item.noResultSearches} with no result</p></div><span className="shrink-0 rounded-full bg-rose-500/10 px-2 py-1 text-[10px] font-black text-rose-200">Gap</span></div>) : <p className="text-sm font-semibold text-white/35">No meaningful nearby no-result demand gaps were found.</p>}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-[#110d0d] p-5 shadow-xl sm:p-7">
          <div className="mb-5">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff6b86]">Social Manager</p>
            <h2 className="mt-2 text-2xl font-black">Create once. Publish everywhere you choose.</h2>
            <p className="mt-2 max-w-3xl text-sm font-semibold text-white/40">Use one master draft, tailor the copy per connected channel, preserve provider-specific controls, and send everything through the same approved publishing pipeline.</p>
          </div>
          <LocationSocialComposer
            locationId={locationId}
            connections={(["instagram", "facebook", "tiktok", "youtube"] as const).map((provider) => {
              const row = socialByProvider.get(provider);
              return {
                provider,
                connected: row?.status === "connected",
                displayName: row?.display_name || null,
                username: row?.username || null,
                metadata: row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
                  ? row.metadata as Record<string, unknown>
                  : null,
              };
            })}
            mediaOptions={mediaOptions}
            demandOpportunities={(demand?.demandOpportunities || []).map((item) => ({
              query: item.query,
              searches30d: item.searches30d,
              searches7d: item.searches7d,
              trendPercent: item.trendPercent,
              noResultSearches: item.noResultSearches,
            }))}
          />
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5 sm:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div><p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff6b86]">Performance</p><h2 className="mt-2 text-2xl font-black">Social performance</h2><p className="mt-2 text-sm font-semibold text-white/40">Metrics stay provider-specific where definitions differ; recent comparable engagement is summarized above.</p></div>
            <LocationSocialInsightsSync locationId={locationId} connectedCount={connectedChannelCount} />
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {(["instagram", "facebook", "tiktok", "youtube"] as const).map((provider) => {
              const connectionRow = socialByProvider.get(provider);
              const account = connectionRow ? latestAccountMetricByConnection.get(connectionRow.id) : null;
              const label = provider === "instagram" ? "Instagram" : provider === "facebook" ? "Facebook" : provider === "tiktok" ? "TikTok" : "YouTube";
              return <div key={provider} className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex items-center justify-between gap-2"><p className="text-sm font-black">{label}</p><span className={`rounded-full px-2 py-1 text-[10px] font-black ${connectionRow?.status === "connected" ? "bg-emerald-500/10 text-emerald-200" : "bg-white/[0.05] text-white/35"}`}>{connectionRow?.status === "connected" ? "Connected" : "Not connected"}</span></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><p className="font-semibold text-white/35">{provider === "youtube" ? "Subscribers" : "Followers"}</p><p className="mt-1 font-black text-white/75">{metric(account?.followers)}</p></div><div><p className="font-semibold text-white/35">Posts</p><p className="mt-1 font-black text-white/75">{metric(account?.posts)}</p></div><div><p className="font-semibold text-white/35">Views</p><p className="mt-1 font-black text-white/75">{metric(account?.views)}</p></div><div><p className="font-semibold text-white/35">Reach</p><p className="mt-1 font-black text-white/75">{metric(account?.reach)}</p></div></div><p className="mt-3 text-[10px] font-semibold text-white/25">{connectionRow?.last_sync_at ? `Synced ${new Date(connectionRow.last_sync_at).toLocaleString()}` : "Not synced yet"}</p>{connectionRow?.last_error ? <p className="mt-2 text-[11px] font-bold text-amber-200">{connectionRow.last_error}</p> : null}</div>;
            })}
          </div>

          <div className="mt-6 space-y-3">
            {posts.length ? posts.map((post) => {
              const row = latestMetricByPost.get(post.id);
              const label = post.platform === "instagram" ? "Instagram" : post.platform === "facebook" ? "Facebook" : post.platform === "tiktok" ? "TikTok" : "YouTube";
              return <div key={post.id} className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-white/[0.06] px-2 py-1 text-[10px] font-black text-white/55">{label}</span><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/30">{post.status}</span></div><p className="mt-2 line-clamp-2 text-sm font-bold text-white/80">{post.caption || `${label} post`}</p><p className="mt-2 text-xs font-semibold text-white/35">{post.posted_at ? `Published ${new Date(post.posted_at).toLocaleString()}` : post.scheduled_at ? `Scheduled ${new Date(post.scheduled_at).toLocaleString()}` : post.status}</p>{post.error_message ? <p className="mt-2 text-xs font-bold text-red-200">{post.error_message}</p> : null}</div><div className="flex flex-wrap gap-2 text-xs font-black text-white/55"><span className="rounded-lg bg-white/[0.05] px-2.5 py-1.5">Views {metric(row?.views)}</span><span className="rounded-lg bg-white/[0.05] px-2.5 py-1.5">Likes {metric(row?.likes)}</span><span className="rounded-lg bg-white/[0.05] px-2.5 py-1.5">Comments {metric(row?.comments)}</span><span className="rounded-lg bg-white/[0.05] px-2.5 py-1.5">Shares {metric(row?.shares)}</span><span className="rounded-lg bg-white/[0.05] px-2.5 py-1.5">Clicks {metric(row?.clicks)}</span>{post.platform_permalink ? <a href={post.platform_permalink} target="_blank" rel="noreferrer" className="rounded-lg bg-white px-2.5 py-1.5 text-black">Open post</a> : null}</div></div></div>;
            }) : <div className="rounded-2xl border border-dashed border-white/10 p-6 text-sm font-semibold text-white/40">No social posts yet. Connect a channel and publish your first post above.</div>}
          </div>
        </section>
    </BusinessPageShell>
  );
}
