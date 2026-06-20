import { classifySearchIntent } from "@/lib/ml/intentBuckets";

export type Diagnostics = Record<string, any> & {
  skippedReasons: Record<string, number>;
  recommendation?: string;
};
export const VIEW_EVENTS = new Set([
  "location_view",
  "location_viewed",
  "result_impression",
  "search_result_impression",
  "result_viewed",
  "plan_location_view",
  "view",
]);
export const CLICK_EVENTS = new Set([
  "result_click",
  "location_click",
  "card_click",
  "plan_location_click",
  "reserve_clicked",
  "reservation_clicked",
  "call_clicked",
  "website_clicked",
  "link_clicked",
  "external_link_clicked",
  "click",
]);
export const RESERVE_EVENTS = new Set([
  "reserve_clicked",
  "reservation_clicked",
  "reservation_click",
]);
export const CALL_EVENTS = new Set(["call_clicked", "call_click"]);
export const WEBSITE_EVENTS = new Set([
  "website_clicked",
  "website_click",
  "link_clicked",
  "external_link_clicked",
]);
export const SAVE_EVENTS = new Set([
  "plan_saved",
  "outing_saved",
  "saved",
  "save",
]);
export const NEGATIVE_EVENTS = new Set([
  "not_interested",
  "skipped",
  "bad_result",
  "hidden",
  "reported_bad_match",
]);
export const isUuid = (v: any) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const arr = (v: any) => (Array.isArray(v) ? v : []);
export const pick = (o: any, keys: string[]) => {
  for (const k of keys) if (o?.[k] != null && o[k] !== "") return o[k];
  return null;
};
export const text = (v: any, max = 500) =>
  typeof v === "string"
    ? v.slice(0, max)
    : v == null
      ? null
      : String(v).slice(0, max);
export function bump(d: Diagnostics, reason: string) {
  d.skippedReasons[reason] = (d.skippedReasons[reason] || 0) + 1;
}
export function normalizeEventName(row: any) {
  const m = row?.metadata || {};
  const raw =
    row?.event_name ||
    row?.eventName ||
    row?.name ||
    row?.type ||
    row?.event ||
    row?.action ||
    m.event_name ||
    m.eventName ||
    m.original_event_name ||
    m.name ||
    m.type ||
    m.event ||
    m.action ||
    "unknown_event";
  return String(raw || "unknown_event")
    .trim()
    .toLowerCase();
}
export function locationIdsFromAnalytics(row: any) {
  const m = row?.metadata || {};
  return [
    row.location_id,
    row.source_location_id,
    pick(m, [
      "location_id",
      "locationId",
      "result_location_id",
      "resultLocationId",
      "restaurant_location_id",
      "restaurantLocationId",
      "activity_location_id",
      "activityLocationId",
    ]),
  ].filter(isUuid);
}
export function pairFromAnalytics(row: any) {
  const m = row?.metadata || {};
  const r = pick(m, ["restaurant_location_id", "restaurantLocationId"]);
  const a = pick(m, ["activity_location_id", "activityLocationId"]);
  return isUuid(r) && isUuid(a)
    ? {
        restaurant_location_id: r,
        activity_location_id: a,
        pair_distance_miles:
          Number(m.pair_distance_miles ?? m.pairDistanceMiles) || null,
      }
    : null;
}
export function mlResults(meta: any) {
  return [
    ...arr(meta?.ml_result_ids),
    ...arr(meta?.results),
    ...arr(meta?.debug?.results),
    ...arr(meta?.debugParity?.results),
    ...arr(meta?.resultIds),
  ]
    .map((r: any) => ({
      location_id: r.location_id || r.locationId || r.id,
      location_type: r.location_type || r.locationType || r.type,
      market: r.market,
      rank: r.rank,
    }))
    .filter((r: any) => isUuid(r.location_id));
}
export type MlPairExtractionDiagnostics = {
  searchEventsWithMlPairIds: number;
  totalMlPairObjectsSeen: number;
  validMlPairsExtracted: number;
  invalidMlPairsSkipped: number;
  skippedPairReasons: Record<string, number>;
  samplePairKeys: Array<Record<string, any>>;
  candidatePairRows: number;
  upsertPairRows: number;
  pairUpsertError?: {
    message?: string | null;
    code?: string | null;
    details?: string | null;
    hint?: string | null;
  } | null;
  upsertConflictTarget?: string;
  pairRowsIncludeMarketKey?: boolean;
  samplePairRowKeys?: Array<Record<string, any>>;
};
export function createPairDiagnostics(): MlPairExtractionDiagnostics {
  return {
    searchEventsWithMlPairIds: 0,
    totalMlPairObjectsSeen: 0,
    validMlPairsExtracted: 0,
    invalidMlPairsSkipped: 0,
    skippedPairReasons: {},
    samplePairKeys: [],
    candidatePairRows: 0,
    upsertPairRows: 0,
  };
}
function bumpPair(d: MlPairExtractionDiagnostics | undefined, reason: string) {
  if (!d) return;
  d.invalidMlPairsSkipped++;
  d.skippedPairReasons[reason] = (d.skippedPairReasons[reason] || 0) + 1;
}
function pairPick(p: any, keys: string[]) {
  for (const k of keys) {
    const parts = k.split(".");
    let cur = p;
    for (const part of parts) cur = cur?.[part];
    if (cur != null && cur !== "") return cur;
  }
  return null;
}
function safeNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
export function mlPairs(meta: any, diagnostics?: MlPairExtractionDiagnostics) {
  const raw = [...arr(meta?.ml_pair_ids), ...arr(meta?.pairIds)];
  if (raw.length) diagnostics && diagnostics.searchEventsWithMlPairIds++;
  return raw
    .map((p: any) => {
      diagnostics && diagnostics.totalMlPairObjectsSeen++;
      const restaurant_location_id = text(
        pairPick(p, [
          "restaurant_location_id",
          "restaurantLocationId",
          "restaurant_id",
          "restaurantId",
          "restaurant.id",
          "restaurant.location_id",
          "restaurant.locationId",
          "pair.restaurant_location_id",
          "pair.restaurantLocationId",
        ]),
        80,
      );
      const activity_location_id = text(
        pairPick(p, [
          "activity_location_id",
          "activityLocationId",
          "activity_id",
          "activityId",
          "activity.id",
          "activity.location_id",
          "activity.locationId",
          "pair.activity_location_id",
          "pair.activityLocationId",
        ]),
        80,
      );
      const out = {
        restaurant_location_id,
        activity_location_id,
        restaurant_name: text(
          pairPick(p, ["restaurant_name", "restaurantName", "restaurant.name"]),
          150,
        ),
        activity_name: text(
          pairPick(p, ["activity_name", "activityName", "activity.name"]),
          150,
        ),
        pair_distance_miles: safeNum(
          pairPick(p, [
            "pair_distance_miles",
            "pairDistanceMiles",
            "distance_miles",
            "distanceMiles",
          ]),
        ),
        market: text(
          pairPick(p, ["market", "requestedMarket", "resolvedMarket"]),
          100,
        ),
        rank: safeNum(pairPick(p, ["rank", "ranking_position", "position"])),
      };
      if (!restaurant_location_id || !activity_location_id) {
        bumpPair(diagnostics, "skipped_pair_missing_restaurant_or_activity_id");
        return null;
      }
      if (!isUuid(restaurant_location_id) || !isUuid(activity_location_id)) {
        bumpPair(diagnostics, "skipped_pair_invalid_location_id");
        return null;
      }
      if (diagnostics && diagnostics.samplePairKeys.length < 5)
        diagnostics.samplePairKeys.push(out);
      diagnostics && diagnostics.validMlPairsExtracted++;
      return out;
    })
    .filter(Boolean) as any[];
}
export function marketFromSearch(row: any) {
  const m = row?.metadata || {};
  return text(
    row.parsed_market ||
      m.parsed_market ||
      m.geo?.resolvedMarket ||
      m.geo?.requestedMarket ||
      m.debugParity?.requestedMarket ||
      m.debugParity?.resolvedMarket ||
      row.state ||
      row.city ||
      row.borough,
    100,
  );
}
export function intentsForSearch(row: any) {
  const m = row?.metadata || {};
  const values = Array.isArray(m.all_intents)
    ? m.all_intents
    : Array.isArray(m.allIntents)
      ? m.allIntents
      : null;
  if (values?.length)
    return values.map((x: any) => text(x, 100)).filter(Boolean) as string[];
  return classifySearchIntent(row.raw_query || row.normalized_query || "")
    .allIntents;
}
export function recommendation(d: Diagnostics, updated: number) {
  if (updated > 0) return "ML-ready IDs were found and scored.";
  if (
    d.searchEventsWithOnlyFirstResultNames &&
    !d.searchEventsWithMlResultIds &&
    !d.searchEventsWithMlPairIds
  )
    return "Search events exist, but they only contain firstResultNames and no location IDs. New searches must be logged with metadata.ml_result_ids and metadata.ml_pair_ids before ML can score results.";
  if (
    d.analyticsEventsRead &&
    !d.analyticsEventsWithLocationId &&
    !d.analyticsEventsWithPairIds
  )
    return "Analytics events exist but are missing location_id or pair ID metadata.";
  if (d.outingsRead && !d.outingsWithRestaurantActivityIds)
    return "Outings do not include restaurant/activity location IDs.";
  return "No recent eligible events found in the 30-day window. Run new searches after the tracking update so metadata.ml_result_ids and metadata.ml_pair_ids are populated.";
}
