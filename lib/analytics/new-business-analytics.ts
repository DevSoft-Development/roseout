import "server-only";

export type AnalyticsRange = "7d" | "30d" | "90d" | "12m" | "all";
export type AnalyticsEventRow = Record<string, any> & { metadata?: Record<string, any> | null; created_at?: string | null; location_id?: string | null; event_name?: string | null; event_type?: string | null; source?: string | null };
export type OutingRow = Record<string, any> & { location_id?: string | null; source_location_id?: string | null; status?: string | null; completed_at?: string | null; rating?: number | null; matched_vibe?: boolean | null; would_go_again?: boolean | null; contact_method?: string | null; reservation_type?: string | null; created_at?: string | null };
export type AnalyticsLocationRow = Record<string, any> & { id: string };

export const safeNumber = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
export const pct = (n: number, d: number) => (d > 0 ? n / d : 0);
export function getRangeStart(range: AnalyticsRange) { if (range === "all") return null; const d = new Date(); d.setUTCDate(d.getUTCDate() - ({"7d":7,"30d":30,"90d":90,"12m":365} as any)[range]); return d.toISOString(); }
export const rangeToStartIso = getRangeStart;
export const normalizeEventName = (e: AnalyticsEventRow) => String(e.event_name || e.event_type || e.metadata?.event_name || e.metadata?.event_type || "").trim().toLowerCase();
export const getEventLocationId = (e: AnalyticsEventRow) => e.location_id || e.metadata?.location_id || null;
export const getOutingLocationId = (o: OutingRow) => o.location_id || o.source_location_id || null;
export const outingLocationId = getOutingLocationId;
export const isWithinRange = (iso: string | null | undefined, start: string | null) => !start || (!!iso && new Date(iso).getTime() >= new Date(start).getTime());

export function normalizeCategory(value: any) {
  let s = String(value ?? "").trim();
  if (!s || s === "[]") return "Unknown";
  if (s.startsWith("[") && s.endsWith("]")) { try { const p = JSON.parse(s); s = Array.isArray(p) ? String(p[0] || "") : s; } catch {} }
  s = s.replace(/[\[\]"]/g, "").trim();
  const key = s.toLowerCase();
  const map: Record<string,string> = { "brunch spots":"Brunch", brunch:"Brunch", "hookah lounge":"Hookah Lounge", cafe:"Café", "seafood restaurant":"Seafood", steakhouse:"Steakhouse", "theouthaven-friendly outing":"Unknown" };
  return map[key] || (s ? s.replace(/\b\w/g, c => c.toUpperCase()) : "Unknown");
}

export const getLocationDisplayName = (l: AnalyticsLocationRow) => l.name || l.restaurant_name || l.activity_name || "Untitled location";
export const getLocationCategory = (l: AnalyticsLocationRow) => normalizeCategory(l.primary_category || l.category || l.cuisine || l.cuisine_type || l.activity_type || l.location_type || "Unknown");
export const getLocationType = (l: AnalyticsLocationRow) => String(l.location_type || (l.activity_type ? "activity" : "restaurant") || "unknown");
export const average = (vals: Array<number | null | undefined>) => { const f = vals.map(safeNumber).filter(v => v > 0); return f.length ? f.reduce((a,b)=>a+b,0)/f.length : 0; };

export function buildAnalyticsSummary(events: AnalyticsEventRow[], outings: OutingRow[]) { const completed = outings.filter(o=>o.status==="completed"||!!o.completed_at); const starts = events.filter(e=>normalizeEventName(e)==="outing_started").length; return { profile_views: events.filter(e=>["profile_view","location_profile_view","profile_viewed"].includes(normalizeEventName(e))).length, search_appearances: events.filter(e=>["search_appearance","location_impression","search_match"].includes(normalizeEventName(e))).length, search_clicks: events.filter(e=>["search_click","location_click","restaurant_click","activity_click"].includes(normalizeEventName(e))).length, reserve_clicks: events.filter(e=>["reserve_clicked","reservation_clicked","external_reservation_clicked","reservation_started"].includes(normalizeEventName(e))).length, call_clicks: events.filter(e=>["call_clicked","phone_click","phone_clicked"].includes(normalizeEventName(e))).length, outing_starts: starts, completed_outings: completed.length, average_rating: average(completed.map(o=>o.rating)), matched_vibe_percentage: pct(completed.filter(o=>o.matched_vibe===true).length, completed.length), would_go_again_percentage: pct(completed.filter(o=>o.would_go_again===true).length, completed.length), completion_rate: pct(completed.length, starts), action_rate: pct(events.filter(e=>["reserve_clicked","call_clicked","reservation_started","phone_click"].includes(normalizeEventName(e))).length, events.filter(e=>["profile_view","location_profile_view","profile_viewed"].includes(normalizeEventName(e))).length) }; }

export const buildDailySeries = (events: AnalyticsEventRow[]) => Object.values(events.reduce((a,e)=>{const d=String(e.created_at||"").slice(0,10)||"Unknown";(a[d]=a[d]||{date:d,events:0});a[d].events++;return a;},{} as any));
export const buildLocationRollups = (locations: AnalyticsLocationRow[], events: AnalyticsEventRow[], outings: OutingRow[]) => locations.map(l=>{ const lid=l.id; const le=events.filter(e=>getEventLocationId(e)===lid); const lo=outings.filter(o=>getOutingLocationId(o)===lid); const s=buildAnalyticsSummary(le,lo); return { id:lid,name:getLocationDisplayName(l),type:getLocationType(l),city:l.city||"Unknown",borough:l.borough||"Unknown",category:getLocationCategory(l),owner_status:l.owner_user_id||l.owner_email||l.claimed_by_email?"Claimed":"Missing owner",pro_status:l.is_pro?"Pro":"Standard",last_activity_date: le[le.length-1]?.created_at || lo[lo.length-1]?.created_at || null,health_status: s.completed_outings>5?"Strong": s.outing_starts===0?"No activity yet": s.completion_rate<0.2?"Conversion issue": !l.owner_user_id&&!l.owner_email&&!l.claimed_by_email?"Missing owner":"Needs attention",...s}; });
export const buildFunnel = (s:any)=>[{stage:"Profile views",value:s.profile_views},{stage:"Search clicks",value:s.search_clicks},{stage:"Reserve/Call clicks",value:s.reserve_clicks+s.call_clicks},{stage:"Outing starts",value:s.outing_starts},{stage:"Completed outings",value:s.completed_outings}];
export const buildInsights = (s:any)=>[{title:"Track what guests do after discovering your location.",value:s.profile_views},{title:"Reserve clicks, phone calls, and completed outings are tracked from the new TheOutHaven analytics system.",value:s.reserve_clicks+s.call_clicks},{title:"Analytics will appear after guests view, call, reserve, or complete outings.",value:s.completed_outings}];
export const buildRecentActivity = (events: AnalyticsEventRow[]) => events.slice(-50).reverse().map(e=>({event:normalizeEventName(e)||"unknown",created_at:e.created_at||null,source:e.source||"unknown"}));
export const buildBirdsEyeLocations = buildLocationRollups;
const countBy = (rows:any[], keyFn:(r:any)=>string): Array<{name:string;count:number}> => Object.entries(rows.reduce((a,r)=>{const k=keyFn(r)||"Unknown";a[k]=(a[k]||0)+1;return a;},{} as Record<string,number>)).map(([name,count])=>({name,count:Number(count)})).sort((a,b)=>b.count-a.count);
export const buildMostSearchedCategories = (events:AnalyticsEventRow[], locations:AnalyticsLocationRow[]) => { const map=new Map(locations.map(l=>[l.id,l])); const rows=events.filter(e=>["search_click","search_match","location_impression"].includes(normalizeEventName(e))).map(e=>{const l=map.get(getEventLocationId(e)||"");const cat=normalizeCategory(e.metadata?.category||e.metadata?.primary_category||e.metadata?.cuisine||e.metadata?.cuisine_type||e.metadata?.activity_type||e.metadata?.intent||e.metadata?.query||e.metadata?.search_query||e.metadata?.filters?.category||e.metadata?.location_type||l?.primary_category||l?.category||l?.cuisine||l?.cuisine_type||l?.activity_type||l?.location_type);return {category:cat,type:getLocationType(l||{id:"x"}),searches:1,clicks:0,reserve_call_clicks:0,completed_outings:0,completion_rate:0};}); return countBy(rows,r=>r.category).map(r=>({category:r.name,searches:r.count})); };
export const buildEventBreakdown=(e:AnalyticsEventRow[])=>countBy(e,normalizeEventName);
export const buildSourceBreakdown=(e:AnalyticsEventRow[])=>countBy(e,(r)=>String(r.source||r.metadata?.source||"Unknown"));
export const buildContactMethodBreakdown=(o:OutingRow[])=>countBy(o,(r)=>String(r.contact_method||"Unknown"));
export const buildPlanBreakdown=(l:AnalyticsLocationRow[])=>countBy(l,(r)=>String(r.plan|| (r.is_pro?"pro":"standard") ||"Unknown"));
export const buildCityBreakdown=(l:AnalyticsLocationRow[])=>countBy(l,(r)=>String(r.city||"Unknown"));
export const buildBoroughBreakdown=(l:AnalyticsLocationRow[])=>countBy(l,(r)=>String(r.borough||"Unknown"));
export const buildCategoryBreakdown=(l:AnalyticsLocationRow[])=>countBy(l,getLocationCategory);
export const buildConversionBreakdown=(rows:any[])=>rows.map((r:any)=>({name:r.name,completion_rate:r.completion_rate,action_rate:r.action_rate,completed_outings:r.completed_outings})).sort((a,b)=>b.completed_outings-a.completed_outings);
