import { NextRequest, NextResponse } from "next/server";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { calculateLocationMlScore, ML_SCORE_VERSION } from "@/lib/ml/locationRanking";
import { calculateReviewQualityScore } from "@/lib/ml/reviewIntelligence";
import { CALL_EVENTS, CLICK_EVENTS, Diagnostics, NEGATIVE_EVENTS, RESERVE_EVENTS, SAVE_EVENTS, VIEW_EVENTS, bump, isUuid, locationIdsFromAnalytics, mlPairs, mlResults, normalizeEventName, pairFromAnalytics, pick, recommendation } from "@/lib/ml/recalculationSignals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Agg = { impressions_7d: number; impressions_30d: number; views_7d: number; views_30d: number; clicks_7d: number; clicks_30d: number; reservation_clicks_30d: number; call_clicks_30d: number; website_clicks_30d: number; saves_30d: number; completed_outings_30d: number; negative_signals_30d: number; last_engaged_at?: string | null };

const ANALYTICS_FIELDS = "event_name,event_type,name,type,event,action,location_id,source_location_id,restaurant_location_id,activity_location_id,metadata,created_at";
const OUTING_FIELDS = "location_id,restaurant_location_id,activity_location_id,status,saved_at,completed_at,completed_no_feedback_at,completion_inferred_at,last_link_clicked_at,created_at";
const REVIEW_FEATURE_FIELDS = "location_id,approved_review_count,verified_review_count,avg_rating,avg_ai_score_boost,review_confidence_score,wait_penalty,service_penalty,overpriced_penalty,service_score,food_score,ambiance_score,value_score,review_summary";

function getBearerToken(request: NextRequest) { const auth = request.headers.get("authorization") || ""; return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null; }
function isCronAuthorized(request: NextRequest) { return Boolean(process.env.CRON_SECRET && getBearerToken(request) === process.env.CRON_SECRET); }
import { authorizeSearchHealthMlRequest } from "@/lib/ml/admin-ml-auth";

import { authorizeSearchHealthMlRequest } from "@/lib/ml/admin-ml-auth";
async function authorize(request: NextRequest) { return authorizeSearchHealthMlRequest(request); }
export async function GET(request: NextRequest) { return POST(request); }
