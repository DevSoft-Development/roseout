import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function MarketingAnalyticsPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.marketing);
  const [{ data: accountMetrics }, { data: postMetrics }] = await Promise.all([
    supabaseAdmin
      .from("social_account_metric_snapshots")
      .select("connection_id,captured_at,followers,following,posts,views,reach")
      .order("captured_at", { ascending: false })
      .limit(100),
    supabaseAdmin
      .from("social_post_metric_snapshots")
      .select("social_post_id,provider,captured_at,views,reach,likes,comments,shares,saves,clicks")
      .order("captured_at", { ascending: false })
      .limit(100),
  ]);

  const accounts = accountMetrics || [];
  const posts = postMetrics || [];
  const latestByConnection = new Map<string, any>();
  for (const row of accounts) if (!latestByConnection.has(row.connection_id)) latestByConnection.set(row.connection_id, row);
  const latestAccounts = [...latestByConnection.values()];
  const totalFollowers = latestAccounts.reduce((sum, row) => sum + Number(row.followers || 0), 0);
  const totalViews = posts.reduce((sum, row) => sum + Number(row.views || 0), 0);
  const totalShares = posts.reduce((sum, row) => sum + Number(row.shares || 0), 0);
  const totalSaves = posts.reduce((sum, row) => sum + Number(row.saves || 0), 0);

  return (
    <main className="space-y-6 p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">Marketing</p>
        <h1 className="text-3xl font-semibold">Social Analytics</h1>
        <p className="mt-1 text-sm text-neutral-600">Snapshot-based metrics preserve growth and post-performance history instead of overwriting totals.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border bg-white p-4"><div className="text-2xl font-semibold">{totalFollowers.toLocaleString()}</div><div className="text-xs uppercase text-neutral-500">Followers</div></div>
        <div className="rounded-xl border bg-white p-4"><div className="text-2xl font-semibold">{totalViews.toLocaleString()}</div><div className="text-xs uppercase text-neutral-500">Post views</div></div>
        <div className="rounded-xl border bg-white p-4"><div className="text-2xl font-semibold">{totalShares.toLocaleString()}</div><div className="text-xs uppercase text-neutral-500">Shares</div></div>
        <div className="rounded-xl border bg-white p-4"><div className="text-2xl font-semibold">{totalSaves.toLocaleString()}</div><div className="text-xs uppercase text-neutral-500">Saves</div></div>
      </div>
      <div className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">Data readiness</h2>
        <p className="mt-2 text-sm text-neutral-600">Account snapshots: {accounts.length}. Post snapshots: {posts.length}. Metrics will populate after social OAuth connections and provider sync jobs are enabled.</p>
      </div>
    </main>
  );
}
