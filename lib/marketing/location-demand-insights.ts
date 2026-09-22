import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

type DemandLocation = {
  id: string;
  city?: string | null;
  state?: string | null;
  borough?: string | null;
  neighborhood?: string | null;
  zip_code?: string | null;
  postal_code?: string | null;
  county?: string | null;
  market?: string | null;
};

type SearchRow = {
  raw_query: string | null;
  normalized_query: string | null;
  primary_domain: string | null;
  city: string | null;
  borough: string | null;
  neighborhood: string | null;
  zip_code: string | null;
  county: string | null;
  resolved_market: string | null;
  result_count: number | null;
  wants_pairing: boolean | null;
  needs_restaurant: boolean | null;
  needs_activity: boolean | null;
  no_results_reason: string | null;
  created_at: string;
};

export type DemandOpportunity = {
  query: string;
  searches30d: number;
  searches7d: number;
  prior7d: number;
  trendPercent: number | null;
  noResultSearches: number;
  pairedIntentShare: number;
  restaurantIntentShare: number;
  activityIntentShare: number;
};

export type LocationDemandInsights = {
  generatedAt: string;
  geographyLabel: string;
  searches30d: number;
  searches7d: number;
  prior7d: number;
  trendPercent: number | null;
  demandOpportunities: DemandOpportunity[];
  demandGaps: DemandOpportunity[];
  locationPerformance: {
    impressions7d: number;
    impressions30d: number;
    clicks7d: number;
    clicks30d: number;
    ctr30d: number;
    reservationClicks30d: number;
    websiteClicks30d: number;
    callClicks30d: number;
    saves30d: number;
    completedOutings30d: number;
    conversionRate30d: number;
    mlScore: number;
  } | null;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function lower(value: unknown) {
  return clean(value).toLowerCase();
}

function queryText(row: SearchRow) {
  return clean(row.normalized_query || row.raw_query);
}

function trend(current: number, prior: number) {
  if (prior <= 0) return current > 0 ? 100 : null;
  return Math.round(((current - prior) / prior) * 100);
}

function percent(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

function geographyLabel(location: DemandLocation) {
  const zip = clean(location.zip_code || location.postal_code);
  if (zip) return zip;
  return clean(location.neighborhood || location.borough || location.city || location.market || "your area");
}

function rowMatchesLocation(row: SearchRow, location: DemandLocation) {
  const zip = lower(location.zip_code || location.postal_code);
  const neighborhood = lower(location.neighborhood);
  const borough = lower(location.borough);
  const city = lower(location.city);
  const county = lower(location.county);
  const market = lower(location.market);

  if (zip && lower(row.zip_code) === zip) return true;
  if (neighborhood && lower(row.neighborhood) === neighborhood) return true;
  if (borough && lower(row.borough) === borough) return true;
  if (county && lower(row.county) === county) return true;
  if (city && lower(row.city) === city) return true;
  if (market && lower(row.resolved_market) === market) return true;
  return false;
}

function aggregate(rows: SearchRow[], nowMs: number) {
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const current7Start = nowMs - sevenDaysMs;
  const prior7Start = nowMs - sevenDaysMs * 2;
  const buckets = new Map<string, {
    label: string;
    total: number;
    current7: number;
    prior7: number;
    noResults: number;
    pairing: number;
    restaurant: number;
    activity: number;
  }>();

  for (const row of rows) {
    const query = queryText(row);
    if (!query) continue;
    const key = query.toLowerCase();
    const bucket = buckets.get(key) || {
      label: query,
      total: 0,
      current7: 0,
      prior7: 0,
      noResults: 0,
      pairing: 0,
      restaurant: 0,
      activity: 0,
    };
    bucket.total += 1;
    const createdAt = new Date(row.created_at).getTime();
    if (createdAt >= current7Start) bucket.current7 += 1;
    else if (createdAt >= prior7Start) bucket.prior7 += 1;
    if (Number(row.result_count || 0) === 0 || Boolean(row.no_results_reason)) bucket.noResults += 1;
    if (row.wants_pairing) bucket.pairing += 1;
    if (row.needs_restaurant) bucket.restaurant += 1;
    if (row.needs_activity) bucket.activity += 1;
    buckets.set(key, bucket);
  }

  return [...buckets.values()].map((bucket): DemandOpportunity => ({
    query: bucket.label,
    searches30d: bucket.total,
    searches7d: bucket.current7,
    prior7d: bucket.prior7,
    trendPercent: trend(bucket.current7, bucket.prior7),
    noResultSearches: bucket.noResults,
    pairedIntentShare: percent(bucket.pairing, bucket.total),
    restaurantIntentShare: percent(bucket.restaurant, bucket.total),
    activityIntentShare: percent(bucket.activity, bucket.total),
  }));
}

export async function getLocationSearchV2DemandInsights(location: DemandLocation): Promise<LocationDemandInsights> {
  const now = new Date();
  const cutoff30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: searchRows, error: searchError }, { data: mlRow, error: mlError }] = await Promise.all([
    supabaseAdmin
      .from("search_events")
      .select("raw_query,normalized_query,primary_domain,city,borough,neighborhood,zip_code,county,resolved_market,result_count,wants_pairing,needs_restaurant,needs_activity,no_results_reason,created_at")
      .eq("search_core_version", "v2")
      .gte("created_at", cutoff30)
      .order("created_at", { ascending: false })
      .limit(5000),
    supabaseAdmin
      .from("location_ml_features")
      .select("impressions_7d,impressions_30d,clicks_7d,clicks_30d,ctr_30d,reservation_clicks_30d,website_clicks_30d,call_clicks_30d,saves_30d,completed_outings_30d,conversion_rate_30d,ml_score")
      .eq("location_id", location.id)
      .maybeSingle(),
  ]);

  if (searchError) throw searchError;
  if (mlError) throw mlError;

  const relevantRows = ((searchRows || []) as SearchRow[]).filter((row) => rowMatchesLocation(row, location));
  const nowMs = now.getTime();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const searches7d = relevantRows.filter((row) => new Date(row.created_at).getTime() >= nowMs - sevenDaysMs).length;
  const prior7d = relevantRows.filter((row) => {
    const time = new Date(row.created_at).getTime();
    return time >= nowMs - sevenDaysMs * 2 && time < nowMs - sevenDaysMs;
  }).length;

  const opportunities = aggregate(relevantRows, nowMs);
  const demandOpportunities = [...opportunities]
    .sort((a, b) => {
      const aScore = a.searches30d * 3 + a.searches7d * 2 + Math.max(0, a.trendPercent || 0) / 10;
      const bScore = b.searches30d * 3 + b.searches7d * 2 + Math.max(0, b.trendPercent || 0) / 10;
      return bScore - aScore;
    })
    .slice(0, 8);
  const demandGaps = [...opportunities]
    .filter((row) => row.noResultSearches > 0)
    .sort((a, b) => b.noResultSearches - a.noResultSearches || b.searches30d - a.searches30d)
    .slice(0, 5);

  return {
    generatedAt: now.toISOString(),
    geographyLabel: geographyLabel(location),
    searches30d: relevantRows.length,
    searches7d,
    prior7d,
    trendPercent: trend(searches7d, prior7d),
    demandOpportunities,
    demandGaps,
    locationPerformance: mlRow ? {
      impressions7d: Number(mlRow.impressions_7d || 0),
      impressions30d: Number(mlRow.impressions_30d || 0),
      clicks7d: Number(mlRow.clicks_7d || 0),
      clicks30d: Number(mlRow.clicks_30d || 0),
      ctr30d: Number(mlRow.ctr_30d || 0),
      reservationClicks30d: Number(mlRow.reservation_clicks_30d || 0),
      websiteClicks30d: Number(mlRow.website_clicks_30d || 0),
      callClicks30d: Number(mlRow.call_clicks_30d || 0),
      saves30d: Number(mlRow.saves_30d || 0),
      completedOutings30d: Number(mlRow.completed_outings_30d || 0),
      conversionRate30d: Number(mlRow.conversion_rate_30d || 0),
      mlScore: Number(mlRow.ml_score || 0),
    } : null,
  };
}
