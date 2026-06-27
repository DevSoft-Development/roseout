import Link from "next/link";
import { Brain, Search } from "lucide-react";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  AdminActionButton,
  AdminDataTableShell,
  AdminKpiCard,
  AdminKpiGrid,
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
  formatAdminDate,
} from "@/components/admin/AdminDesignSystem";
import { MlRecalculationActions } from "@/components/admin/ml/MlRecalculationActions";

export const metadata = { title: "Machine Learning – Admin" };
export const dynamic = "force-dynamic";
async function safe<T>(fn: () => Promise<T>, fallback: T) {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}
function n(v: any) {
  return Number(v || 0).toFixed(1);
}
async function loadAdvancedMlDashboard() {
  const tables = [
    "location_review_ml_features",
    "search_result_ml_features",
    "location_pair_ml_features",
    "market_ml_features",
    "time_of_day_ml_features",
    "booking_likelihood_ml_features",
    "business_quality_ml_features",
    "duplicate_ml_candidates",
    "photo_quality_ml_features",
    "owner_lead_ml_features",
  ];
  const counts = await Promise.all(
    tables.map(async (table) => ({
      table,
      count: await safe(async () => (await supabaseAdmin.from(table).select("id", { count: "exact", head: true })).count || 0, 0),
    })),
  );
  const lastRuns = await safe(async () => (await supabaseAdmin.from("advanced_ml_score_runs").select("*").order("started_at", { ascending: false }).limit(12)).data || [], [] as any[]);
  return { counts, lastRuns };
}

async function loadMlDashboard() {
  const [
    p1Run,
    p1Rows,
    p1Top,
    p2Run,
    locCount,
    pairCount,
    topLoc,
    topPair,
    avgLoc,
    avgPair,
    searchReady,
    analyticsReady,
    outingsReady,
    reviewRun,
    reviewRows,
    topReviewRows,
  ] = await Promise.all([
    safe(
      async () =>
        (
          await supabaseAdmin
            .from("location_ml_score_runs")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        ).data,
      null,
    ),
    safe(
      async () =>
        await supabaseAdmin
          .from("location_ml_features")
          .select("ml_score", { count: "exact" })
          .limit(1000),
      { data: [], count: 0 } as any,
    ),
    safe(
      async () =>
        (
          await supabaseAdmin
            .from("location_ml_features")
            .select(
              "location_id,ml_score,impressions_30d,clicks_30d,saves_30d,completed_outings_30d,confidence_score,updated_at,locations(name,restaurant_name,activity_name,location_type,market)",
            )
            .order("ml_score", { ascending: false })
            .limit(25)
        ).data || [],
      [] as any[],
    ),
    safe(
      async () =>
        (
          await supabaseAdmin
            .from("ml_phase2_score_runs")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        ).data,
      null,
    ),
    safe(
      async () =>
        (
          await supabaseAdmin
            .from("location_intent_ml_features")
            .select("id", { count: "exact", head: true })
        ).count || 0,
      0,
    ),
    safe(
      async () =>
        (
          await supabaseAdmin
            .from("location_pair_ml_features")
            .select("id", { count: "exact", head: true })
        ).count || 0,
      0,
    ),
    safe(
      async () =>
        (
          await supabaseAdmin
            .from("location_intent_ml_features")
            .select("*, locations(name,restaurant_name,activity_name)")
            .order("intent_score", { ascending: false })
            .limit(25)
        ).data || [],
      [] as any[],
    ),
    safe(
      async () =>
        (
          await supabaseAdmin
            .from("location_pair_ml_features")
            .select(
              "*, restaurant:locations!location_pair_ml_features_restaurant_location_id_fkey(name,restaurant_name), activity:locations!location_pair_ml_features_activity_location_id_fkey(name,activity_name)",
            )
            .order("pair_score", { ascending: false })
            .limit(25)
        ).data || [],
      [] as any[],
    ),
    safe(
      async () =>
        (
          await supabaseAdmin
            .from("location_intent_ml_features")
            .select("intent_score")
            .limit(1000)
        ).data || [],
      [] as any[],
    ),
    safe(
      async () =>
        (
          await supabaseAdmin
            .from("location_pair_ml_features")
            .select("pair_score")
            .limit(1000)
        ).data || [],
      [] as any[],
    ),
    safe(
      async () =>
        (
          await supabaseAdmin
            .from("search_events")
            .select("metadata")
            .gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString())
            .limit(1000)
        ).data || [],
      [] as any[],
    ),
    safe(
      async () =>
        (
          await supabaseAdmin
            .from("analytics_events")
            .select("metadata,location_id")
            .gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString())
            .limit(1000)
        ).data || [],
      [] as any[],
    ),
    safe(
      async () =>
        (
          await supabaseAdmin
            .from("outings")
            .select(
              "restaurant_location_id,activity_location_id,restaurant_id,activity_id,selected_restaurant_location_id,selected_activity_location_id",
            )
            .gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString())
            .limit(1000)
        ).data || [],
      [] as any[],
    ),
    safe(async () => (await supabaseAdmin.from("review_ml_score_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle()).data, null),
    safe(async () => await supabaseAdmin.from("location_review_ml_features").select("overall_review_quality_score,quiet_score,date_night_score,group_score,girls_night_score,family_score,wait_issue_count,service_issue_count,loud_mention_count", { count: "exact" }).limit(1000), { data: [], count: 0 } as any),
    safe(async () => (await supabaseAdmin.from("location_review_ml_features").select("*, locations(name,restaurant_name,activity_name)").order("overall_review_quality_score", { ascending: false }).limit(25)).data || [], [] as any[]),
  ]);
  const p1Avg = (p1Rows.data || []).length
    ? (p1Rows.data || []).reduce(
        (s: any, r: any) => s + Number(r.ml_score || 0),
        0,
      ) / (p1Rows.data || []).length
    : 0;
  const avgIntent = avgLoc.length
    ? avgLoc.reduce((s: any, r: any) => s + Number(r.intent_score || 0), 0) /
      avgLoc.length
    : 0;
  const avgPairScore = avgPair.length
    ? avgPair.reduce((s: any, r: any) => s + Number(r.pair_score || 0), 0) /
      avgPair.length
    : 0;
  const readiness = {
    searchMlResults: searchReady.filter(
      (r: any) =>
        Array.isArray(r.metadata?.ml_result_ids) &&
        r.metadata.ml_result_ids.length,
    ).length,
    searchMlPairs: searchReady.filter(
      (r: any) =>
        Array.isArray(r.metadata?.ml_pair_ids) && r.metadata.ml_pair_ids.length,
    ).length,
    firstNamesOnly: searchReady.filter(
      (r: any) =>
        Array.isArray(r.metadata?.debugParity?.firstResultNames) &&
        r.metadata.debugParity.firstResultNames.length &&
        !r.metadata?.ml_result_ids?.length &&
        !r.metadata?.ml_pair_ids?.length,
    ).length,
    analyticsLocationIds: analyticsReady.filter(
      (r: any) =>
        r.location_id || r.metadata?.location_id || r.metadata?.locationId,
    ).length,
    analyticsPairIds: analyticsReady.filter(
      (r: any) =>
        r.metadata?.restaurant_location_id && r.metadata?.activity_location_id,
    ).length,
    outingsPairIds: outingsReady.filter(
      (r: any) =>
        (r.restaurant_location_id ||
          r.restaurant_id ||
          r.selected_restaurant_location_id) &&
        (r.activity_location_id ||
          r.activity_id ||
          r.selected_activity_location_id),
    ).length,
  };
  return {
    p1Run,
    p1Total: p1Rows.count || 0,
    p1Avg,
    p1Top,
    p2Run,
    locCount,
    pairCount,
    topLoc,
    topPair,
    avgIntent,
    avgPairScore,
    readiness,
    reviewRun,
    reviewTotal: reviewRows.count || 0,
    reviewAvgQuality: (reviewRows.data || []).length ? (reviewRows.data || []).reduce((sum: number, r: any) => sum + Number(r.overall_review_quality_score || 0), 0) / (reviewRows.data || []).length : 0,
    reviewStrongQuiet: (reviewRows.data || []).filter((r: any) => Number(r.quiet_score || 0) > 50 || Number(r.date_night_score || 0) > 50).length,
    reviewStrongGroup: (reviewRows.data || []).filter((r: any) => Number(r.group_score || 0) > 50 || Number(r.girls_night_score || 0) > 50).length,
    reviewFamily: (reviewRows.data || []).filter((r: any) => Number(r.family_score || 0) > 50).length,
    reviewIssues: (reviewRows.data || []).filter((r: any) => Number(r.wait_issue_count || 0) >= 3 || Number(r.service_issue_count || 0) >= 3 || Number(r.loud_mention_count || 0) >= 3).length,
    topReviewRows,
  };
}
export default async function MlRankingPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.searchHealth);
  const data = await loadMlDashboard();
  const advanced = await loadAdvancedMlDashboard();
  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Admin Tools / Search"
        title="Machine Learning"
        subtitle="Monitor TheOutHaven’s learned ranking, intent scoring, pair scoring, and ML data readiness."
        badge={
          <span className="rounded-full border border-rose-200/20 bg-rose-500/10 px-3 py-1 text-xs font-black text-rose-100">
            ml_rank_v1 + phase2_rank_v1
          </span>
        }
        actions={
          <>
            <AdminActionButton href="/admin/dashboard/search-health">
              Search Health
            </AdminActionButton>
          </>
        }
      />
      <AdminKpiGrid>
        <AdminKpiCard
          label="Scored locations"
          value={data.p1Total}
          helper={`Avg ml_score ${n(data.p1Avg)} · last ${formatAdminDate(data.p1Run?.created_at)}`}
          icon={Brain}
        />
        <AdminKpiCard
          label="Location intent rows"
          value={data.locCount}
          helper={`Avg intent_score ${n(data.avgIntent)} · last ${formatAdminDate(data.p2Run?.created_at)}`}
        />
        <AdminKpiCard
          label="Pair score rows"
          value={data.pairCount}
          helper={`Avg pair_score ${n(data.avgPairScore)} · last ${formatAdminDate(data.p2Run?.created_at)}`}
        />
        <AdminKpiCard
          label="Search Health"
          value="Open"
          helper="Test ranking impact and debug output"
          icon={Search}
        />
      </AdminKpiGrid>
      <AdminSectionCard className="p-5">
        <h2 className="text-xl font-black">Recalculation actions</h2>
        <p className="mt-2 text-sm text-white/60">
          Run ML recalculations without leaving this dashboard.
        </p>
        <div className="mt-4">
          <MlRecalculationActions />
        </div>
      </AdminSectionCard>
      <AdminSectionCard className="p-5">
        <h2 className="text-xl font-black">Review Intelligence ML</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <p>Locations with intelligence: <b>{data.reviewTotal}</b></p>
          <p>Average review quality: <b>{n(data.reviewAvgQuality)}</b></p>
          <p>Quiet/date-night fit: <b>{data.reviewStrongQuiet}</b></p>
          <p>Group outing fit: <b>{data.reviewStrongGroup}</b></p>
          <p>Family-friendly fit: <b>{data.reviewFamily}</b></p>
          <p>Repeated issue patterns: <b>{data.reviewIssues}</b></p>
          <p>Last run: <b>{formatAdminDate(data.reviewRun?.started_at)}</b></p>
          <p>Reviews scanned: <b>{data.reviewRun?.reviews_scanned ?? "—"}</b></p>
        </div>
      </AdminSectionCard>
      {data.topReviewRows.length ? (
        <AdminDataTableShell>
          <h2 className="p-3 text-lg font-black">Review Intelligence locations</h2>
          <table className="min-w-full text-left text-xs"><thead className="text-white/45"><tr>{["Location","Approved","Verified","Quality","Confidence","Best for","Watchouts","Last reviewed","Actions"].map((h)=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{data.topReviewRows.map((r:any)=><tr className="border-t border-white/10" key={r.location_id}><td className="p-2 font-bold">{r.locations?.name || r.locations?.restaurant_name || r.locations?.activity_name || r.location_id}</td><td className="p-2">{r.approved_review_count}</td><td className="p-2">{r.verified_review_count}</td><td className="p-2">{n(r.overall_review_quality_score)}</td><td className="p-2">{n(r.review_confidence_score)}</td><td className="p-2">{(r.best_for_terms || []).slice(0,3).join(", ") || r.review_summary || "Approved review signals"}</td><td className="p-2">{(r.avoid_if_terms || []).slice(0,3).join(", ") || (r.loud_mention_count === 1 ? "One-off issue only: not affecting ranking yet" : "—")}</td><td className="p-2">{formatAdminDate(r.last_review_at)}</td><td className="p-2"><span className="rounded-full border border-white/10 px-2 py-1 text-white/60">Rank-ready</span></td></tr>)}</tbody></table>
        </AdminDataTableShell>
      ) : null}
      <AdminSectionCard className="p-5">
        <h2 className="text-xl font-black">Data readiness</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <p>
            Searches with result IDs: <b>{data.readiness.searchMlResults}</b>
          </p>
          <p>
            Searches with pair IDs: <b>{data.readiness.searchMlPairs}</b>
          </p>
          <p>
            First names only: <b>{data.readiness.firstNamesOnly}</b>
          </p>
          <p>
            Analytics with location IDs:{" "}
            <b>{data.readiness.analyticsLocationIds}</b>
          </p>
          <p>
            Analytics with pair IDs: <b>{data.readiness.analyticsPairIds}</b>
          </p>
          <p>
            Outings with pair IDs: <b>{data.readiness.outingsPairIds}</b>
          </p>
        </div>
        <div className="mt-4 space-y-2 text-sm">
          {data.p1Total > 0 ? (
            <p className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-3 text-emerald-100">
              Phase 1 learned ranking is active.
            </p>
          ) : null}
          {data.readiness.searchMlResults > 0 ? (
            <p className="rounded-2xl border border-sky-300/20 bg-sky-400/10 p-3 text-sky-100">
              ML-ready result IDs are being collected.
            </p>
          ) : null}
          {data.readiness.searchMlResults > 0 && data.locCount > 0 ? (
            <p className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-3 text-emerald-100">
              Phase 2 location intent scoring is active.
            </p>
          ) : null}
          {data.readiness.searchMlPairs > 0 && data.pairCount === 0 ? (
            <p className="rounded-2xl border border-amber-300/20 bg-amber-400/10 p-3 text-amber-100">
              Pair IDs are being collected, but pair scoring has not produced
              rows yet. Run Phase 2 recalculation again and review pair
              diagnostics.
            </p>
          ) : null}
          {data.pairCount > 0 ? (
            <p className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-3 text-emerald-100">
              Phase 2 pair scoring is active.
            </p>
          ) : null}
          {data.readiness.firstNamesOnly > 0 &&
          data.readiness.searchMlResults === 0 &&
          data.readiness.searchMlPairs === 0 ? (
            <p className="rounded-2xl border border-amber-300/20 bg-amber-400/10 p-3 text-amber-100">
              Search events exist, but they only contain firstResultNames and no
              location IDs. Future searches will be ML-ready after the tracking
              update.
            </p>
          ) : null}
        </div>
        <Link
          className="mt-4 inline-flex rounded-full border border-white/10 px-3 py-1.5 text-xs font-black text-white/70"
          href="/admin/dashboard/search-health"
        >
          Open Search Health
        </Link>
      </AdminSectionCard>
      {data.p1Top.length ? (
        <AdminDataTableShell>
          <h2 className="p-3 text-lg font-black">Top ML-scored locations</h2>
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase text-white/45">
              <tr>
                {[
                  "Location",
                  "Type",
                  "Market",
                  "Impr",
                  "Clicks",
                  "Saves",
                  "Completed",
                  "ML score",
                  "Updated",
                ].map((h) => (
                  <th className="p-3" key={h}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.p1Top.map((row: any) => (
                <tr key={row.location_id} className="border-t border-white/10">
                  <td className="p-3 font-bold">
                    {row.locations?.name ||
                      row.locations?.restaurant_name ||
                      row.locations?.activity_name ||
                      row.location_id}
                  </td>
                  <td className="p-3">{row.locations?.location_type || "—"}</td>
                  <td className="p-3">{row.locations?.market || "—"}</td>
                  <td className="p-3">{row.impressions_30d}</td>
                  <td className="p-3">{row.clicks_30d}</td>
                  <td className="p-3">{row.saves_30d}</td>
                  <td className="p-3">{row.completed_outings_30d}</td>
                  <td className="p-3 font-black">{n(row.ml_score)}</td>
                  <td className="p-3">{formatAdminDate(row.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminDataTableShell>
      ) : (
        <AdminSectionCard className="p-5 text-sm text-white/65">
          Phase 1 is installed, but no ML-ready location data has been collected
          yet. New search events must include metadata.ml_result_ids, analytics
          events must include location_id, or outings must include
          restaurant/activity IDs.
        </AdminSectionCard>
      )}
      {data.topLoc.length ? (
        <AdminDataTableShell>
          <h2 className="p-3 text-lg font-black">
            Top 25 location intent scores
          </h2>
          <table className="min-w-full text-left text-xs">
            <thead className="text-white/45">
              <tr>
                {[
                  "Location",
                  "Intent",
                  "Market",
                  "Type",
                  "Impr",
                  "Clicks",
                  "Saves",
                  "Completed",
                  "Conf",
                  "Score",
                ].map((h) => (
                  <th className="p-2" key={h}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.topLoc.map((r: any) => (
                <tr className="border-t border-white/10" key={r.id}>
                  <td className="p-2 font-bold">
                    {r.locations?.name ||
                      r.locations?.restaurant_name ||
                      r.locations?.activity_name ||
                      r.location_id}
                  </td>
                  <td className="p-2">{r.intent_bucket}</td>
                  <td className="p-2">{r.market || "—"}</td>
                  <td className="p-2">{r.location_type || "—"}</td>
                  <td className="p-2">{r.impressions_30d}</td>
                  <td className="p-2">{r.clicks_30d}</td>
                  <td className="p-2">{r.saves_30d}</td>
                  <td className="p-2">{r.completed_outings_30d}</td>
                  <td className="p-2">{n(r.confidence_score)}</td>
                  <td className="p-2 font-black">{n(r.intent_score)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminDataTableShell>
      ) : (
        <AdminSectionCard className="p-5 text-sm text-white/65">
          Phase 2 is installed, but no ML-ready result data has been collected
          yet. New search events must include metadata.ml_result_ids and
          metadata.ml_pair_ids. Run a few searches, click/save plans, then rerun
          Phase 2.
        </AdminSectionCard>
      )}

      <AdminSectionCard className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-black">Advanced ML Roadmap</h2>
            <p className="text-sm text-white/60">Explainable review intelligence, result quality, pair compatibility, market/time behavior, booking likelihood, business trust, duplicate detection, photo quality, and owner lead scoring.</p>
          </div>
          <AdminActionButton href="/api/admin/ml/recalculate-advanced-all">Run all advanced ML</AdminActionButton>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {advanced.counts.map((item) => (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4" key={item.table}>
              <div className="text-xs uppercase tracking-[0.2em] text-white/45">{item.table.replaceAll("_", " ")}</div>
              <div className="mt-2 text-2xl font-black">{item.count}</div>
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {advanced.lastRuns.map((run) => (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4" key={run.id}>
              <div className="font-bold">{String(run.run_type).replaceAll("_", " ")}</div>
              <div className="text-sm text-white/60">{run.status} · {run.records_updated || 0} records updated · {formatAdminDate(run.completed_at || run.started_at)}</div>
            </div>
          ))}
          {!advanced.lastRuns.length ? <p className="text-sm text-white/60">No advanced ML runs yet. Use the protected recalculation routes or nightly cron.</p> : null}
        </div>
      </AdminSectionCard>

      <AdminDataTableShell>
        <h2 className="p-3 text-lg font-black">Top 25 pair scores</h2>
        <table className="min-w-full text-left text-xs">
          <thead className="text-white/45">
            <tr>
              {[
                "Restaurant",
                "Activity",
                "Intent",
                "Market",
                "Miles",
                "Impr",
                "Clicks",
                "Saves",
                "Completed",
                "Conf",
                "Score",
              ].map((h) => (
                <th className="p-2" key={h}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.topPair.map((r: any) => (
              <tr className="border-t border-white/10" key={r.id}>
                <td className="p-2 font-bold">
                  {r.restaurant?.name ||
                    r.restaurant?.restaurant_name ||
                    r.restaurant_location_id}
                </td>
                <td className="p-2 font-bold">
                  {r.activity?.name ||
                    r.activity?.activity_name ||
                    r.activity_location_id}
                </td>
                <td className="p-2">{r.intent_bucket}</td>
                <td className="p-2">{r.market || "—"}</td>
                <td className="p-2">{r.pair_distance_miles ?? "—"}</td>
                <td className="p-2">{r.impressions_30d}</td>
                <td className="p-2">{r.clicks_30d}</td>
                <td className="p-2">{r.saves_30d}</td>
                <td className="p-2">{r.completed_outings_30d}</td>
                <td className="p-2">{n(r.confidence_score)}</td>
                <td className="p-2 font-black">{n(r.pair_score)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.topPair.length ? (
          <p className="p-5 text-sm text-white/60">
            No pair rows yet. Pair scoring needs metadata.ml_pair_ids or outings
            with restaurant/activity IDs.
          </p>
        ) : null}
      </AdminDataTableShell>
    </AdminPageShell>
  );
}
