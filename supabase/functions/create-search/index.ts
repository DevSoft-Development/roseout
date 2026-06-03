import { handleOptions } from "../_shared/cors.ts";
import { badRequest, ok, serverError, unauthorized } from "../_shared/response.ts";
import { createSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { getUserFromRequest } from "../_shared/auth.ts";
import { fastParseSearchIntent, normalizeIntent, parserConfidence } from "../_shared/fastSearchParser.ts";
import { getCachedIntent, saveCachedIntent } from "../_shared/searchIntentCache.ts";
import { haversineMiles, hasCoordinates, walkingMinutesFromMiles } from "../_shared/distance.ts";
import { hasValidPhoto } from "../_shared/photos.ts";
import { logEdgeFunctionRun, safeError, startTimer } from "../_shared/logger.ts";

const STEAK_TERMS = ["steak", "steakhouse", "steak house", "ribeye", "porterhouse", "filet", "filet mignon", "sirloin", "tomahawk", "prime rib", "churrasco", "brazilian steakhouse"];
const THEATER_TERMS = ["theater", "theatre", "cinema", "movie theater", "movie theatre", "movie_theater", "movies", "showtimes", "box office", "performing arts", "performing_arts", "performance", "playhouse", "concert hall", "opera house"];
const BAD_ACTIVITY = ["theater", "theatre", "cinema", "movie", "movies", "show", "performance", "performing arts"];
const NIGHTLIFE_TERMS = ["cocktail", "cocktails", "drink", "drinks", "bar", "lounge", "rooftop", "rooftop bar", "wine bar", "speakeasy", "nightlife", "hookah"];
const SEARCH_FIELDS = ["name", "restaurant_name", "activity_name", "cuisine", "cuisine_type", "food_type", "primary_category", "category", "tags", "description", "search_document", "semantic_search_text", "google_types", "activity_type", "location_type"];

function normalizeText(value: unknown) { return String(value ?? "").toLowerCase().replace(/[_-]+/g, " "); }
function textOf(item: Record<string, unknown>) { return SEARCH_FIELDS.map((field) => Array.isArray(item[field]) ? (item[field] as unknown[]).join(" ") : item[field]).filter(Boolean).join(" ").toLowerCase().replace(/[_-]+/g, " "); }
function hasAny(item: Record<string, unknown>, terms: string[]) { const hay = textOf(item); return terms.some((term) => hay.includes(normalizeText(term))); }
function terms(intent: Record<string, any>, domain: "restaurant" | "activity") { return domain === "restaurant" ? Array.from(new Set([...(intent.restaurantIntent?.foodTerms ?? []), ...(intent.restaurantIntent?.cuisineTerms ?? []), ...(intent.restaurantIntent?.mealTerms ?? [])])) : Array.from(new Set([...(intent.activityIntent?.activityTerms ?? []), ...(intent.activityIntent?.categoryTerms ?? [])])); }
function speedStatus(ms: number) { return ms < 1000 ? "excellent" : ms < 2000 ? "good" : ms < 3500 ? "okay" : ms < 5000 ? "slow" : "critical"; }

function isTheaterLike(row: Record<string, unknown>) {
  const hay = textOf(row);
  return THEATER_TERMS.some((term) => hay.includes(normalizeText(term)));
}

function hasRestaurantSignal(row: Record<string, unknown>) {
  const hay = textOf(row);
  return Boolean(
    row.restaurant_name ||
    row.cuisine ||
    row.cuisine_type ||
    row.food_type ||
    hay.includes("restaurant") ||
    hay.includes("steakhouse") ||
    hay.includes("dining") ||
    hay.includes("cafe") ||
    hay.includes("bakery") ||
    hay.includes("bistro") ||
    hay.includes("bar and grill") ||
    hay.includes("gastropub")
  );
}

function explicitlyRequestedTheater(intent: Record<string, any>) {
  const raw = normalizeText(intent.rawQuery ?? "");
  const activityTerms = terms(intent, "activity").join(" ").toLowerCase().replace(/[_-]+/g, " ");
  return BAD_ACTIVITY.some((term) => raw.includes(term) || activityTerms.includes(term));
}

function requestedNightlife(intent: Record<string, any>) {
  const hay = [...terms(intent, "activity"), String(intent.rawQuery ?? "")]
    .join(" ")
    .toLowerCase()
    .replace(/[_-]+/g, " ");
  return NIGHTLIFE_TERMS.some((term) => hay.includes(normalizeText(term)));
}

function isNightlifeLike(row: Record<string, unknown>) {
  const hay = textOf(row);
  return NIGHTLIFE_TERMS.some((term) => hay.includes(normalizeText(term)));
}

function score(item: Record<string, unknown>, searchTerms: string[], intent: Record<string, any>, domain: "restaurant" | "activity") {
  const hay = textOf(item);
  const termScore = searchTerms.reduce((sum, term) => sum + (hay.includes(normalizeText(term)) ? 10 : 0), 0);
  const nightlifeBoost = domain === "activity" && requestedNightlife(intent) && isNightlifeLike(item) ? 25 : 0;
  return termScore + nightlifeBoost + Number(item.rating ?? 0);
}

async function parseIntent(supabase: any, rawQuery: string, body: any, perf: Record<string, number>) {
  const cached = await getCachedIntent(supabase, rawQuery);
  if (cached.cache_hit) return { intent: { ...(cached.intent as Record<string, unknown>), rawQuery }, parser_source: "cache", cache_hit: true, llm_used: false };
  const started = Date.now();
  const fast = { ...fastParseSearchIntent(rawQuery, { area: body.area }), rawQuery };
  perf.llm_ms = 0;
  const force = body.force_llm === true || body.debug?.force_llm === true;
  if (!force && parserConfidence(fast) >= 0.75 && fast.searchType !== "unknown") {
    await saveCachedIntent(supabase, rawQuery, fast, "fast_parser");
    return { intent: fast, parser_source: "fast_parser", cache_hit: false, llm_used: false };
  }
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return { intent: normalizeIntent({ ...fast, rawQuery, parser_source: "fallback" }), parser_source: "fallback", cache_hit: false, llm_used: false };
  try {
    const model = Deno.env.get("SEARCH_LLM_MODEL") || "gpt-4o-mini";
    const res = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, response_format: { type: "json_object" }, temperature: 0.1, messages: [{ role: "system", content: "Return compact JSON TheOutHaven search intent." }, { role: "user", content: JSON.stringify({ rawQuery, fast }) }] }) });
    perf.llm_ms = Date.now() - started;
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    const intent = normalizeIntent({ ...fast, ...JSON.parse(data.choices?.[0]?.message?.content || "{}"), rawQuery, parser_source: "llm", confidence: 0.86 });
    await saveCachedIntent(supabase, rawQuery, intent, "llm", model);
    return { intent, parser_source: "llm", cache_hit: false, llm_used: true };
  } catch (error) {
    perf.llm_ms = Date.now() - started;
    return { intent: normalizeIntent({ ...fast, rawQuery, parser_source: "fallback", llm_error: safeError(error) }), parser_source: "fallback", cache_hit: false, llm_used: false };
  }
}

async function rpcSearch(supabase: any, domain: string, searchTerms: string[], intent: any, limit: number, radius: number) {
  const geo = intent.geo ?? {};
  const params = {
    p_search_terms: searchTerms,
    p_domain: domain,
    p_neighborhood: geo.neighborhood ?? null,
    p_borough: geo.borough ?? null,
    p_city: geo.city ?? null,
    p_county: geo.county ?? null,
    p_region: geo.raw ?? null,
    p_state: geo.state ?? null,
    p_latitude: geo.latitude ?? null,
    p_longitude: geo.longitude ?? null,
    p_radius_miles: radius,
    p_limit: limit * 4,
    p_allow_low_level: false,
  };
  const { data, error } = await supabase.rpc("enterprise_search_locations", params);
  if (!error && Array.isArray(data)) return data;

  const fallbackLimit = Math.min(Math.max(limit * 4, 1), 200);
  const { data: fallbackData } = await supabase
    .from("locations")
    .select("*")
    .eq("is_searchable", true)
    .eq("has_photos", true)
    .not("photo_status", "eq", "missing_photo")
    .not("is_hidden", "is", true)
    .limit(fallbackLimit);
  return fallbackData ?? [];
}

function domainFilter(rows: Record<string, unknown>[], intent: any, domain: "restaurant" | "activity") {
  const searchTerms = terms(intent, domain);
  const hardTerms = domain === "restaurant" && searchTerms.some((term) => STEAK_TERMS.includes(String(term).toLowerCase())) ? STEAK_TERMS : domain === "activity" && searchTerms.some((term) => String(term).includes("bowling")) ? ["bowling", "bowling alley", "bowling lounge", "bowling lanes", "lanes"] : searchTerms;
  const allowTheater = explicitlyRequestedTheater(intent);
  const wantsNightlife = requestedNightlife(intent);
  return rows.filter((row) => {
    if (!hasValidPhoto(row)) return false;
    const theaterLike = isTheaterLike(row);
    if (domain === "restaurant") {
      if (theaterLike) return false;
      if (!hasRestaurantSignal(row)) return false;
    }
    if (domain === "activity" && theaterLike && (!allowTheater || wantsNightlife)) return false;
    if (domain === "activity" && wantsNightlife && theaterLike) return false;
    return hardTerms.length ? hasAny(row, hardTerms) : true;
  }).sort((a,b)=>score(b, hardTerms, intent, domain)-score(a, hardTerms, intent, domain));
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
    restaurants = restaurants.filter(hasValidPhoto);
    activities = activities.filter(hasValidPhoto);
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
    return serverError("create-search failed", safeError(error));
  }
});
