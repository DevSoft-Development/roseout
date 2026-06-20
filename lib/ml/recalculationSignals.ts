import { classifySearchIntent } from "@/lib/ml/intentBuckets";

export type Diagnostics = Record<string, any> & { skippedReasons: Record<string, number>; recommendation?: string };
export const VIEW_EVENTS = new Set(["location_view","location_viewed","result_impression","search_result_impression","result_viewed","plan_location_view","view"]);
export const CLICK_EVENTS = new Set(["result_click","location_click","card_click","plan_location_click","reserve_clicked","reservation_clicked","call_clicked","website_clicked","link_clicked","external_link_clicked","click"]);
export const RESERVE_EVENTS = new Set(["reserve_clicked","reservation_clicked","reservation_click"]);
export const CALL_EVENTS = new Set(["call_clicked","call_click"]);
export const WEBSITE_EVENTS = new Set(["website_clicked","website_click","link_clicked","external_link_clicked"]);
export const SAVE_EVENTS = new Set(["plan_saved","outing_saved","saved","save"]);
export const NEGATIVE_EVENTS = new Set(["not_interested","skipped","bad_result","hidden","reported_bad_match"]);
export const isUuid=(v:any)=>typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const arr=(v:any)=>Array.isArray(v)?v:[];
export const pick=(o:any,keys:string[])=>{ for (const k of keys) if (o?.[k] != null && o[k] !== "") return o[k]; return null; };
export const text=(v:any,max=500)=> typeof v === "string" ? v.slice(0,max) : v == null ? null : String(v).slice(0,max);
export function bump(d:Diagnostics, reason:string){ d.skippedReasons[reason]=(d.skippedReasons[reason]||0)+1; }
export function normalizeEventName(row:any){
  const m=row?.metadata||{};
  const raw = row?.event_name || row?.eventName || row?.name || row?.type || row?.event || row?.action || m.event_name || m.eventName || m.original_event_name || m.name || m.type || m.event || m.action || "unknown_event";
  return String(raw || "unknown_event").trim().toLowerCase();
}
export function locationIdsFromAnalytics(row:any){ const m=row?.metadata||{}; return [row.location_id,row.source_location_id,pick(m,["location_id","locationId","result_location_id","resultLocationId","restaurant_location_id","restaurantLocationId","activity_location_id","activityLocationId"])].filter(isUuid); }
export function pairFromAnalytics(row:any){ const m=row?.metadata||{}; const r=pick(m,["restaurant_location_id","restaurantLocationId"]); const a=pick(m,["activity_location_id","activityLocationId"]); return isUuid(r)&&isUuid(a)?{restaurant_location_id:r,activity_location_id:a,pair_distance_miles:Number(m.pair_distance_miles ?? m.pairDistanceMiles) || null}:null; }
export function mlResults(meta:any){ return [...arr(meta?.ml_result_ids),...arr(meta?.results),...arr(meta?.debug?.results),...arr(meta?.debugParity?.results),...arr(meta?.resultIds)].map((r:any)=>({location_id:r.location_id||r.locationId||r.id, location_type:r.location_type||r.locationType||r.type, market:r.market, rank:r.rank})).filter((r:any)=>isUuid(r.location_id)); }
export function mlPairs(meta:any){ return [...arr(meta?.ml_pair_ids),...arr(meta?.pairIds)].map((p:any)=>({restaurant_location_id:p.restaurant_location_id||p.restaurantLocationId||p.restaurant_id, activity_location_id:p.activity_location_id||p.activityLocationId||p.activity_id, pair_distance_miles:Number(p.pair_distance_miles ?? p.pairDistanceMiles) || null, market:p.market, rank:p.rank})).filter((p:any)=>isUuid(p.restaurant_location_id)&&isUuid(p.activity_location_id)); }
export function marketFromSearch(row:any){ const m=row?.metadata||{}; return text(row.parsed_market || m.parsed_market || m.geo?.resolvedMarket || m.geo?.requestedMarket || m.debugParity?.requestedMarket || m.debugParity?.resolvedMarket || row.state || row.city || row.borough,100); }
export function intentsForSearch(row:any){ const m=row?.metadata||{}; const values = Array.isArray(m.all_intents) ? m.all_intents : Array.isArray(m.allIntents) ? m.allIntents : null; if (values?.length) return values.map((x:any)=>text(x,100)).filter(Boolean) as string[]; return classifySearchIntent(row.raw_query || row.normalized_query || "").allIntents; }
export function recommendation(d:Diagnostics, updated:number){ if(updated>0) return "ML-ready IDs were found and scored."; if(d.searchEventsWithOnlyFirstResultNames && !d.searchEventsWithMlResultIds && !d.searchEventsWithMlPairIds) return "Search events exist, but they only contain firstResultNames and no location IDs. New searches must be logged with metadata.ml_result_ids and metadata.ml_pair_ids before ML can score results."; if(d.analyticsEventsRead && !d.analyticsEventsWithLocationId && !d.analyticsEventsWithPairIds) return "Analytics events exist but are missing location_id or pair ID metadata."; if(d.outingsRead && !d.outingsWithRestaurantActivityIds) return "Outings do not include restaurant/activity location IDs."; return "No recent eligible events found in the 30-day window. Run new searches after the tracking update so metadata.ml_result_ids and metadata.ml_pair_ids are populated."; }
