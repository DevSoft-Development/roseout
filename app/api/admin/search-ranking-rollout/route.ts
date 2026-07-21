import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getRankingRolloutSettings } from "@/lib/search/rankingRollout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorize() {
  return requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
}

export async function GET() {
  const { error } = await authorize();
  if (error) return error;

  const [settings, analyticsResult, recentResult] = await Promise.all([
    getRankingRolloutSettings(),
    supabaseAdmin.from("search_ranking_rollout_analytics_v1").select("*"),
    supabaseAdmin
      .from("search_ranking_experiments")
      .select("variant,market,rollout_percent,model_version,latency_ms,no_results,pair_count,created_at")
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  return NextResponse.json({
    settings,
    analytics: analyticsResult.data ?? [],
    recent: recentResult.data ?? [],
  });
}

export async function POST(request: NextRequest) {
  const { adminUser, error } = await authorize();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const rolloutPercent = Math.max(0, Math.min(100, Number(body.rollout_percent ?? 0)));
  const enabled = Boolean(body.enabled) && rolloutPercent > 0;
  const eligibleMarkets = Array.isArray(body.eligible_markets)
    ? body.eligible_markets.map(String).map((value: string) => value.trim()).filter(Boolean).slice(0, 20)
    : ["nyc"];

  const { data, error: updateError } = await supabaseAdmin
    .from("search_ranking_rollout_settings")
    .upsert({
      id: true,
      enabled,
      rollout_percent: rolloutPercent,
      admin_only: body.admin_only !== false,
      eligible_markets: eligibleMarkets,
      model_version: typeof body.model_version === "string" ? body.model_version.slice(0, 100) : "hybrid:v1",
      updated_by: adminUser?.user_id ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" })
    .select("*")
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ success: true, settings: data });
}