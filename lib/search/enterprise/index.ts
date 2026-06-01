import { supabaseAdmin } from "../../supabaseAdmin";
import type { EnterpriseLocation, EnterpriseSearchResult, SearchIntent } from "./types";
import { parseEnterpriseIntent } from "./intent-parser";
import { activitySearchTerms, restaurantSearchTerms } from "./normalize-intent";
import { explainRejection, filterActivityResults, filterRestaurantResults, rankActivityResults, rankRestaurantResults } from "./ranking";
import { createPairingDebug, createSearchPairs } from "./pairing";
import { createRpcDebug, recoverEnterpriseLane, searchEnterpriseLane } from "./rpc";
import { productionSafeDebug } from "./debug";
import { hasLocationImage } from "@/lib/locationImage";


function uniqueById(items: EnterpriseLocation[]) { const seen=new Set<string>(); return items.filter((item)=>{ const key=String(item.id ?? item.name ?? Math.random()); if (seen.has(key)) return false; seen.add(key); return true; }); }
function hasPairConstraint(intent: SearchIntent) { return Boolean(intent.pairingPreference && intent.pairingPreference.distanceMode !== "any"); }
function areaLabel(intent: SearchIntent) { return intent.geo.neighborhood ?? intent.geo.borough ?? intent.geo.city ?? intent.geo.county ?? intent.geo.raw ?? "that area"; }
function replyFor(restaurants: EnterpriseLocation[], activities: EnterpriseLocation[], pairs: ReturnType<typeof createSearchPairs>, intent: SearchIntent) {
  if (intent.wantsPairing) {
    const constrained = hasPairConstraint(intent);
    const walkableWord = intent.pairingPreference?.distanceMode === "same_area" ? "same-area" : "walkable";
    if (pairs.length) return constrained ? `I found ${walkableWord} dinner + activity pairings near ${areaLabel(intent)}.` : "Found restaurant and activity options that match your outing.";
    if (restaurants.length&&activities.length) return constrained ? "I found matching restaurants and activities, but none close enough to confidently call walking distance." : "Found restaurant and activity options, but I could not create a confident pair yet.";
    if (restaurants.length) return constrained ? "I found restaurants, but no matching walkable activity nearby." : `I found restaurant options near ${areaLabel(intent)}, but I couldn’t find matching activities nearby yet.`;
    if (activities.length) return constrained ? "I found activities, but no matching walkable restaurant nearby." : `I found activity options near ${areaLabel(intent)}, but I couldn’t find matching restaurants nearby yet.`;
  }
  if (restaurants.length) return "Found restaurant matches.";
  if (activities.length) return "Found activity matches.";
  return "I couldn’t find strong matches for that request yet.";
}
export async function runEnterpriseSearch(query: string, options?: { useLLM?: boolean; body?: any; supabase?: any; displayLimit?: number }): Promise<EnterpriseSearchResult> {
  const started=Date.now(); const { intent, llmIntentRaw, llmError } = await parseEnterpriseIntent(query, { useLLM: options?.useLLM, body: options?.body }); const debug=createRpcDebug(intent); const supabase=options?.supabase ?? supabaseAdmin; const displayLimit=options?.displayLimit ?? 12;
  let restaurantRaw: EnterpriseLocation[]=[]; let activityRaw: EnterpriseLocation[]=[];
  if (intent.needsRestaurant) { restaurantRaw = await searchEnterpriseLane(supabase,intent,"restaurant",debug); let filtered=filterRestaurantResults(restaurantRaw,intent); if (!filtered.length && restaurantSearchTerms(intent).length) { restaurantRaw=await recoverEnterpriseLane(supabase,intent,"restaurant",debug); filtered=filterRestaurantResults(restaurantRaw,intent); } }
  if (intent.needsActivity) { activityRaw = await searchEnterpriseLane(supabase,intent,"activity",debug); let filtered=filterActivityResults(activityRaw,intent); if (!filtered.length && activitySearchTerms(intent).length) { activityRaw=await recoverEnterpriseLane(supabase,intent,"activity",debug); filtered=filterActivityResults(activityRaw,intent); } }
  const restaurantRejectedReasons=restaurantRaw.map(r=>explainRejection(r,intent,"restaurant")).filter(Boolean); const activityRejectedReasons=activityRaw.map(r=>explainRejection(r,intent,"activity")).filter(Boolean);
  const restaurantPhotoSafe = uniqueById(restaurantRaw).filter(hasLocationImage);
  const activityPhotoSafe = uniqueById(activityRaw).filter(hasLocationImage);

  const restaurants = rankRestaurantResults(restaurantPhotoSafe, intent).slice(0, displayLimit);
  const activities = rankActivityResults(activityPhotoSafe, intent).slice(0, displayLimit);

  const pairingDebug = createPairingDebug();

  const pairs = intent.wantsPairing
    ? createSearchPairs(restaurants, activities, intent, pairingDebug)
    : [];

  const matched_locations = uniqueById([...restaurants, ...activities]).slice(
    0,
    displayLimit * 2,
  );
  const render_mode = intent.wantsPairing ? (pairs.length ? "mixed_pairs" : restaurants.length||activities.length ? "partial_mixed" : "empty") : restaurants.length ? "restaurant_cards" : activities.length ? "activity_cards" : "empty";
  const card_counts={ restaurants: restaurants.length, activities: activities.length, matched_locations: matched_locations.length, pairs: pairs.length };
  const fullDebug={ search_system:"enterprise-search-v1", rawQuery:query, llmIntentRaw, normalizedIntent:intent, restaurantTerms:restaurantSearchTerms(intent), activityTerms:activitySearchTerms(intent), geo:intent.geo, ...debug, restaurantRejectedReasons, activityRejectedReasons, distanceScoringUsed:Boolean(intent.geo.latitude&&intent.geo.longitude), pairDistanceMiles:pairs.map(p=>p.pairDistanceMiles), pairingPreference:intent.pairingPreference, pairCandidatesEvaluated:pairingDebug.pairCandidatesEvaluated, pairsRejectedForDistance:pairingDebug.pairsRejectedForDistance, pairsRejectedForMissingCoordinates:pairingDebug.pairsRejectedForMissingCoordinates, rejectedPairs:pairingDebug.rejectedPairs, walkablePairsFound:pairingDebug.walkablePairsFound, maxPairDistanceMiles:intent.pairingPreference?.maxPairDistanceMiles ?? null, distanceMode:intent.pairingPreference?.distanceMode ?? "any", renderMode:render_mode, timingMs:Date.now()-started, llmError };
  return { success: true, reply: replyFor(restaurants,activities,pairs,intent), restaurants, activities, pairs, matched_locations, matchedLocations: matched_locations, render_mode, renderMode: render_mode, card_counts, cardCounts: card_counts, debug: productionSafeDebug(fullDebug) };
}
export * from "./types";
export * from "./normalize-intent";
export * from "./ranking";
export * from "./pairing";
export * from "./distance";
export * from "./geo-taxonomy";
