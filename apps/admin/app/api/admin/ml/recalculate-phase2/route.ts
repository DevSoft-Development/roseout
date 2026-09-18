import { NextRequest, NextResponse } from "next/server";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { classifySearchIntent } from "@/lib/ml/intentBuckets";
import {
  calculateConfidenceScore,
  calculateConversionRate,
  calculateCtr,
  calculateLocationIntentScore,
  calculatePairScore,
  INTENT_SCORE_VERSION,
  PAIR_SCORE_VERSION,
} from "@/lib/ml/intentScoring";
import { calculateIntentReviewFit, calculatePairReviewFit } from "@/lib/ml/reviewIntelligence";
import {
  CALL_EVENTS,
  CLICK_EVENTS,
  Diagnostics,
  NEGATIVE_EVENTS,
  RESERVE_EVENTS,
  SAVE_EVENTS,
  VIEW_EVENTS,
  bump,
  intentsForSearch,
  isUuid,
  locationIdsFromAnalytics,
  marketFromSearch,
  createPairDiagnostics,
  mlPairs,
  mlResults,
  normalizeEventName,
  pairFromAnalytics,
  pick,
  recommendation,
  text,
} from "@/lib/ml/recalculationSignals";
import { authorizeSearchHealthMlRequest } from "@/lib/ml/admin-ml-auth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SEARCH_EVENT_FIELDS = "raw_query,normalized_query,city,state,borough,neighborhood,metadata,created_at";
const ANALYTICS_EVENT_FIELDS = "event_name,event_type,name,type,event,action,query,location_id,source_location_id,city,borough,neighborhood,location_type,metadata,created_at";
const OUTING_FIELDS = "restaurant_location_id,activity_location_id,source_query,status,saved_at,completed_at,completed_no_feedback_at,completion_inferred_at,last_link_clicked_at,metadata,created_at";
const REVIEW_FEATURE_FIELDS = "location_id,approved_review_count,verified_review_count,recent_review_count,avg_rating,avg_ai_score_boost,quiet_score,loud_score,romantic_score,group_score,family_score,upscale_score,casual_score,photo_worthy_score,lively_score,relaxed_score,grown_vibe_score,date_night_score,birthday_score,girls_night_score,service_score,food_score,ambiance_score,value_score,overall_review_quality_score,review_confidence_score,wait_penalty,overpriced_penalty,service_penalty,noise_penalty,crowded_penalty,quiet_mention_count,loud_mention_count,romantic_mention_count,group_mention_count,family_mention_count,photo_worthy_mention_count,service_issue_count,wait_issue_count,value_issue_count,review_summary";

const PAIR_UPSERT_CONFLICT_TARGET =
  "restaurant_location_id,activity_location_id,intent_bucket,market_key";

const PAIR_FEATURE_COLUMNS = [
  "restaurant_location_id",
  "activity_location_id",
  "intent_bucket",
  "market",
  "market_key",
  "pair_distance_miles",
  "estimated_travel_minutes",
  "impressions_7d",
  "impressions_30d",
  "clicks_7d",
  "clicks_30d",
  "saves_30d",
  "completed_outings_30d",
  "reservation_clicks_30d",
  "call_clicks_30d",
  "website_clicks_30d",
  "negative_signals_30d",
  "ctr_30d",
  "conversion_rate_30d",
  "distance_score",
  "engagement_score",
  "conversion_score",
  "confidence_score",
  "pair_score",
  "score_version",
  "metadata",
  "updated_at",
] as const;

const PAIR_FEATURE_COLUMN_SET = new Set<string>(PAIR_FEATURE_COLUMNS);

function samplePairRowKeys(pairRows: any[], limit: number) {
  return pairRows.slice(0, limit).map((row) => ({
    restaurant_location_id: row.restaurant_location_id,
    activity_location_id: row.activity_location_id,
    intent_bucket: row.intent_bucket,
    market: row.market,
    market_key: row.market_key,
    pair_score: row.pair_score,
  }));
}
function removedPairRowKeys(pairRows: any[]) {
  return [
    ...new Set(
      pairRows.flatMap((row) =>
        Object.keys(row).filter((key) => !PAIR_FEATURE_COLUMN_SET.has(key)),
      ),
    ),
  ].sort();
}
function sanitizePairFeatureRow(row: any) {
  const normalized = {
    ...row,
    impressions_30d: row.impressions_30d ?? row.views_30d ?? 0,
    impressions_7d: row.impressions_7d ?? row.views_7d ?? 0,
  };

  return Object.fromEntries(
    PAIR_FEATURE_COLUMNS.map((column) => [column, normalized[column]]).filter(
      ([, value]) => value !== undefined,
    ),
  );
}
async function authorize(req: NextRequest) { return authorizeSearchHealthMlRequest(req); }
function inc(row: any, event: string, recent7: boolean) {
  if (VIEW_EVENTS.has(event)) {
    row.impressions_30d++;
    if (recent7) row.impressions_7d++;
    row.views_30d++;
    if (recent7) row.views_7d++;
  }
  if (CLICK_EVENTS.has(event)) {
    row.clicks_30d++;
    if (recent7) row.clicks_7d++;
  }
  if (RESERVE_EVENTS.has(event)) row.reservation_clicks_30d++;
  if (CALL_EVENTS.has(event)) row.call_clicks_30d++;
  if (SAVE_EVENTS.has(event)) row.saves_30d++;
  if (NEGATIVE_EVENTS.has(event)) row.negative_signals_30d++;
}
function baseLoc(
  location_id: string,
  intent_bucket: string,
  market: string | null,
  location_type: string | null,
) {
  return {
    location_id,
    intent_bucket,
    market,
    location_type,
    impressions_7d: 0,
    impressions_30d: 0,
    views_7d: 0,
    views_30d: 0,
    clicks_7d: 0,
    clicks_30d: 0,
    reservation_clicks_30d: 0,
    call_clicks_30d: 0,
    website_clicks_30d: 0,
    saves_30d: 0,
    completed_outings_30d: 0,
    negative_signals_30d: 0,
  };
}
function basePair(
  r: string,
  a: string,
  intent_bucket: string,
  market: string | null,
) {
  const marketKey = typeof market === "string" ? market : "";
  return {
    restaurant_location_id: r,
    activity_location_id: a,
    intent_bucket,
    market: market || null,
    market_key: marketKey,
    pair_distance_miles: null,
    estimated_travel_minutes: null,
    impressions_7d: 0,
    impressions_30d: 0,
    clicks_7d: 0,
    clicks_30d: 0,
    saves_30d: 0,
    completed_outings_30d: 0,
    reservation_clicks_30d: 0,
    call_clicks_30d: 0,
    website_clicks_30d: 0,
    negative_signals_30d: 0,
  };
}
let reviewFeatureMap = new Map<string, any>();
function finalizeLoc(row: any) {
  row.market_key = row.market || "";
  row.location_type_key = row.location_type || "";
  const conversions =
    row.completed_outings_30d +
    row.reservation_clicks_30d +
    row.call_clicks_30d +
    row.website_clicks_30d;
  const ctr = calculateCtr(row.clicks_30d, row.impressions_30d);
  const cr = calculateConversionRate(conversions, row.impressions_30d);
  const reviewFeatures = reviewFeatureMap.get(row.location_id);
  const review_fit = calculateIntentReviewFit({ allIntents: [row.intent_bucket], primaryIntent: row.intent_bucket }, reviewFeatures);
  const intent_score = Math.max(0, Math.min(100, calculateLocationIntentScore({
    ...row,
    ctr_30d: ctr,
    conversion_rate_30d: cr,
  }) + review_fit));
  return {
    ...row,
    ctr_30d: ctr,
    conversion_rate_30d: cr,
    engagement_score: intent_score,
    conversion_score: cr * 100,
    confidence_score: calculateConfidenceScore(
      row.impressions_30d,
      row.clicks_30d,
      conversions,
    ),
    intent_score,
    score_version: INTENT_SCORE_VERSION,
    updated_at: new Date().toISOString(),
    metadata: { source: "phase2_recalculate", pii: false, reviewMlApplied: Boolean(reviewFeatures), reviewMlIntentFit: review_fit, reviewMlConfidence: reviewFeatures?.review_confidence_score ?? 0, reviewMlSummary: typeof reviewFeatures?.review_summary === "string" ? reviewFeatures.review_summary.slice(0,500) : null },
  };
}
function finalizePair(row: any) {
  const market = typeof row.market === "string" ? row.market : null;
  const marketKey = typeof market === "string" ? market : "";
  row.market = market || null;
  row.market_key = marketKey;
  const conversions =
    row.completed_outings_30d +
    row.reservation_clicks_30d +
    row.call_clicks_30d +
    row.website_clicks_30d;
  const ctr = calculateCtr(row.clicks_30d, row.impressions_30d);
  const cr = calculateConversionRate(conversions, row.impressions_30d);
  const restaurantReviewFeatures = reviewFeatureMap.get(row.restaurant_location_id);
  const activityReviewFeatures = reviewFeatureMap.get(row.activity_location_id);
  const pair_review_fit = calculatePairReviewFit(restaurantReviewFeatures, activityReviewFeatures, { allIntents: [row.intent_bucket], primaryIntent: row.intent_bucket });
  const pair_score = Math.max(0, Math.min(100, calculatePairScore({
    ...row,
    ctr_30d: ctr,
    conversion_rate_30d: cr,
  }) + pair_review_fit));
  return {
    ...row,
    ctr_30d: ctr,
    conversion_rate_30d: cr,
    distance_score:
      row.pair_distance_miles == null
        ? 0
        : Math.max(0, 20 - Number(row.pair_distance_miles) * 5),
    engagement_score: pair_score,
    conversion_score: cr * 100,
    confidence_score: calculateConfidenceScore(
      row.impressions_30d,
      row.clicks_30d,
      conversions,
    ),
    pair_score,
    score_version: PAIR_SCORE_VERSION,
    updated_at: new Date().toISOString(),
    metadata: { source: "phase2_recalculate", pii: false, reviewMlApplied: Boolean(restaurantReviewFeatures || activityReviewFeatures), pairReviewFit: pair_review_fit },
  };
}
function loc(
  locAgg: Map<string, any>,
  id: string,
  intent: string,
  market: string | null,
  type: string | null,
) {
  const key = `${id}:${intent}:${market || ""}:${type || ""}`;
  const row = locAgg.get(key) || baseLoc(id, intent, market, type);
  locAgg.set(key, row);
  return row;
}
function pair(
  pairAgg: Map<string, any>,
  r: string,
  a: string,
  intent: string,
  market: string | null,
) {
  const key = `${r}:${a}:${intent}:${market || ""}`;
  const row = pairAgg.get(key) || basePair(r, a, intent, market);
  pairAgg.set(key, row);
  return row;
}
export async function POST(req: NextRequest) {
  const authError = await authorize(req);
  if (authError) return authError;
  const errors: string[] = [];
  const since30 = new Date(Date.now() - 30 * 864e5).toISOString();
  const since7 = new Date(Date.now() - 7 * 864e5).toISOString();
  const locAgg = new Map<string, any>();
  const pairAgg = new Map<string, any>();
  const pairDiagnostics = createPairDiagnostics();
  const diagnostics: Diagnostics = {
    searchEventsRead: 0,
    searchEventsWithMlResultIds: 0,
    searchEventsWithMlPairIds: 0,
    searchEventsWithOnlyFirstResultNames: 0,
    analyticsEventsRead: 0,
    analyticsEventsWithLocationId: 0,
    analyticsEventsWithPairIds: 0,
    outingsRead: 0,
    outingsWithRestaurantActivityIds: 0,
    candidateLocationIntentRows: 0,
    candidatePairRows: 0,
    upsertLocationIntentRows: 0,
    upsertPairRows: 0,
    skippedReasons: {},
  };
  const searchRes = await getAdminDatabaseClient()
    .from("search_events")
    .select(SEARCH_EVENT_FIELDS)
    .gte("created_at", since30)
    .limit(20000);
  if (searchRes.error) errors.push(`search_events: ${searchRes.error.message}`);
  const searchRows = (searchRes.data || []) as unknown as Record<string, any>[];
  diagnostics.searchEventsRead = searchRows.length;
  for (const ev of searchRows) {
    const meta = ev.metadata || {};
    const results = mlResults(meta);
    const pairs = mlPairs(meta, pairDiagnostics);
    const rawPairIds = Array.isArray(meta?.ml_pair_ids)
      ? meta.ml_pair_ids
      : Array.isArray(meta?.pairIds)
        ? meta.pairIds
        : [];
    if (results.length) diagnostics.searchEventsWithMlResultIds++;
    if (rawPairIds.length) diagnostics.searchEventsWithMlPairIds++;
    if (
      !results.length &&
      !pairs.length &&
      Array.isArray(meta?.debugParity?.firstResultNames) &&
      meta.debugParity.firstResultNames.length
    )
      diagnostics.searchEventsWithOnlyFirstResultNames++;
    const intents = intentsForSearch(ev);
    const market = marketFromSearch(ev);
    const recent = String(ev.created_at || "") >= since7;
    for (const intent of intents) {
      for (const r of results)
        inc(
          loc(
            locAgg,
            r.location_id,
            intent,
            market || r.market || null,
            text(r.location_type, 50),
          ),
          "search_result_impression",
          recent,
        );
      for (const p of pairs) {
        const pr = pair(
          pairAgg,
          p.restaurant_location_id,
          p.activity_location_id,
          intent,
          market || p.market || null,
        );
        pr.pair_distance_miles = p.pair_distance_miles;
        inc(pr, "search_result_impression", recent);
        inc(
          loc(
            locAgg,
            p.restaurant_location_id,
            intent,
            market || p.market || null,
            "restaurant",
          ),
          "search_result_impression",
          recent,
        );
        inc(
          loc(
            locAgg,
            p.activity_location_id,
            intent,
            market || p.market || null,
            "activity",
          ),
          "search_result_impression",
          recent,
        );
      }
    }
  }
  const eventsRes = await getAdminDatabaseClient()
    .from("analytics_events")
    .select(ANALYTICS_EVENT_FIELDS)
    .gte("created_at", since30)
    .limit(50000);
  if (eventsRes.error)
    errors.push(`analytics_events: ${eventsRes.error.message}`);
  const eventRows = (eventsRes.data || []) as unknown as Record<string, any>[];
  diagnostics.analyticsEventsRead = eventRows.length;
  for (const ev of eventRows) {
    const meta = ev.metadata || {};
    const locs = locationIdsFromAnalytics(ev);
    const p = pairFromAnalytics(ev);
    if (locs.length) diagnostics.analyticsEventsWithLocationId++;
    if (p) diagnostics.analyticsEventsWithPairIds++;
    if (!locs.length && !p) {
      bump(diagnostics, "analytics_missing_ids");
      continue;
    }
    const q = text(
      ev.query ||
        pick(meta, [
          "query",
          "rawQuery",
          "search_query",
          "searchQuery",
          "prompt",
        ]),
    );
    const cls = classifySearchIntent(q || "");
    const market = text(
      ev.city ||
        ev.borough ||
        ev.neighborhood ||
        pick(meta, [
          "market",
          "requestedMarket",
          "requested_market",
          "city",
          "borough",
          "neighborhood",
        ]),
      100,
    );
    const ltype = text(
      ev.location_type ||
        pick(meta, ["location_type", "locationType", "resultType"]),
      50,
    );
    const name = normalizeEventName(ev);
    for (const intent of cls.allIntents) {
      for (const id of locs)
        inc(
          loc(locAgg, id, intent, market, ltype),
          name,
          String(ev.created_at || "") >= since7,
        );
      if (p) {
        inc(
          pair(
            pairAgg,
            p.restaurant_location_id,
            p.activity_location_id,
            intent,
            market,
          ),
          name,
          String(ev.created_at || "") >= since7,
        );
      }
    }
  }
  const outingRes = await getAdminDatabaseClient()
    .from("outings")
    .select(OUTING_FIELDS)
    .gte("created_at", since30)
    .limit(50000);
  if (outingRes.error) errors.push(`outings: ${outingRes.error.message}`);
  const outingRows = (outingRes.data || []) as unknown as Record<string, any>[];
  diagnostics.outingsRead = outingRows.length;
  for (const o of outingRows) {
    const r = o.restaurant_location_id;
    const a = o.activity_location_id;
    if (isUuid(r) && isUuid(a)) diagnostics.outingsWithRestaurantActivityIds++;
    else {
      bump(diagnostics, "outings_missing_pair_ids");
      continue;
    }
    const q = text(o.source_query || pick(o.metadata, ["query", "rawQuery"]));
    const cls = classifySearchIntent(q || "");
    const market = text(pick(o.metadata, ["market", "requestedMarket", "city", "borough", "neighborhood"]), 100);
    const status = String(o.status || "").toLowerCase();
    const names = [
      "search_result_impression",
      o.saved_at || status.includes("saved") ? "plan_saved" : null,
      o.completed_at ||
      o.completed_no_feedback_at ||
      o.completion_inferred_at ||
      status.includes("completed")
        ? "completed"
        : null,
      o.last_link_clicked_at || status.includes("link")
        ? "external_link_clicked"
        : null,
    ].filter(Boolean) as string[];
    for (const intent of cls.allIntents)
      for (const name of names) {
        inc(
          loc(locAgg, r, intent, market, "restaurant"),
          name,
          String(o.created_at || "") >= since7,
        );
        inc(
          loc(locAgg, a, intent, market, "activity"),
          name,
          String(o.created_at || "") >= since7,
        );
        inc(
          pair(pairAgg, r, a, intent, market),
          name,
          String(o.created_at || "") >= since7,
        );
      }
  }
  const reviewIds = Array.from(new Set([...locAgg.values()].map((r:any)=>r.location_id).concat([...pairAgg.values()].flatMap((p:any)=>[p.restaurant_location_id,p.activity_location_id]))));
  if (reviewIds.length) { const { data } = await getAdminDatabaseClient().from("location_review_ml_features").select(REVIEW_FEATURE_FIELDS).in("location_id", reviewIds); const rows = (data || []) as unknown as Record<string, any>[]; reviewFeatureMap = new Map(rows.map((r:any)=>[r.location_id,r])); }
  const locRows = [...locAgg.values()].map(finalizeLoc);
  const pairRows = [...pairAgg.values()].map(finalizePair);
  const sanitizedPairRows = pairRows.map(sanitizePairFeatureRow);
  const pairRowsRemovedKeys = removedPairRowKeys(pairRows);
  diagnostics.candidateLocationIntentRows = locRows.length;
  diagnostics.candidatePairRows = pairRows.length;
  pairDiagnostics.candidatePairRows = pairRows.length;
  let updatedLoc = 0,
    updatedPair = 0;
  if (locRows.length) {
    const { error } = await getAdminDatabaseClient()
      .from("location_intent_ml_features")
      .upsert(locRows, {
        onConflict: "location_id,intent_bucket,market_key,location_type_key",
      });
    if (error) errors.push(`location upsert: ${error.message}`);
    else updatedLoc = locRows.length;
  }
  if (sanitizedPairRows.length) {
    const { error } = await getAdminDatabaseClient()
      .from("location_pair_ml_features")
      .upsert(sanitizedPairRows, {
        onConflict: PAIR_UPSERT_CONFLICT_TARGET,
      });
    if (error) {
      const pairUpsertError = {
        message: error.message ?? null,
        code: error.code ?? null,
        details: error.details ?? null,
        hint: error.hint ?? null,
      };
      pairDiagnostics.pairUpsertError = pairUpsertError;
      console.error("[ml-phase2] pair upsert failed", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        pairRowCount: sanitizedPairRows.length,
        conflictTarget: PAIR_UPSERT_CONFLICT_TARGET,
        samplePairRowKeys: samplePairRowKeys(sanitizedPairRows, 2),
        sanitizedPairRowKeys: Object.keys(sanitizedPairRows[0] || {}),
        removedPairRowKeys: pairRowsRemovedKeys,
      });
      errors.push(`pair upsert: ${error.message}`);
      diagnostics.pairUpsertIssue = error.message;
    } else updatedPair = sanitizedPairRows.length;
  }
  diagnostics.upsertLocationIntentRows = updatedLoc;
  diagnostics.upsertPairRows = updatedPair;
  pairDiagnostics.upsertPairRows = updatedPair;
  diagnostics.pairDiagnostics = pairDiagnostics;
  diagnostics.recommendation = recommendation(
    diagnostics,
    updatedLoc + updatedPair,
  );
  if (pairDiagnostics.searchEventsWithMlPairIds > 0 && updatedPair === 0)
    diagnostics.recommendation =
      "Pair IDs were found, but no valid pair rows were upserted. Check pair ID field names and skippedPairReasons.";
  if (pairDiagnostics.validMlPairsExtracted > 0 && updatedPair === 0) {
    const pairUpsertErrorText = [
      pairDiagnostics.pairUpsertError?.message,
      pairDiagnostics.pairUpsertError?.details,
      pairDiagnostics.pairUpsertError?.hint,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    diagnostics.recommendation = pairUpsertErrorText.includes("market_key")
      ? "Database is missing location_pair_ml_features.market_key. Run the pair upsert SQL/migration before rerunning Phase 2."
      : "Valid pairs were extracted but not upserted. Check the location_pair_ml_features unique constraint/upsert conflict target.";
  }
  if (pairDiagnostics.searchEventsWithMlPairIds === 0)
    diagnostics.recommendation =
      "No pair IDs found yet. Run a new mixed outing search after the tracking update.";
  const responsePairDiagnostics = {
    ...pairDiagnostics,
    pairUpsertError: pairDiagnostics.pairUpsertError ?? null,
    upsertConflictTarget: PAIR_UPSERT_CONFLICT_TARGET,
    pairRowsIncludeMarketKey: pairRows.every((row) =>
      Object.prototype.hasOwnProperty.call(row, "market_key"),
    ),
    sanitizedPairRowKeys: Object.keys(sanitizedPairRows[0] || {}),
    removedPairRowKeys: pairRowsRemovedKeys,
    samplePairRowKeys: samplePairRowKeys(sanitizedPairRows, 5),
    candidatePairRows: pairRows.length,
    upsertPairRows: updatedPair,
    validMlPairsExtracted: pairDiagnostics.validMlPairsExtracted,
  };
  diagnostics.pairDiagnostics = responsePairDiagnostics;
  await getAdminDatabaseClient().from("ml_phase2_score_runs").insert({
    status: errors.length ? "completed_with_errors" : "completed",
    processed_location_intents: locRows.length,
    updated_location_intents: updatedLoc,
    processed_pairs: pairRows.length,
    updated_pairs: updatedPair,
    error_count: errors.length,
    score_version: "phase2_rank_v1",
    metadata: {
      errors: errors.slice(0, 20),
      diagnostics,
      pairDiagnostics: responsePairDiagnostics,
    },
  });
  return NextResponse.json({
    success: errors.length === 0,
    processedLocationIntents: locRows.length,
    updatedLocationIntents: updatedLoc,
    processedPairs: pairRows.length,
    updatedPairs: updatedPair,
    errors,
    scoreVersion: "phase2_rank_v1",
    diagnostics,
    pairDiagnostics: responsePairDiagnostics,
    sampleTopLocationIntentScores: locRows
      .sort((a, b) => b.intent_score - a.intent_score)
      .slice(0, 5)
      .map((row) => ({ location_id: row.location_id, intent_bucket: row.intent_bucket, market: row.market, intent_score: row.intent_score })),
    sampleTopPairScores: pairRows
      .sort((a, b) => b.pair_score - a.pair_score)
      .slice(0, 5)
      .map((row) => ({ restaurant_location_id: row.restaurant_location_id, activity_location_id: row.activity_location_id, intent_bucket: row.intent_bucket, market: row.market, pair_score: row.pair_score })),
  });
}
export async function GET(req: NextRequest) {
  return POST(req);
}
