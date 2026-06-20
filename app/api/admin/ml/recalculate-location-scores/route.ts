import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { calculateLocationMlScore, ML_SCORE_VERSION } from "@/lib/ml/locationRanking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Agg = { impressions_7d: number; impressions_30d: number; views_7d: number; views_30d: number; clicks_7d: number; clicks_30d: number; reservation_clicks_30d: number; call_clicks_30d: number; website_clicks_30d: number; saves_30d: number; completed_outings_30d: number; negative_signals_30d: number; last_engaged_at?: string | null };
const VIEW_EVENTS = new Set(["location_view", "location_viewed", "result_impression", "search_result_impression", "result_viewed"]);
const CLICK_EVENTS = new Set(["result_click", "location_click", "card_click", "plan_location_click", "reserve_clicked", "reservation_clicked", "call_clicked", "website_clicked", "link_clicked"]);
const RESERVE_EVENTS = new Set(["reserve_clicked", "reservation_clicked", "reservation_click"]);
const CALL_EVENTS = new Set(["call_clicked", "call_click"]);
const WEBSITE_EVENTS = new Set(["website_clicked", "link_clicked", "external_link_clicked"]);
const SAVE_EVENTS = new Set(["plan_saved", "outing_saved", "saved"]);
const NEGATIVE_EVENTS = new Set(["not_interested", "skipped", "bad_result", "hidden", "reported_bad_match"]);

function getBearerToken(request: NextRequest) { const auth = request.headers.get("authorization") || ""; return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null; }
function isCronAuthorized(request: NextRequest) { return Boolean(process.env.CRON_SECRET && getBearerToken(request) === process.env.CRON_SECRET); }
async function authorize(request: NextRequest) { if (process.env.NODE_ENV === "development" || isCronAuthorized(request)) return null; const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth); return error; }
function emptyAgg(): Agg { return { impressions_7d: 0, impressions_30d: 0, views_7d: 0, views_30d: 0, clicks_7d: 0, clicks_30d: 0, reservation_clicks_30d: 0, call_clicks_30d: 0, website_clicks_30d: 0, saves_30d: 0, completed_outings_30d: 0, negative_signals_30d: 0 }; }
function aggFor(map: Map<string, Agg>, id: unknown) { const key = typeof id === "string" ? id : ""; if (!key) return null; if (!map.has(key)) map.set(key, emptyAgg()); return map.get(key)!; }
function eventName(row: any) { return String(row.event_name || row.event_type || row.metadata?.event_name || row.metadata?.type || row.metadata?.action || "").toLowerCase(); }
function is7d(createdAt: string | null | undefined, since7d: Date) { const date = new Date(createdAt || 0); return !Number.isNaN(date.getTime()) && date >= since7d; }
function touch(agg: Agg, at?: string | null) { if (at && (!agg.last_engaged_at || new Date(at) > new Date(agg.last_engaged_at))) agg.last_engaged_at = at; }
async function safeSelect(table: string, columns: string, sinceIso: string) { try { const { data, error } = await supabaseAdmin.from(table).select(columns).gte("created_at", sinceIso).limit(50000); if (error) { console.warn(`ML ranking skipped ${table}:`, error.message); return []; } return data || []; } catch (error) { console.warn(`ML ranking skipped ${table}:`, error); return []; } }

export async function POST(request: NextRequest) {
  const authError = await authorize(request);
  if (authError) return authError;
  const now = new Date();
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const features = new Map<string, Agg>();
  let errors = 0;

  const events = await safeSelect("analytics_events", "id,event_name,event_type,location_id,created_at,metadata", since30d.toISOString());
  for (const row of events as any[]) {
    const agg = aggFor(features, row.location_id || row.metadata?.location_id);
    if (!agg) continue;
    const name = eventName(row);
    const in7d = is7d(row.created_at, since7d);
    if (VIEW_EVENTS.has(name)) { agg.impressions_30d += 1; agg.views_30d += 1; if (in7d) { agg.impressions_7d += 1; agg.views_7d += 1; } }
    if (CLICK_EVENTS.has(name)) { agg.clicks_30d += 1; if (in7d) agg.clicks_7d += 1; touch(agg, row.created_at); }
    if (RESERVE_EVENTS.has(name)) agg.reservation_clicks_30d += 1;
    if (CALL_EVENTS.has(name)) agg.call_clicks_30d += 1;
    if (WEBSITE_EVENTS.has(name)) agg.website_clicks_30d += 1;
    if (SAVE_EVENTS.has(name)) { agg.saves_30d += 1; touch(agg, row.created_at); }
    if (NEGATIVE_EVENTS.has(name)) agg.negative_signals_30d += 1;
  }

  const outings = await safeSelect("outings", "id,location_id,restaurant_location_id,activity_location_id,status,saved_at,completed_at,completed_no_feedback_at,completion_inferred_at,last_link_clicked_at,reservation_clicked_at,call_clicked_at,created_at", since30d.toISOString());
  for (const row of outings as any[]) {
    for (const id of [row.location_id, row.restaurant_location_id, row.activity_location_id].filter(Boolean)) {
      const agg = aggFor(features, id); if (!agg) continue;
      if (row.saved_at || row.status === "saved") { agg.saves_30d += 1; touch(agg, row.saved_at || row.created_at); }
      if (row.completed_at || row.completed_no_feedback_at || row.completion_inferred_at || ["completed", "completed_no_feedback"].includes(row.status)) { agg.completed_outings_30d += 1; touch(agg, row.completed_at || row.completed_no_feedback_at || row.completion_inferred_at || row.created_at); }
      if (row.last_link_clicked_at || row.status === "link_clicked") { agg.website_clicks_30d += 1; agg.clicks_30d += 1; touch(agg, row.last_link_clicked_at || row.created_at); }
      if (row.reservation_clicked_at || row.status === "reservation_clicked") { agg.reservation_clicks_30d += 1; agg.clicks_30d += 1; touch(agg, row.reservation_clicked_at || row.created_at); }
      if (row.call_clicked_at || row.status === "call_clicked") { agg.call_clicks_30d += 1; agg.clicks_30d += 1; touch(agg, row.call_clicked_at || row.created_at); }
    }
  }

  const rows = Array.from(features.entries()).map(([location_id, a]) => {
    const conversions = a.reservation_clicks_30d + a.call_clicks_30d + a.website_clicks_30d + a.saves_30d + a.completed_outings_30d;
    const ctr_30d = a.clicks_30d / Math.max(a.impressions_30d, 1);
    const conversion_rate_30d = conversions / Math.max(a.views_30d + a.clicks_30d, 1);
    const freshness_score = a.last_engaged_at ? Math.max(0, 10 - (now.getTime() - new Date(a.last_engaged_at).getTime()) / 86400000) : 0;
    const engagement_score = Math.min(25, Math.log1p(a.clicks_30d * 2 + a.views_30d * 0.25 + a.saves_30d * 5 + a.completed_outings_30d * 8) * 7);
    const conversion_score = Math.min(30, conversion_rate_30d * 30);
    const quality_component = 0;
    const ml_score = calculateLocationMlScore({ ...a, ctr_30d, conversion_rate_30d, engagement_score, conversion_score, freshness_score, quality_component });
    return { location_id, updated_at: now.toISOString(), ...a, ctr_30d, conversion_rate_30d, engagement_score, conversion_score, freshness_score, quality_component, ml_score, score_version: ML_SCORE_VERSION, metadata: { signal_window_days: 30, last_engaged_at: a.last_engaged_at ?? null } };
  });

  let updated = 0;
  if (rows.length) {
    const { error } = await supabaseAdmin.from("location_ml_features").upsert(rows, { onConflict: "location_id" });
    if (error) { errors += rows.length; console.error("ML feature upsert failed", error.message); }
    else updated = rows.length;
  }
  await supabaseAdmin.from("location_ml_score_runs").insert({ status: errors ? "completed_with_errors" : "completed", processed_count: rows.length, updated_count: updated, error_count: errors, score_version: ML_SCORE_VERSION, metadata: { event_rows: events.length, outing_rows: outings.length } });
  return NextResponse.json({ success: errors === 0, processed: rows.length, updated, errors, score_version: ML_SCORE_VERSION, sample_top_scores: rows.sort((a,b)=>b.ml_score-a.ml_score).slice(0,10).map(({ location_id, ml_score }) => ({ location_id, ml_score })) });
}

export async function GET(request: NextRequest) { return POST(request); }
