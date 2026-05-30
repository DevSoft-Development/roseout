import { supabaseAdmin } from "../../supabase-admin";
import type { EnterpriseLocation, EnterpriseSearchResult } from "./types";
import { parseEnterpriseIntent } from "./intent-parser";
import { searchEnterpriseLane, recoverEnterpriseLane, createRpcDebug } from "./rpc";
import { filterActivityResults, filterRestaurantResults, rankActivityResults, rankRestaurantResults, explainRejection } from "./ranking";
import { createSearchPairs } from "./pairing";
import { activitySearchTerms, restaurantSearchTerms } from "./normalize-intent";
import { productionSafeDebug } from "./debug";

function uniqueById(items: EnterpriseLocation[]) { const seen=new Set<string>(); return items.filter((item)=>{ const id=String(item.id ?? item.name ?? Math.random()); if(seen.has(id)) return false; seen.add(id); return true; }); }
function replyFor(restaurants: EnterpriseLocation[], activities: EnterpriseLocation[], intent: any) { if (intent.wantsPairing) { if (restaurants.length&&activities.length) return "Found restaurant and activity options that match your outing."; if (restaurants.length) return `I found restaurant options near ${intent.geo.raw ?? "that area"}, but I couldn’t find matching activities nearby yet.`; if (activities.length) return `I found activity options near ${intent.geo.raw ?? "that area"}, but I couldn’t find matching restaurants nearby yet.`; } if (restaurants.length) return "Found restaurant matches."; if (activities.length) return "Found activity matches."; return "I couldn’t find strong matches for that request yet."; }
export async function runEnterpriseSearch(query: string, options?: { body?: any; useLLM?: boolean; supabase?: any; displayLimit?: number }): Promise<EnterpriseSearchResult> {
  const started=Date.now(); const { intent, llmIntentRaw, llmError } = await parseEnterpriseIntent(query, { useLLM: options?.useLLM, body: options?.body }); const debug=createRpcDebug(intent); const supabase=options?.supabase ?? supabaseAdmin; const displayLimit=options?.displayLimit ?? 12;
  let restaurantRaw: EnterpriseLocation[]=[]; let activityRaw: EnterpriseLocation[]=[];
  if (intent.needsRestaurant) { restaurantRaw = await searchEnterpriseLane(supabase,intent,"restaurant",debug); let filtered=filterRestaurantResults(restaurantRaw,intent); if (!filtered.length && restaurantSearchTerms(intent).length) { restaurantRaw=await recoverEnterpriseLane(supabase,intent,"restaurant",debug); filtered=filterRestaurantResults(restaurantRaw,intent); } }
  if (intent.needsActivity) { activityRaw = await searchEnterpriseLane(supabase,intent,"activity",debug); let filtered=filterActivityResults(activityRaw,intent); if (!filtered.length && activitySearchTerms(intent).length) { activityRaw=await recoverEnterpriseLane(supabase,intent,"activity",debug); filtered=filterActivityResults(activityRaw,intent); } }
  const restaurantRejectedReasons=restaurantRaw.map(r=>explainRejection(r,intent,"restaurant")).filter(Boolean); const activityRejectedReasons=activityRaw.map(r=>explainRejection(r,intent,"activity")).filter(Boolean);
  const restaurants=rankRestaurantResults(uniqueById(restaurantRaw),intent).slice(0,displayLimit); const activities=rankActivityResults(uniqueById(activityRaw),intent).slice(0,displayLimit); const pairs=intent.wantsPairing?createSearchPairs(restaurants,activities,intent):[];
  const matched_locations=uniqueById([...restaurants,...activities]).slice(0,displayLimit*2);
  const render_mode = intent.wantsPairing ? (restaurants.length&&activities.length ? "mixed_pairs" : restaurants.length||activities.length ? "partial_mixed" : "empty") : restaurants.length ? "restaurant_cards" : activities.length ? "activity_cards" : "empty";
  const card_counts={ restaurants: restaurants.length, activities: activities.length, matched_locations: matched_locations.length, pairs: pairs.length };
  const fullDebug={ search_system:"enterprise-search-v1", rawQuery:query, llmIntentRaw, normalizedIntent:intent, restaurantTerms:restaurantSearchTerms(intent), activityTerms:activitySearchTerms(intent), geo:intent.geo, ...debug, restaurantRejectedReasons, activityRejectedReasons, distanceScoringUsed:Boolean(intent.geo.latitude&&intent.geo.longitude), pairDistanceMiles:pairs.map(p=>p.distance_miles), renderMode:render_mode, timingMs:Date.now()-started, llmError };
  return { success: true, reply: replyFor(restaurants,activities,intent), restaurants, activities, pairs, matched_locations, matchedLocations: matched_locations, render_mode, renderMode: render_mode, card_counts, cardCounts: card_counts, debug: productionSafeDebug(fullDebug) };
}
export * from "./types";
export * from "./normalize-intent";
export * from "./ranking";
export * from "./pairing";
export * from "./distance";
export * from "./geo-taxonomy";
