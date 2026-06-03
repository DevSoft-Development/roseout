import { handleOptions } from "../_shared/cors.ts";
<<<<<<< HEAD
import { badRequest, ok, serverError } from "../_shared/response.ts";
import { createSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { fastParseSearchIntent, parserConfidence } from "../_shared/fastSearchParser.ts";
=======
import { badRequest, ok, serverError, unauthorized } from "../_shared/response.ts";
import { createSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { getUserFromRequest } from "../_shared/auth.ts";
import { fastParseSearchIntent, normalizeIntent, parserConfidence } from "../_shared/fastSearchParser.ts";
>>>>>>> 62b07568ac9db33da882568ffc4086080fee38c3
import { getCachedIntent, saveCachedIntent } from "../_shared/searchIntentCache.ts";
import { haversineMiles, hasCoordinates, walkingMinutesFromMiles } from "../_shared/distance.ts";
import { hasValidPhoto } from "../_shared/photos.ts";
import { logEdgeFunctionRun, safeError, startTimer } from "../_shared/logger.ts";

<<<<<<< HEAD
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
=======
const STEAK_TERMS = ["steak", "steakhouse", "steak house", "ribeye", "porterhouse", "filet", "filet mignon", "sirloin", "tomahawk", "prime rib", "churrasco", "brazilian steakhouse"];
const BAD_ACTIVITY = ["theater", "cinema", "movie", "show", "performance"];
const SEARCH_FIELDS = ["name", "restaurant_name", "activity_name", "cuisine", "cuisine_type", "food_type", "primary_category", "category", "tags", "description", "search_document", "google_types", "activity_type", "location_type"];
function textOf(item: Record<string, unknown>) { return SEARCH_FIELDS.map((field) => Array.isArray(item[field]) ? (item[field] as unknown[]).join(" ") : item[field]).filter(Boolean).join(" ").toLowerCase(); }
function hasAny(item: Record<string, unknown>, terms: string[]) { const hay = textOf(item); return terms.some((term) => hay.includes(term.toLowerCase())); }
function score(item: Record<string, unknown>, terms: string[]) { const hay = textOf(item); return terms.reduce((sum, term) => sum + (hay.includes(term) ? 10 : 0), 0) + Number(item.rating ?? 0); }
function terms(intent: Record<string, any>, domain: "restaurant" | "activity") { return domain === "restaurant" ? Array.from(new Set([...(intent.restaurantIntent?.foodTerms ?? []), ...(intent.restaurantIntent?.cuisineTerms ?? []), ...(intent.restaurantIntent?.mealTerms ?? [])])) : Array.from(new Set([...(intent.activityIntent?.activityTerms ?? []), ...(intent.activityIntent?.categoryTerms ?? [])])); }
function speedStatus(ms: number) { return ms < 1000 ? "excellent" : ms < 2000 ? "good" : ms < 3500 ? "okay" : ms < 5000 ? "slow" : "critical"; }

async function parseIntent(supabase: any, rawQuery: string, body: any, perf: Record<string, number>) {
  const cached = await getCachedIntent(supabase, rawQuery);
  if (cached.cache_hit) return { intent: cached.intent as Record<string, unknown>, parser_source: "cache", cache_hit: true, llm_used: false };
  const started = Date.now();
  const fast = fastParseSearchIntent(rawQuery, { area: body.area });
  perf.llm_ms = 0;
  const force = body.force_llm === true || body.debug?.force_llm === true;
  if (!force && parserConfidence(fast) >= 0.75 && fast.searchType !== "unknown") {
    await saveCachedIntent(supabase, rawQuery, fast, "fast_parser");
    return { intent: fast, parser_source: "fast_parser", cache_hit: false, llm_used: false };
  }
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return { intent: normalizeIntent({ ...fast, parser_source: "fallback" }), parser_source: "fallback", cache_hit: false, llm_used: false };
  try {
    const model = Deno.env.get("SEARCH_LLM_MODEL") || "gpt-4o-mini";
    const res = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, response_format: { type: "json_object" }, temperature: 0.1, messages: [{ role: "system", content: "Return compact JSON TheOutHaven search intent." }, { role: "user", content: JSON.stringify({ rawQuery, fast }) }] }) });
    perf.llm_ms = Date.now() - started;
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    const intent = normalizeIntent({ ...fast, ...JSON.parse(data.choices?.[0]?.message?.content || "{}"), parser_source: "llm", confidence: 0.86 });
    await saveCachedIntent(supabase, rawQuery, intent, "llm", model);
    return { intent, parser_source: "llm", cache_hit: false, llm_used: true };
  } catch (error) {
    perf.llm_ms = Date.now() - started;
    return { intent: normalizeIntent({ ...fast, parser_source: "fallback", llm_error: safeError(error) }), parser_source: "fallback", cache_hit: false, llm_used: false };
  }
}

async function rpcSearch(supabase: any, domain: string, searchTerms: string[], intent: any, limit: number, radius: number) {
  const geo = intent.geo ?? {};
  const params = { search_terms: searchTerms, location_domain: domain, area: geo.raw ?? geo.neighborhood ?? geo.city ?? null, city_filter: geo.city ?? null, borough_filter: geo.borough ?? null, category_filter: null, cuisine_filter: null, activity_filter: null, lat: geo.latitude ?? null, lng: geo.longitude ?? null, radius_miles: radius, result_limit: limit * 4, require_photos: false };
  const { data, error } = await supabase.rpc("enterprise_search_locations", params);
  if (!error && Array.isArray(data)) return data;
  const query = supabase.from("locations").select("*").limit(limit * 8);
  return (await query).data ?? [];
}

function domainFilter(rows: Record<string, unknown>[], intent: any, domain: "restaurant" | "activity") {
  const searchTerms = terms(intent, domain);
  const hardTerms = domain === "restaurant" && searchTerms.some((term) => STEAK_TERMS.includes(String(term).toLowerCase())) ? STEAK_TERMS : domain === "activity" && searchTerms.some((term) => String(term).includes("bowling")) ? ["bowling", "bowling alley", "bowling lounge", "bowling lanes", "lanes"] : searchTerms;
  return rows.filter((row) => {
    const hay = textOf(row);
    if (domain === "activity" && BAD_ACTIVITY.some((term) => hay.includes(term)) && !searchTerms.some((term) => BAD_ACTIVITY.includes(String(term)))) return false;
    return hardTerms.length ? hasAny(row, hardTerms) : true;
  }).sort((a,b)=>score(b, hardTerms)-score(a, hardTerms));
}

function pair(restaurants: Record<string, unknown>[], activities: Record<string, unknown>[], intent: any, debug: Record<string, number>) {
  const requireWalk = Boolean(intent.pairingPreference?.requireWalkablePair);
  const maxMiles = Number(intent.pairingPreference?.maxPairDistanceMiles ?? 1);
  const pairs: Record<string, unknown>[] = [];
  for (const restaurant of restaurants) for (const activity of activities) {
    debug.pairCandidatesEvaluated++;
    if (!hasCoordinates(restaurant) || !hasCoordinates(activity)) {
      debug.pairsRejectedForMissingCoordinates++;
      if (requireWalk) continue;
      pairs.push({ restaurant, activity, pairDistanceMiles: null, pairWalkingMinutes: null });
      continue;
    }
    const miles = haversineMiles(Number(restaurant.latitude), Number(restaurant.longitude), Number(activity.latitude), Number(activity.longitude));
    if (requireWalk && miles > maxMiles) { debug.pairsRejectedForDistance++; continue; }
    if (requireWalk) debug.walkablePairsFound++;
    pairs.push({ restaurant, activity, pairDistanceMiles: Number(miles.toFixed(2)), pairWalkingMinutes: walkingMinutesFromMiles(miles), pair_walking_label: `${walkingMinutesFromMiles(miles)} min walk` });
  }
  return pairs.sort((a:any,b:any)=>(a.pairDistanceMiles ?? 99) - (b.pairDistanceMiles ?? 99));
}

Deno.serve(async (req) => {
  const options = handleOptions(req); if (options) return options;
  const totalTimer = startTimer();
  let supabase;
  try {
    supabase = createSupabaseAdminClient();
    const user = await getUserFromRequest(req, supabase);
    if (!user) return unauthorized("Valid JWT required for create-search");
    const body = await req.json().catch(() => ({}));
    const rawQuery = String(body.prompt ?? body.query ?? body.message ?? "").trim();
    if (!rawQuery) return badRequest("prompt is required");
    const limit = Math.min(Math.max(Number(body.limit ?? 12), 1), 50);
    const perf: Record<string, number> = {};
    const parsed = await parseIntent(supabase, rawQuery, body, perf);
    const intent: any = parsed.intent;
    const restaurantTerms = terms(intent, "restaurant");
    const activityTerms = terms(intent, "activity");
    const initialRadius = Number(intent.geo?.radiusMiles ?? 3);
    let activityRadius = initialRadius;
    const parallelStarted = Date.now();
    const restaurantStarted = Date.now();
    const restaurantPromise = rpcSearch(supabase, "restaurant", restaurantTerms, intent, limit, initialRadius).finally(()=>{ perf.restaurant_rpc_ms = Date.now() - restaurantStarted; });
    const activityStarted = Date.now();
    let activityRows = await rpcSearch(supabase, "activity", activityTerms, intent, limit, activityRadius).finally(()=>{ perf.activity_rpc_ms = Date.now() - activityStarted; });
    const restaurantRows = await restaurantPromise;
    perf.rpc_parallel_ms = Date.now() - parallelStarted;
    let filteredActivities = domainFilter(activityRows, intent, "activity");
    const activityGeoExpanded = activityTerms.some((t)=>String(t).includes("bowling")) && filteredActivities.length < 5;
    if (activityGeoExpanded) {
      activityRadius = Math.max(5, Math.min(8, initialRadius + 3));
      const expandStarted = Date.now();
      activityRows = await rpcSearch(supabase, "activity", activityTerms, intent, limit, activityRadius);
      perf.activity_rpc_ms += Date.now() - expandStarted;
      filteredActivities = domainFilter(activityRows, intent, "activity");
    }
    const rankingStarted = Date.now();
    let restaurants = domainFilter(restaurantRows, intent, "restaurant");
    let activities = filteredActivities;
    perf.ranking_ms = Date.now() - rankingStarted;
    const photoStarted = Date.now();
    if (!body.includeMissingPhotos && !body.debug) { restaurants = restaurants.filter(hasValidPhoto); activities = activities.filter(hasValidPhoto); }
    perf.photo_filter_ms = Date.now() - photoStarted;
    const pairDebug = { pairCandidatesEvaluated: 0, pairsRejectedForDistance: 0, pairsRejectedForMissingCoordinates: 0, walkablePairsFound: 0 };
    const pairingStarted = Date.now();
    const pairs = intent.wantsPairing ? pair(restaurants.slice(0, limit), activities.slice(0, limit), intent, pairDebug).slice(0, limit) : [];
    perf.pairing_ms = Date.now() - pairingStarted;
    perf.total_ms = totalTimer();
    const performance = { ...perf, speed_status: speedStatus(perf.total_ms) };
    const debug = { parser_source: parsed.parser_source, cache_hit: parsed.cache_hit, llm_used: parsed.llm_used, ...performance, restaurantTerms, activityTerms, activityGeoExpanded, activityInitialRadiusMiles: initialRadius, activityFinalRadiusMiles: activityRadius, activityExpansionReason: activityGeoExpanded ? "fewer than 5 strong activity matches" : null, pairCandidatesFound: restaurants.length * activities.length, pairsWithinRequestedDistance: pairs.length, ...pairDebug, performance };
    await logEdgeFunctionRun(supabase, { function_name: "create-search", status: "success", user_id: user.id, input_summary: { rawQuery }, output_summary: { restaurants: restaurants.length, activities: activities.length, pairs: pairs.length }, duration_ms: perf.total_ms, metadata: debug });
    return ok({ success: true, search_system: "edge-enterprise-search-v1", rawQuery, normalizedIntent: intent, restaurants: restaurants.slice(0, limit), activities: activities.slice(0, limit), pairs, renderMode: pairs.length ? "mixed_pairs" : restaurants.length && activities.length ? "partial_mixed" : restaurants.length ? "restaurant_cards" : activities.length ? "activity_cards" : "empty", performance, debug });
  } catch (error) {
    if (supabase) await logEdgeFunctionRun(supabase, { function_name: "create-search", status: "error", error_message: safeError(error), duration_ms: totalTimer() });
>>>>>>> 62b07568ac9db33da882568ffc4086080fee38c3
    return serverError("create-search failed", safeError(error));
  }
});
