import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { evaluateRankingGuardrails } from "@/lib/search/rankingGuardrails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorize() {
  return requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
}

export async function GET() {
  const { error } = await authorize();
  if (error) return error;

  const [settings, health, events] = await Promise.all([
    supabaseAdmin.from("search_ranking_guardrail_settings").select("*").eq("id", true).maybeSingle(),
    supabaseAdmin.from("search_ranking_guardrail_health_v1").select("*").limit(1),
    supabaseAdmin.from("search_ranking_rollout_events").select("*").order("created_at", { ascending: false }).limit(25),
  ]);

  return NextResponse.json({
    settings: settings.data ?? null,
    health: health.data?.[0] ?? null,
    events: events.data ?? [],
  });
}

export async function POST(request: NextRequest) {
  const { adminUser, error } = await authorize();
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  if (body.action === "evaluate") {
    const decision = await evaluateRankingGuardrails();
    return NextResponse.json({ success: true, decision });
  }

  if (body.action === "acknowledge") {
    await supabaseAdmin.from("search_ranking_rollout_events").insert({
      event_type: "acknowledged",
      status: "acknowledged",
      reason: typeof body.reason === "string" ? body.reason.slice(0, 500) : null,
      metadata: { acknowledged_by: adminUser?.user_id ?? null },
    });
    return NextResponse.json({ success: true });
  }

  const payload = {
    id: true,
    enabled: Boolean(body.enabled),
    evaluation_window_minutes: Math.max(15, Math.min(1440, Number(body.evaluation_window_minutes ?? 60))),
    minimum_sample_size: Math.max(1, Number(body.minimum_sample_size ?? 50)),
    max_no_result_rate_delta: Math.max(0, Number(body.max_no_result_rate_delta ?? 0.05)),
    max_p95_latency_ms: Math.max(1, Number(body.max_p95_latency_ms ?? 2500)),
    max_pair_count_drop: Math.max(0, Number(body.max_pair_count_drop ?? 0.2)),
    updated_by: adminUser?.user_id ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error: updateError } = await supabaseAdmin
    .from("search_ranking_guardrail_settings")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ success: true, settings: data });
}
