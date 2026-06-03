import { handleOptions } from "../_shared/cors.ts";
import { badRequest, ok, serverError } from "../_shared/response.ts";
import { createSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { fastParseSearchIntent, parserConfidence } from "../_shared/fastSearchParser.ts";
import { getCachedIntent, saveCachedIntent } from "../_shared/searchIntentCache.ts";
import { haversineMiles, hasCoordinates, walkingMinutesFromMiles } from "../_shared/distance.ts";
import { hasValidPhoto } from "../_shared/photos.ts";
import { logEdgeFunctionRun, safeError, startTimer } from "../_shared/logger.ts";

const THEATER_RE = /theater|theatre|cinema|movie|film|show|performance/i;
const STEAK_RE = /steak|steakhouse|steak house|ribeye|porterhouse|filet|sirloin|tomahawk|prime rib|churrasco|brazilian steakhouse/i;
const BOWLING_RE = /bowling|lanes|bowl/i;

function textFor(item: any) {
  return [item.name, item.restaurant_name, item.activity_name, item.location_type, item.primary_category, item.category, item.cuisine, item.cuisine_type, item.food_type, item.activity_type, item.description, item.search_document, Array.isArray(item.tags) ? item.tags.join(" ") : item.tags, Array.isArray(item.google_types) ? item.google_types.join(" ") : item.google_types].filter(Boolean).join(" ");
}

function performanceStatus(ms: number) {
  if (ms < 1000) return "excellent";
  if (ms < 2000) return "good";
  if (ms < 3500) return "okay";
  if (ms < 5000) return "slow";
  return "critical";
}

async function parseIntent(supabase: any, prompt: string, body: any) {
  const cached = await getCachedIntent(supabase, prompt);
  if (cached.cache_hit) return { intent: cached.intent, parser_source: "cache", cache_hit: true, llm_used: false };
  const intent = fastParseSearchIntent(prompt, body);
  const source = parserConfidence(intent) >= 0.75 ? "fast_parser" : "fallback";
  await saveCachedIntent(supabase, prompt, intent, source);
  return { intent, parser_source: source, cache_hit: false, llm_used: false };
}

async function queryLocations(supabase: any, terms: string[], domain: "restaurant" | "activity", limit: number, geo: any, radiusMiles: number) {
  const started = Date.now();
  let data: any[] = [];
  let rpcError: any = null;

  try {
    const rpc = await supabase.rpc("enterprise_search_locations", {
      p_search_terms: terms,
      p_domain: domain,
      p_neighborhood: geo?.neighborhood ?? null,
      p_borough: geo?.borough ?? null,
      p_city: geo?.city ?? null,
      p_county: geo?.county ?? null,
      p_state: geo?.state ?? null,
      p_limit: Math.max(limit * 4, 40),
    });
    if (!rpc.error && Array.isArray(rpc.data)) data = rpc.data;
    else rpcError = rpc.error;
  } catch (error) {
    rpcError = error;
  }

  if (!data.length) {
    let query = supabase.from("locations").select("*").limit(Math.max(limit * 4, 40));
    if (domain === "restaurant") query = query.or("location_type.ilike.%restaurant%,restaurant_name.not.is.null");
    if (domain === "activity") query = query.or("location_type.ilike.%activity%,activity_name.not.is.null");
    const fallback = await query;
    data = fallback.data ?? [];
  }

  if (geo?.latitude && geo?.longitude && radiusMiles) {
    data = data.filter((item) => {
      if (!hasCoordinates(item)) return true;
      return haversineMiles(Number(geo.latitude), Number(geo.longitude), Number(item.latitude), Number(item.longitude)) <= radiusMiles;
    });
  }

  return { data, ms: Date.now() - started, rpcError };
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  const elapsed = startTimer();
  const functionName = "create-search";
  let supabase: any = null;

  try {
    const body = await req.json().catch(() => ({}));
    const prompt = String(body.prompt ?? body.query ?? "").trim();
    if (!prompt) return badRequest("Missing prompt");
    const limit = Math.min(Math.max(Number(body.limit ?? 12), 1), 30);
    const debug = body.debug === true;
    const includeMissingPhotos = body.includeMissingPhotos === true;

    supabase = createSupabaseAdminClient();
    const parsed = await parseIntent(supabase, prompt, body);
    const intent = parsed.intent;
    const geo = intent.geo ?? null;
    const restaurantTerms = [...(intent.restaurantIntent?.foodTerms ?? []), ...(intent.restaurantIntent?.mealTerms ?? [])].filter(Boolean);
    const activityTerms = [...(intent.activityIntent?.activityTerms ?? []), ...(intent.activityIntent?.categoryTerms ?? [])].filter(Boolean);
    const restaurantRadius = geo?.radiusMiles ?? 5;
    let activityRadius = geo?.radiusMiles ?? 5;
    const activityInitialRadiusMiles = activityRadius;
    if (activityTerms.some((t: string) => /bowling/i.test(t))) activityRadius = Math.max(activityRadius, 8);

    const rpcStart = Date.now();
    const [restaurantResult, activityResult] = await Promise.all([
      intent.needsRestaurant ? queryLocations(supabase, restaurantTerms, "restaurant", limit, geo, restaurantRadius) : Promise.resolve({ data: [], ms: 0, rpcError: null }),
      intent.needsActivity ? queryLocations(supabase, activityTerms, "activity", limit, geo, activityRadius) : Promise.resolve({ data: [], ms: 0, rpcError: null }),
    ]);
    const rpcParallelMs = Date.now() - rpcStart;

    const photoStart = Date.now();
    let photoRejectedCount = 0;
    const photoFilter = (item: any) => includeMissingPhotos || hasValidPhoto(item) || (photoRejectedCount++, false);

    let restaurants = restaurantResult.data
      .filter((item: any) => !THEATER_RE.test(textFor(item)))
      .filter((item: any) => restaurantTerms.some((t: string) => /steak/i.test(t)) ? STEAK_RE.test(textFor(item)) : true)
      .filter(photoFilter)
      .slice(0, limit);

    let activities = activityResult.data
      .filter((item: any) => activityTerms.some((t: string) => /bowling/i.test(t)) ? BOWLING_RE.test(textFor(item)) : !THEATER_RE.test(textFor(item)))
      .filter(photoFilter)
      .slice(0, limit);
    const photoFilterMs = Date.now() - photoStart;

    const pairingStart = Date.now();
    const requireWalkable = intent.pairingPreference?.requireWalkablePair === true;
    const maxPairDistanceMiles = intent.pairingPreference?.maxPairDistanceMiles ?? null;
    const pairs: any[] = [];
    for (const restaurant of restaurants) {
      for (const activity of activities) {
        let distanceMiles: number | null = null;
        if (hasCoordinates(restaurant) && hasCoordinates(activity)) {
          distanceMiles = haversineMiles(Number(restaurant.latitude), Number(restaurant.longitude), Number(activity.latitude), Number(activity.longitude));
        }
        if (requireWalkable && (distanceMiles === null || distanceMiles > maxPairDistanceMiles)) continue;
        pairs.push({ restaurant, activity, distanceMiles, walkingMinutes: distanceMiles === null ? null : walkingMinutesFromMiles(distanceMiles) });
      }
    }
    pairs.sort((a, b) => (a.distanceMiles ?? 999) - (b.distanceMiles ?? 999));
    const finalPairs = pairs.slice(0, limit);
    const pairingMs = Date.now() - pairingStart;
    const totalMs = elapsed();

    const performance = {
      total_ms: totalMs,
      restaurant_rpc_ms: restaurantResult.ms,
      activity_rpc_ms: activityResult.ms,
      rpc_parallel_ms: rpcParallelMs,
      photo_filter_ms: photoFilterMs,
      pairing_ms: pairingMs,
      speed_status: performanceStatus(totalMs),
      result_count: restaurants.length + activities.length + finalPairs.length,
      restaurant_count: restaurants.length,
      activity_count: activities.length,
      pair_count: finalPairs.length,
      source: "edge_function",
    };

    const response = {
      success: true,
      search_system: "edge-enterprise-search-v1",
      rawQuery: prompt,
      normalizedIntent: intent,
      restaurants,
      activities,
      pairs: finalPairs,
      renderMode: intent.searchType === "mixed_outing" ? "mixed_pairs" : intent.needsRestaurant ? "restaurants" : "activities",
      performance,
      debug: debug ? {
        ...parsed,
        restaurantTerms,
        activityTerms,
        photoFilterApplied: !includeMissingPhotos,
        photoRejectedCount,
        activityGeoExpanded: activityRadius !== activityInitialRadiusMiles,
        activityInitialRadiusMiles,
        activityFinalRadiusMiles: activityRadius,
        pairCandidatesFound: pairs.length,
        pairCandidatesEvaluated: restaurants.length * activities.length,
        pairsWithinRequestedDistance: requireWalkable ? finalPairs.length : null,
        walkablePairsFound: requireWalkable ? finalPairs.length : undefined,
      } : undefined,
    };

    await logEdgeFunctionRun(supabase, { function_name: functionName, status: "success", duration_ms: totalMs, input_summary: { prompt }, output_summary: performance });
    return ok(response);
  } catch (error) {
    if (supabase) await logEdgeFunctionRun(supabase, { function_name: functionName, status: "error", duration_ms: elapsed(), error_message: safeError(error).message });
    return serverError("create-search failed", safeError(error));
  }
});
