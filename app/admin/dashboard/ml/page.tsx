import { Brain } from "lucide-react";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { AdminActionButton, AdminKpiCard, AdminKpiGrid, AdminPageHeader, AdminPageShell, AdminSectionCard, formatAdminDate } from "@/components/admin/AdminDesignSystem";

export const metadata = { title: "ML Ranking – Admin" };
export const dynamic = "force-dynamic";

async function loadMlRanking() {
  const [lastRun, features, top] = await Promise.all([
    supabaseAdmin.from("location_ml_score_runs").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from("location_ml_features").select("location_id,ml_score,impressions_30d", { count: "exact" }).limit(1000),
    supabaseAdmin.from("location_ml_features").select("location_id,ml_score,impressions_30d,clicks_30d,saves_30d,completed_outings_30d,updated_at").order("ml_score", { ascending: false }).limit(25),
  ]);
  const rows = features.data || [];
  return {
    lastRun: lastRun.data,
    total: features.count ?? rows.length,
    average: rows.length ? rows.reduce((sum: number, row: any) => sum + Number(row.ml_score || 0), 0) / rows.length : 0,
    top: top.data || [],
    errors: [lastRun.error, features.error, top.error].filter(Boolean).map((e: any) => e.message),
  };
}

export default async function MlRankingPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.searchHealth);
  const data = await loadMlRanking();
  const warnings = data.top.filter((row: any) => Number(row.ml_score) >= 50 && Number(row.impressions_30d) < 25);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Admin Tools / Search"
        title="ML Ranking Phase 1"
        subtitle="A production-safe learned-ranking readiness layer. ML score is a capped additive boost, not a replacement for relevance, geography, category, or publishability rules."
        badge={<span className="rounded-full border border-rose-200/20 bg-rose-500/10 px-3 py-1 text-xs font-black text-rose-100">ml_rank_v1</span>}
        actions={<form action="/api/admin/ml/recalculate-location-scores" method="post"><AdminActionButton type="submit" variant="primary">Recalculate scores</AdminActionButton></form>}
      />
      {data.errors.length ? <AdminSectionCard className="p-4 text-sm text-amber-200">ML tables may not be migrated yet: {data.errors.join("; ")}</AdminSectionCard> : null}
      <AdminKpiGrid>
        <AdminKpiCard label="Last run" value={formatAdminDate(data.lastRun?.created_at)} helper={data.lastRun?.status || "No runs yet"} icon={Brain} />
        <AdminKpiCard label="Scored locations" value={data.total} helper="Rows in location_ml_features" />
        <AdminKpiCard label="Average ML score" value={data.average.toFixed(1)} helper="Sample average from loaded rows" />
        <AdminKpiCard label="Low-confidence warnings" value={warnings.length} helper="High score with fewer than 25 impressions" />
      </AdminKpiGrid>
      <AdminSectionCard>
        <div className="border-b border-white/10 p-4"><h2 className="text-lg font-black">Top ML-scored locations</h2><p className="text-sm text-white/55">Boost applied in search: min(20, max(0, ml_score) × 0.15).</p></div>
        <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-white/[0.04] text-left text-xs uppercase tracking-wider text-white/45"><tr><th className="p-3">Location ID</th><th className="p-3">ML score</th><th className="p-3">Impressions</th><th className="p-3">Clicks</th><th className="p-3">Saves</th><th className="p-3">Completions</th><th className="p-3">Updated</th></tr></thead><tbody>{data.top.map((row: any) => <tr key={row.location_id} className="border-t border-white/10"><td className="p-3 font-mono text-xs text-white/70">{row.location_id}</td><td className="p-3 font-black">{Number(row.ml_score || 0).toFixed(2)}</td><td className="p-3">{row.impressions_30d}</td><td className="p-3">{row.clicks_30d}</td><td className="p-3">{row.saves_30d}</td><td className="p-3">{row.completed_outings_30d}</td><td className="p-3">{formatAdminDate(row.updated_at)}</td></tr>)}</tbody></table></div>
      </AdminSectionCard>
    </AdminPageShell>
  );
}
