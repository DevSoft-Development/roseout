import Link from "next/link";

import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { MlRecalculationActions } from "@/components/admin/ml/MlRecalculationActions";
import {
  AdminActionButton,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
} from "../../../../components/admin/AdminDesignSystem";

export const metadata = { title: "Machine Learning – Admin" };
export const dynamic = "force-dynamic";

const ML_ROLES = ["superadmin", "admin", "experience_team"] as const;

async function safe<T>(fn: () => Promise<T>, fallback: T) {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

function number(value: unknown) {
  return Number(value || 0).toFixed(1);
}

function date(value: unknown) {
  if (!value) return "—";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}

export default async function MlRankingPage() {
  await requireAdminRole([...ML_ROLES]);
  const db = getAdminDatabaseClient();
  const since30 = new Date(Date.now() - 30 * 864e5).toISOString();

  const [
    p1Run,
    p1Rows,
    p1Top,
    p2Run,
    intentCount,
    pairCount,
    topIntent,
    topPair,
    reviewRun,
    reviewRows,
    topReviewRows,
    searchReady,
    analyticsReady,
    outingsReady,
    advancedRuns,
  ] = await Promise.all([
    safe(async () => (await db.from("location_ml_score_runs").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle()).data, null),
    safe(async () => await db.from("location_ml_features").select("ml_score", { count: "exact" }).limit(1000), { data: [], count: 0 } as any),
    safe(async () => (await db.from("location_ml_features").select("location_id,ml_score,impressions_30d,clicks_30d,saves_30d,completed_outings_30d,updated_at,locations(name,restaurant_name,activity_name,location_type,market)").order("ml_score", { ascending: false }).limit(25)).data || [], [] as any[]),
    safe(async () => (await db.from("ml_phase2_score_runs").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle()).data, null),
    safe(async () => (await db.from("location_intent_ml_features").select("id", { count: "exact", head: true })).count || 0, 0),
    safe(async () => (await db.from("location_pair_ml_features").select("id", { count: "exact", head: true })).count || 0, 0),
    safe(async () => (await db.from("location_intent_ml_features").select("*, locations(name,restaurant_name,activity_name)").order("intent_score", { ascending: false }).limit(25)).data || [], [] as any[]),
    safe(async () => (await db.from("location_pair_ml_features").select("*, restaurant:locations!location_pair_ml_features_restaurant_location_id_fkey(name,restaurant_name), activity:locations!location_pair_ml_features_activity_location_id_fkey(name,activity_name)").order("pair_score", { ascending: false }).limit(25)).data || [], [] as any[]),
    safe(async () => (await db.from("review_ml_score_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle()).data, null),
    safe(async () => await db.from("location_review_ml_features").select("overall_review_quality_score,quiet_score,date_night_score,group_score,girls_night_score,family_score,wait_issue_count,service_issue_count,loud_mention_count", { count: "exact" }).limit(1000), { data: [], count: 0 } as any),
    safe(async () => (await db.from("location_review_ml_features").select("*, locations(name,restaurant_name,activity_name)").order("overall_review_quality_score", { ascending: false }).limit(25)).data || [], [] as any[]),
    safe(async () => (await db.from("search_events").select("metadata").gte("created_at", since30).limit(1000)).data || [], [] as any[]),
    safe(async () => (await db.from("analytics_events").select("metadata,location_id").gte("created_at", since30).limit(1000)).data || [], [] as any[]),
    safe(async () => (await db.from("outings").select("restaurant_location_id,activity_location_id,restaurant_id,activity_id,selected_restaurant_location_id,selected_activity_location_id").gte("created_at", since30).limit(1000)).data || [], [] as any[]),
    safe(async () => (await db.from("advanced_ml_score_runs").select("*").order("started_at", { ascending: false }).limit(12)).data || [], [] as any[]),
  ]);

  const p1Data = p1Rows.data || [];
  const reviewData = reviewRows.data || [];
  const p1Average = p1Data.length ? p1Data.reduce((sum: number, row: any) => sum + Number(row.ml_score || 0), 0) / p1Data.length : 0;
  const reviewAverage = reviewData.length ? reviewData.reduce((sum: number, row: any) => sum + Number(row.overall_review_quality_score || 0), 0) / reviewData.length : 0;
  const readiness = {
    searchMlResults: searchReady.filter((row: any) => Array.isArray(row.metadata?.ml_result_ids) && row.metadata.ml_result_ids.length).length,
    searchMlPairs: searchReady.filter((row: any) => Array.isArray(row.metadata?.ml_pair_ids) && row.metadata.ml_pair_ids.length).length,
    analyticsLocationIds: analyticsReady.filter((row: any) => row.location_id || row.metadata?.location_id || row.metadata?.locationId).length,
    outingsPairIds: outingsReady.filter((row: any) =>
      (row.restaurant_location_id || row.restaurant_id || row.selected_restaurant_location_id) &&
      (row.activity_location_id || row.activity_id || row.selected_activity_location_id)
    ).length,
  };

  const cards = [
    ["Scored locations", p1Rows.count || 0, `Avg score ${number(p1Average)} · last ${date((p1Run as any)?.created_at)}`],
    ["Location intent rows", intentCount, `Last Phase 2 ${date((p2Run as any)?.created_at)}`],
    ["Pair score rows", pairCount, "Restaurant + activity compatibility rows"],
    ["Review intelligence", reviewRows.count || 0, `Avg quality ${number(reviewAverage)} · last ${date((reviewRun as any)?.started_at)}`],
  ];

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Search Intelligence"
        title="Machine Learning"
        subtitle="Monitor learned ranking, intent scoring, pair compatibility, review intelligence, recalculation workflows, and ML data readiness."
        actions={<AdminActionButton href="/admin/dashboard/search-health">Search Health</AdminActionButton>}
      />

      <AdminKpiGrid>
        {cards.map(([label, value, helper]) => (
          <AdminKpiCard key={String(label)} label={String(label)} value={value as number} helper={String(helper)} />
        ))}
      </AdminKpiGrid>

      <AdminSectionCard className="p-5">
          <h2 className="text-xl font-black">Recalculation actions</h2>
          <p className="mt-2 text-sm text-white/60">Run protected recalculation workflows without leaving the dashboard.</p>
          <div className="mt-4"><MlRecalculationActions /></div>
          <div className="mt-4">
            <Link href="/api/admin/ml/recalculate-advanced-all" className="inline-flex rounded-xl border border-white/15 px-4 py-2 text-sm font-black text-white/80">
              Run all advanced ML
            </Link>
          </div>
      </AdminSectionCard>

      <AdminSectionCard className="p-5">
          <h2 className="text-xl font-black">Data readiness</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <p>Searches with result IDs: <b>{readiness.searchMlResults}</b></p>
            <p>Searches with pair IDs: <b>{readiness.searchMlPairs}</b></p>
            <p>Analytics with location IDs: <b>{readiness.analyticsLocationIds}</b></p>
            <p>Outings with pair IDs: <b>{readiness.outingsPairIds}</b></p>
          </div>
      </AdminSectionCard>

      <AdminSectionCard>
          <div className="border-b border-white/10 px-5 py-4"><h2 className="text-xl font-black">Top ML-scored locations</h2></div>
          {p1Top.length ? <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm">
            <thead className="bg-white/[.03] text-left text-[10px] uppercase tracking-[.16em] text-white/40"><tr><th className="p-3">Location</th><th className="p-3">Type</th><th className="p-3">Market</th><th className="p-3">Impressions</th><th className="p-3">Clicks</th><th className="p-3">Saves</th><th className="p-3">Completed</th><th className="p-3">Score</th><th className="p-3">Updated</th></tr></thead>
            <tbody>{p1Top.map((row:any)=><tr key={row.location_id} className="border-t border-white/10"><td className="p-3 font-black">{row.locations?.name || row.locations?.restaurant_name || row.locations?.activity_name || row.location_id}</td><td className="p-3 text-white/65">{row.locations?.location_type || "—"}</td><td className="p-3 text-white/65">{row.locations?.market || "—"}</td><td className="p-3">{row.impressions_30d}</td><td className="p-3">{row.clicks_30d}</td><td className="p-3">{row.saves_30d}</td><td className="p-3">{row.completed_outings_30d}</td><td className="p-3 font-black">{number(row.ml_score)}</td><td className="p-3 text-white/55">{date(row.updated_at)}</td></tr>)}</tbody>
          </table></div> : <p className="p-6 text-sm text-white/50">No ML-scored location rows yet.</p>}
        </AdminSectionCard>

        <AdminSectionCard>
          <div className="border-b border-white/10 px-5 py-4"><h2 className="text-xl font-black">Top intent scores</h2></div>
          {topIntent.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm">
            <thead className="bg-white/[.03] text-left text-[10px] uppercase tracking-[.16em] text-white/40"><tr><th className="p-3">Location</th><th className="p-3">Intent</th><th className="p-3">Market</th><th className="p-3">Confidence</th><th className="p-3">Score</th></tr></thead>
            <tbody>{topIntent.map((row:any)=><tr key={row.id} className="border-t border-white/10"><td className="p-3 font-black">{row.locations?.name || row.locations?.restaurant_name || row.locations?.activity_name || row.location_id}</td><td className="p-3">{row.intent_bucket}</td><td className="p-3">{row.market || "—"}</td><td className="p-3">{number(row.confidence_score)}</td><td className="p-3 font-black">{number(row.intent_score)}</td></tr>)}</tbody>
          </table></div> : <p className="p-6 text-sm text-white/50">No location intent rows yet.</p>}
        </AdminSectionCard>

        <AdminSectionCard>
          <div className="border-b border-white/10 px-5 py-4"><h2 className="text-xl font-black">Top pair scores</h2></div>
          {topPair.length ? <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm">
            <thead className="bg-white/[.03] text-left text-[10px] uppercase tracking-[.16em] text-white/40"><tr><th className="p-3">Restaurant</th><th className="p-3">Activity</th><th className="p-3">Intent</th><th className="p-3">Market</th><th className="p-3">Miles</th><th className="p-3">Score</th></tr></thead>
            <tbody>{topPair.map((row:any)=><tr key={row.id} className="border-t border-white/10"><td className="p-3 font-black">{row.restaurant?.name || row.restaurant?.restaurant_name || row.restaurant_location_id}</td><td className="p-3 font-black">{row.activity?.name || row.activity?.activity_name || row.activity_location_id}</td><td className="p-3">{row.intent_bucket}</td><td className="p-3">{row.market || "—"}</td><td className="p-3">{row.pair_distance_miles ?? "—"}</td><td className="p-3 font-black">{number(row.pair_score)}</td></tr>)}</tbody>
          </table></div> : <p className="p-6 text-sm text-white/50">No pair score rows yet.</p>}
        </AdminSectionCard>

        <AdminSectionCard>
          <div className="border-b border-white/10 px-5 py-4"><h2 className="text-xl font-black">Review intelligence</h2></div>
          {topReviewRows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm">
            <thead className="bg-white/[.03] text-left text-[10px] uppercase tracking-[.16em] text-white/40"><tr><th className="p-3">Location</th><th className="p-3">Approved</th><th className="p-3">Verified</th><th className="p-3">Quality</th><th className="p-3">Confidence</th><th className="p-3">Best for</th><th className="p-3">Last review</th></tr></thead>
            <tbody>{topReviewRows.map((row:any)=><tr key={row.location_id} className="border-t border-white/10"><td className="p-3 font-black">{row.locations?.name || row.locations?.restaurant_name || row.locations?.activity_name || row.location_id}</td><td className="p-3">{row.approved_review_count}</td><td className="p-3">{row.verified_review_count}</td><td className="p-3">{number(row.overall_review_quality_score)}</td><td className="p-3">{number(row.review_confidence_score)}</td><td className="p-3 text-white/65">{(row.best_for_terms || []).slice(0,3).join(", ") || row.review_summary || "—"}</td><td className="p-3 text-white/55">{date(row.last_review_at)}</td></tr>)}</tbody>
          </table></div> : <p className="p-6 text-sm text-white/50">No review intelligence rows yet.</p>}
        </AdminSectionCard>

        <AdminSectionCard className="p-5">
          <h2 className="text-xl font-black">Advanced ML runs</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {advancedRuns.map((run:any)=><article key={run.id} className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="font-black capitalize">{String(run.run_type || "ML run").replaceAll("_"," ")}</p><p className="mt-1 text-sm text-white/55">{run.status || "unknown"} · {run.records_updated || 0} records · {date(run.completed_at || run.started_at)}</p></article>)}
            {!advancedRuns.length ? <p className="text-sm text-white/50">No advanced ML runs yet.</p> : null}
          </div>
        </AdminSectionCard>
    </AdminPageShell>
  );
}
