import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireBetaAdmin, safeError } from "../_shared";

const LOG_FIELDS = "id,source,route,search_query,beta_assignment_id,beta_tester_id,used_custom_prompt,search_mode,location_area,started_at,completed_at,total_ms,llm_ms,rpc_ms,restaurant_rpc_ms,activity_rpc_ms,ranking_ms,pairing_ms,photo_filter_ms,result_count,restaurant_count,activity_count,pair_count,used_llm,used_fallback,timed_out,speed_status,success,error_message,created_at" as const;
const SUMMARY_FIELDS = "day,speed_status,used_custom_prompt,count,avg_total_ms,max_total_ms,p50_total_ms,p95_total_ms" as const;
const SLOWEST_FIELDS = "id,created_at,source,route,search_query,beta_assignment_id,beta_tester_id,used_custom_prompt,total_ms,llm_ms,rpc_ms,pairing_ms,photo_filter_ms,result_count,restaurant_count,activity_count,pair_count,speed_status,success,error_message" as const;

export async function GET(req: NextRequest) {
  const auth = await requireBetaAdmin();
  if (auth.error) return auth.error;
  try {
    const params = req.nextUrl.searchParams;
    let query = supabaseAdmin.from("search_performance_logs").select(LOG_FIELDS).order("created_at", { ascending: false });
    if (params.get("speed_status")) query = query.eq("speed_status", params.get("speed_status"));
    if (params.get("source")) query = query.eq("source", params.get("source"));
    if (params.get("used_custom_prompt")) query = query.eq("used_custom_prompt", params.get("used_custom_prompt") === "true");
    const [logsResult, summaryResult, slowestResult] = await Promise.all([
      query.limit(300),
      supabaseAdmin.from("admin_beta_search_speed_summary").select(SUMMARY_FIELDS).limit(300),
      supabaseAdmin.from("admin_beta_slowest_searches").select(SLOWEST_FIELDS).limit(100),
    ]);
    if (logsResult.error) throw logsResult.error;
    return NextResponse.json({
      success: true,
      logs: logsResult.data || [],
      summary: summaryResult.data || [],
      slowest: slowestResult.data || [],
      warnings: [summaryResult.error?.message, slowestResult.error?.message].filter(Boolean),
    });
  } catch (error) {
    console.error(error);
    return safeError();
  }
}
