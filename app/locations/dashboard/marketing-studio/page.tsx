import Link from "next/link";
import LocationInstagramPublisher from "@/components/marketing/LocationInstagramPublisher";
import { getCurrentBusinessLocation } from "@/lib/growth-pro/data";
import { getLocationName } from "@/lib/locationName";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

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
    return <main className="min-h-screen bg-[#050607] p-6 text-white"><div className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-white/[0.04] p-8"><h1 className="text-3xl font-black">Marketing Studio</h1><p className="mt-3 text-white/55">Connect or claim a location before publishing social content.</p></div></main>;
  }

  const locationId = String(location.id);
  const { data: connection } = await supabaseAdmin
    .from("marketing_social_connections")
    .select("id,username,status,connected_at,last_sync_at,last_error")
    .eq("scope", "location")
    .eq("location_id", locationId)
    .eq("provider", "instagram")
    .neq("status", "disconnected")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const connected = connection?.status === "connected";

  const { data: posts } = connection?.id
    ? await supabaseAdmin
        .from("social_posts")
        .select("id,caption,status,platform_permalink,posted_at,scheduled_at,error_message,last_metrics_sync_at")
        .eq("social_connection_id", connection.id)
        .eq("platform", "instagram")
        .order("created_at", { ascending: false })
        .limit(12)
    : { data: [] as any[] };

  const postIds = (posts || []).map((post) => post.id);
  const [{ data: accountMetric }, { data: postMetricRows }] = await Promise.all([
    connection?.id
      ? supabaseAdmin
          .from("social_account_metric_snapshots")
          .select("followers,posts,views,reach,captured_at")
          .eq("connection_id", connection.id)
          .order("captured_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    postIds.length
      ? supabaseAdmin
          .from("social_post_metric_snapshots")
          .select("social_post_id,views,reach,likes,comments,shares,saves,captured_at")
          .in("social_post_id", postIds)
          .order("captured_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const latestMetricByPost = new Map<string, any>();
  for (const row of postMetricRows || []) {
    if (!latestMetricByPost.has(row.social_post_id)) latestMetricByPost.set(row.social_post_id, row);
  }
  const aggregate = [...latestMetricByPost.values()].reduce((sum, row) => ({
    views: sum.views + Number(row.views || 0),
    reach: sum.reach + Number(row.reach || 0),
    likes: sum.likes + Number(row.likes || 0),
    comments: sum.comments + Number(row.comments || 0),
  }), { views: 0, reach: 0, likes: 0, comments: 0 });

  const mediaOptions = publicMediaUrls(location as Record<string, unknown>);
  const locationName = getLocationName(location, "Your location");

  return (
    <main className="min-h-screen bg-[#050607] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.24),transparent_34%),linear-gradient(135deg,#170b0d,#070809_62%,#111012)] p-6 shadow-2xl sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-[#ff6b86]">Marketing & growth</p>
              <h1 className="mt-2 text-4xl font-black tracking-tight">Marketing Studio</h1>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-white/55">Create, approve, publish, schedule, and measure Instagram content for {locationName} from one workspace.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/locations/dashboard/social-accounts?locationId=${encodeURIComponent(locationId)}`} className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-black">Social Accounts</Link>
              <Link href={`/locations/dashboard/analytics?locationId=${encodeURIComponent(locationId)}`} className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm font-black">Analytics</Link>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["Instagram", connected ? (connection?.username ? `@${String(connection.username).replace(/^@/, "")}` : "Connected") : "Not connected"],
            ["Followers", metric(accountMetric?.followers)],
            ["Instagram posts", metric(accountMetric?.posts)],
            ["Recent reach", metric(aggregate.reach)],
            ["Recent engagement", metric(aggregate.likes + aggregate.comments)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.17em] text-white/35">{label}</p>
              <p className="mt-2 truncate text-lg font-black text-white/85">{value}</p>
            </div>
          ))}
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-[#110d0d] p-5 shadow-xl sm:p-7">
          <div className="mb-5">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff6b86]">Instagram Publisher</p>
            <h2 className="mt-2 text-2xl font-black">Create your next post</h2>
          </div>
          <LocationInstagramPublisher
            locationId={locationId}
            connected={connected}
            username={connection?.username || null}
            mediaOptions={mediaOptions}
          />
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-xs font-black uppercase tracking-[0.2em] text-[#ff6b86]">Performance</p><h2 className="mt-2 text-2xl font-black">Recent Instagram posts</h2></div>
            <p className="text-xs font-bold text-white/35">Last account sync: {connection?.last_sync_at ? new Date(connection.last_sync_at).toLocaleString() : "Never"}</p>
          </div>
          {connection?.last_error ? <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-500/10 p-3 text-sm font-bold text-amber-100">{connection.last_error}</div> : null}
          <div className="mt-5 space-y-3">
            {(posts || []).length ? (posts || []).map((post) => {
              const row = latestMetricByPost.get(post.id);
              return <div key={post.id} className="rounded-2xl border border-white/10 bg-black/20 p-4"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div className="min-w-0"><p className="line-clamp-2 text-sm font-bold text-white/80">{post.caption || "Instagram post"}</p><p className="mt-2 text-xs font-semibold text-white/35">{post.posted_at ? `Published ${new Date(post.posted_at).toLocaleString()}` : post.scheduled_at ? `Scheduled ${new Date(post.scheduled_at).toLocaleString()}` : post.status}</p>{post.error_message ? <p className="mt-2 text-xs font-bold text-red-200">{post.error_message}</p> : null}</div><div className="flex flex-wrap gap-2 text-xs font-black text-white/55"><span className="rounded-lg bg-white/[0.05] px-2.5 py-1.5">Views {metric(row?.views)}</span><span className="rounded-lg bg-white/[0.05] px-2.5 py-1.5">Reach {metric(row?.reach)}</span><span className="rounded-lg bg-white/[0.05] px-2.5 py-1.5">Likes {metric(row?.likes)}</span><span className="rounded-lg bg-white/[0.05] px-2.5 py-1.5">Comments {metric(row?.comments)}</span>{post.platform_permalink ? <a href={post.platform_permalink} target="_blank" rel="noreferrer" className="rounded-lg bg-white px-2.5 py-1.5 text-black">Open post</a> : null}</div></div></div>;
            }) : <div className="rounded-2xl border border-dashed border-white/10 p-6 text-sm font-semibold text-white/40">No Instagram posts yet. Connect Instagram and publish your first post above.</div>}
          </div>
        </section>
      </div>
    </main>
  );
}
