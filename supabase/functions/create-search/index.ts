import { handleOptions } from "../_shared/cors.ts";
import { badRequest, ok, serverError, unauthorized } from "../_shared/response.ts";
import { createSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { getUserFromRequest } from "../_shared/auth.ts";
import { fastParseSearchIntent, normalizeIntent, parserConfidence } from "../_shared/fastSearchParser.ts";
import { getCachedIntent, saveCachedIntent } from "../_shared/searchIntentCache.ts";
import { haversineMiles, hasCoordinates, walkingMinutesFromMiles } from "../_shared/distance.ts";
import { hasValidPhoto } from "../_shared/photos.ts";
import { logEdgeFunctionRun, safeError, startTimer } from "../_shared/logger.ts";

const SEARCH_INTENT_FAST_MODEL = Deno.env.get("SEARCH_INTENT_FAST_MODEL") || "gpt-4o-mini";
const SEARCH_INTENT_FALLBACK_MODEL = Deno.env.get("SEARCH_INTENT_FALLBACK_MODEL") || "gpt-4o";
const SEARCH_INTENT_CACHE_VERSION = Deno.env.get("SEARCH_INTENT_CACHE_VERSION") || "intent-v4-fast-model";
const STEAK_TERMS = ["steak", "steakhouse", "steak house", "ribeye", "porterhouse", "filet", "filet mignon", "sirloin", "tomahawk", "prime rib", "churrasco", "brazilian steakhouse"];
const THEATER_TERMS = ["theater", "theatre", "cinema", "movie theater", "movie theatre", "movie_theater", "movies", "showtimes", "box office", "performing arts", "performing_arts", "performance", "playhouse", "concert hall", "opera house"];
const THEATER_INTENT_TERMS = [...THEATER_TERMS, "movie", "show"];
const NIGHTLIFE_TERMS = ["cocktail", "cocktails", "drink", "drinks", "lounge", "rooftop bar", "wine bar", "speakeasy", "nightlife", "hookah", "bar"];
const GENERIC_RESTAURANT_TERMS = new Set(["dinner", "restaurant", "restaurants", "dining", "lunch", "brunch", "breakfast", "meal", "food", "eat", "eats"]);
const HOOKAH_TERMS = ["hookah", "hookah lounge", "hookah bar", "shisha"];
const BROAD_NIGHTLIFE_TERMS = new Set(["lounge", "drinks", "drink", "cocktails", "cocktail", "cocktail bar", "wine bar", "nightlife", "bar", "rooftop bar", "rooftop lounge", "club", "dance club", "dancing", "live dj", "speakeasy"]);
const SEARCH_FIELDS = ["name", "restaurant_name", "activity_name", "cuisine", "cuisine_type", "food_type", "primary_category", "category", "tags", "description", "search_document", "google_types", "activity_type", "location_type"];
function textOf(item: Record<string, unknown>) { return SEARCH_FIELDS.map((field) => Array.isArray(item[field]) ? (item[field] as unknown[]).join(" ") : item[field]).filter(Boolean).join(" ").toLowerCase(); }
function hasAny(item: Record<string, unknown>, terms: string[]) { const hay = textOf(item); return terms.some((term) => hay.includes(term.toLowerCase())); }
function score(item: Record<string, unknown>, terms: string[]) { const hay = textOf(item); return terms.reduce((sum, term) => sum + (hay.includes(term) ? 10 : 0), 0) + Number(item.rating ?? 0); }
function normalizeTerm(term: string) { return term.trim().toLowerCase(); }
function uniqueTerms(items: unknown[]) { return Array.from(new Set(items.map((term) => String(term ?? "").trim()).filter(Boolean))); }
function restaurantTermsOriginal(intent: Record<string, any>) {
  return uniqueTerms([
    ...(intent.restaurantIntent?.mealTerms ?? []),
    ...(intent.restaurantIntent?.foodTerms ?? []),
    ...(intent.restaurantIntent?.cuisineTerms ?? []),
    ...(intent.restaurantIntent?.categoryTerms ?? []),
    ...(intent.restaurantIntent?.featureTerms ?? []),
    ...((intent.restaurantIntent?.alternativeGroups ?? []).flat?.() ?? []),
  ]);
}
function activityTermsOriginal(intent: Record<string, any>) {
  return uniqueTerms([
    ...(intent.activityIntent?.activityTerms ?? []),
    ...(intent.activityIntent?.categoryTerms ?? []),
    ...(intent.activityIntent?.featureTerms ?? []),
    ...((intent.activityIntent?.alternativeGroups ?? []).flat?.() ?? []),
  ]);
}
function hasSpecificRestaurantTerm(intent: Record<string, any>) {
  const terms = [
    ...(intent.restaurantIntent?.foodTerms ?? []),
    ...(intent.restaurantIntent?.cuisineTerms ?? []),
    ...(intent.restaurantIntent?.categoryTerms ?? []),
    ...((intent.restaurantIntent?.alternativeGroups ?? []).flat?.() ?? []),
  ].map((term) => normalizeTerm(String(term ?? "")));
  return terms.some((term) => term && !GENERIC_RESTAURANT_TERMS.has(term));
}
function pruneRestaurantRpcTerms(intent: Record<string, any>, searchTerms: string[]) {
  const unique = uniqueTerms(searchTerms);
  if (!hasSpecificRestaurantTerm(intent)) return unique;
  return unique.filter((term) => !GENERIC_RESTAURANT_TERMS.has(normalizeTerm(term)));
}
function hasHookahIntent(rawQuery: string) { return /\b(hookah|shisha|hookah lounge|hookah bar)\b/i.test(rawQuery); }
function rawQueryOutsideHookahPhrases(rawQuery: string) {
  return rawQuery.toLowerCase().replace(/\bhookah\s+(?:lounge|bar)\b/gi, " ").replace(/\b(?:hookah|shisha)\b/gi, " ");
}
function rawQueryExplicitlyIncludes(rawQuery: string, term: string) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(rawQueryOutsideHookahPhrases(rawQuery));
}
function pruneActivityRpcTerms(intent: Record<string, any>, searchTerms: string[]) {
  const rawQuery = String(intent.rawQuery ?? "");
  const unique = uniqueTerms(searchTerms);
  if (!hasHookahIntent(rawQuery)) return unique;
  const output = [...HOOKAH_TERMS];
  for (const term of unique) {
    const normalized = normalizeTerm(term);
    if (HOOKAH_TERMS.includes(normalized)) continue;
    if (BROAD_NIGHTLIFE_TERMS.has(normalized)) {
      if (rawQueryExplicitlyIncludes(rawQuery, normalized)) output.push(term);
      continue;
    }
    output.push(term);
  }
  return uniqueTerms(output);
}
function terms(intent: Record<string, any>, domain: "restaurant" | "activity") { return domain === "restaurant" ? pruneRestaurantRpcTerms(intent, restaurantTermsOriginal(intent)) : pruneActivityRpcTerms(intent, activityTermsOriginal(intent)); }
function speedStatus(ms: number) { return ms < 1000 ? "excellent" : ms < 2000 ? "good" : ms < 3500 ? "okay" : ms < 5000 ? "slow" : "critical"; }

async function parseIntent(supabase: any, rawQuery: string, body: any, perf: Record<string, number>) {
  const cached = await getCachedIntent(supabase, rawQuery);
  if (cached.cache_hit) return { intent: cached.intent as Record<string, unknown>, parser_source: "cache", cache_hit: true, llm_used: false, intentLlmModel: SEARCH_INTENT_FAST_MODEL, intentCacheVersion: SEARCH_INTENT_CACHE_VERSION };
  const started = Date.now();
  const fast = fastParseSearchIntent(rawQuery, { area: body.area });
  perf.llm_ms = 0;
  const useFastPath = body.useFastPath !== false;
  const force = body.force_llm === true || body.debug?.force_llm === true || !useFastPath;
  if (!force && parserConfidence(fast) >= 0.75 && fast.searchType !== "unknown") {
    await saveCachedIntent(supabase, rawQuery, fast, "fast_path");
    return { intent: fast, parser_source: "fast_path", cache_hit: false, llm_used: false, fastPathMatched: true, fastPathReason: "edge_fast_parser_confidence_threshold", intentLlmFastModel: SEARCH_INTENT_FAST_MODEL, intentLlmFallbackModel: SEARCH_INTENT_FALLBACK_MODEL, intentCacheVersion: SEARCH_INTENT_CACHE_VERSION };
  }
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return { intent: normalizeIntent({ ...fast, parser_source: "fallback" }), parser_source: "fallback", cache_hit: false, llm_used: false, fastPathMatched: false, fastPathReason: useFastPath ? "llm_unavailable" : "fast_path_disabled" };
  try {
    const model = SEARCH_INTENT_FAST_MODEL;
    const res = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, response_format: { type: "json_object" }, temperature: 0.1, messages: [{ role: "system", content: "Return compact JSON TheOutHaven search intent." }, { role: "user", content: JSON.stringify({ rawQuery, fast }) }] }) });
    perf.llm_ms = Date.now() - started;
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    const intent = normalizeIntent({ ...fast, ...JSON.parse(data.choices?.[0]?.message?.content || "{}"), parser_source: "llm", confidence: 0.86 });
    await saveCachedIntent(supabase, rawQuery, intent, "llm", model);
    return { intent, parser_source: "llm", cache_hit: false, llm_used: true, intentLlmModel: model, intentLlmFastModel: SEARCH_INTENT_FAST_MODEL, intentLlmFallbackModel: SEARCH_INTENT_FALLBACK_MODEL, intentCacheVersion: SEARCH_INTENT_CACHE_VERSION, fastPathMatched: false, fastPathReason: useFastPath ? "fast_parser_confidence_below_threshold" : "fast_path_disabled" };
  } catch (error) {
    perf.llm_ms = Date.now() - started;
    return { intent: normalizeIntent({ ...fast, parser_source: "fallback", llm_error: safeError(error) }), parser_source: "fallback", cache_hit: false, llm_used: false, fastPathMatched: false, fastPathReason: useFastPath ? "llm_error" : "fast_path_disabled" };
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
    p_limit: intent.strictness === "high" ? Math.min(limit * 4, 24) : limit * 4,
    p_allow_places_of_worship: false,
    p_allow_low_level: false,
  };
  const { data, error } = await supabase.rpc("enterprise_search_locations", params);
  if (!error && Array.isArray(data)) return data;
  const query = supabase.from("locations").select("*").limit(limit * 8);
  return (await query).data ?? [];
}

function isTheaterLike(row: Record<string, unknown>) {
  const hay = textOf(row).replace(/_/g, " ");
  return THEATER_TERMS.some((term) => hay.includes(term.replace(/_/g, " ")));
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function includesPhrase(text: string, term: string) {
  const normalizedText = text.toLowerCase().replace(/_/g, " ");
  const normalizedTerm = escapeRegex(term.toLowerCase().replace(/_/g, " ")).replace(/ /g, "\\s+");
  return new RegExp(`(^|\\s)${normalizedTerm}(\\s|$)`, "i").test(normalizedText);
}

function explicitlyAsksForTheater(intent: any) {
  const rawQuery = String(intent.rawQuery ?? "");
  const searchTerms = Array.from(new Set([...terms(intent, "restaurant"), ...terms(intent, "activity")])).map((term) => String(term).toLowerCase().replace(/_/g, " "));
  return THEATER_INTENT_TERMS.some((term) => {
    const normalized = term.replace(/_/g, " ");
    return includesPhrase(rawQuery, normalized) || searchTerms.includes(normalized);
  });
}

function hasNightlifeIntent(intent: any) {
  const rawQuery = String(intent.rawQuery ?? "");
  const searchTerms = Array.from(new Set([...terms(intent, "restaurant"), ...terms(intent, "activity")])).map((term) => String(term).toLowerCase().replace(/_/g, " "));
  return NIGHTLIFE_TERMS.some((term) => includesPhrase(rawQuery, term) || searchTerms.includes(term));
}

function userAskedForHookah(intent: any) { return hasHookahIntent(String(intent.rawQuery ?? "")); }
function isHookahRow(row: Record<string, unknown>) { return /\b(hookah|shisha)\b/i.test(textOf(row)); }

function domainFilter(rows: Record<string, unknown>[], intent: any, domain: "restaurant" | "activity") {
  const searchTerms = terms(intent, domain);
  const hardTerms = domain === "restaurant" && searchTerms.some((term) => STEAK_TERMS.includes(String(term).toLowerCase())) ? STEAK_TERMS : domain === "activity" && searchTerms.some((term) => String(term).includes("bowling")) ? ["bowling", "bowling alley", "bowling lounge", "bowling lanes", "lanes"] : searchTerms;
  const allowTheater = explicitlyAsksForTheater(intent);
  const blocksTheaterIntent = hasNightlifeIntent(intent) || !allowTheater;
  return rows.filter((row) => {
    const theaterLike = isTheaterLike(row);
    if (domain === "restaurant" && theaterLike) return false;
    if (domain === "activity" && userAskedForHookah(intent) && !isHookahRow(row)) return false;
    if (domain === "activity" && theaterLike && blocksTheaterIntent) return false;
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
    const intent: any = { ...parsed.intent, rawQuery };
    const restaurantRpcTermsOriginal = restaurantTermsOriginal(intent);
    const restaurantTerms = pruneRestaurantRpcTerms(intent, restaurantRpcTermsOriginal);
    const activityRpcTermsOriginal = activityTermsOriginal(intent);
    const activityTerms = pruneActivityRpcTerms(intent, activityRpcTermsOriginal);
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
    const debug = { parser_source: parsed.parser_source, intentParserSource: parsed.parser_source, intentLlmModel: (parsed as any).intentLlmModel ?? (parsed.llm_used ? SEARCH_INTENT_FAST_MODEL : null), intentLlmFastModel: SEARCH_INTENT_FAST_MODEL, intentLlmFallbackModel: SEARCH_INTENT_FALLBACK_MODEL, intentCacheVersion: SEARCH_INTENT_CACHE_VERSION, llmEnhancementUsed: parsed.llm_used, llmFallbackUsed: false, llmTimedOut: false, fallbackIntentUsed: parsed.parser_source === "fallback", intentCacheHit: parsed.cache_hit, fastPathMatched: Boolean(parsed.fastPathMatched), fastPathReason: parsed.fastPathReason ?? null, cache_hit: parsed.cache_hit, llm_used: parsed.llm_used, ...performance, restaurantTerms, activityTerms, restaurantRpcTerms: restaurantTerms, activityRpcTerms: activityTerms, restaurantRpcTermsOriginal, restaurantRpcTermsPruned: restaurantTerms, activityRpcTermsOriginal, activityRpcTermsPruned: activityTerms, activityGeoExpanded, activityInitialRadiusMiles: initialRadius, activityFinalRadiusMiles: activityRadius, activityExpansionReason: activityGeoExpanded ? "fewer than 5 strong activity matches" : null, pairCandidatesFound: restaurants.length * activities.length, pairsWithinRequestedDistance: pairs.length, ...pairDebug, performance };
    await logEdgeFunctionRun(supabase, { function_name: "create-search", status: "success", user_id: user.id, input_summary: { rawQuery }, output_summary: { restaurants: restaurants.length, activities: activities.length, pairs: pairs.length }, duration_ms: perf.total_ms, metadata: debug });
    return ok({ success: true, search_system: "edge-enterprise-search-v1", rawQuery, normalizedIntent: intent, restaurants: restaurants.slice(0, limit), activities: activities.slice(0, limit), pairs, renderMode: pairs.length ? "mixed_pairs" : restaurants.length && activities.length ? "partial_mixed" : restaurants.length ? "restaurant_cards" : activities.length ? "activity_cards" : "empty", performance, debug });
  } catch (error) {
    if (supabase) await logEdgeFunctionRun(supabase, { function_name: "create-search", status: "error", error_message: safeError(error), duration_ms: totalTimer() });
    return serverError("create-search failed", safeError(error));
  }
});
