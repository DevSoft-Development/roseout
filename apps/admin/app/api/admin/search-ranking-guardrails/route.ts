import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { evaluateRankingGuardrails } from "@/lib/search/rankingGuardrails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SETTINGS_FIELDS = "id,enabled,evaluation_window_minutes,minimum_sample_size,max_no_result_rate_delta,max_p95_latency_ms,max_pair_count_drop,updated_at";
const HEALTH_FIELDS = "enabled,evaluation_window_minutes,minimum_sample_size,max_no_result_rate_delta,max_p95_latency_ms,max_pair_count_drop,control_sample_size,hybrid_sample_size,control_no_result_rate,hybrid_no_result_rate,control_p95_latency_ms,hybrid_p95_latency_ms,control_avg_pair_count,hybrid_avg_pair_count";
const EVENT_FIELDS = "id,event_type,status,reason,control_sample_size,hybrid_sample_size,control_no_result_rate,hybrid_no_result_rate,control_p95_latency_ms,hybrid_p95_latency_ms,control_avg_pair_count,hybrid_avg_pair_count,created_at";

async function authorize() {
  return requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
}

export async function GET() {
  const { error } = await authorize();
  if (error) return error;

  const [settings, health, events] = await Promise.all([
    supabaseAdmin.from("search_ranking_guardrail_settings").select(SETTINGS_FIELDS).eq("id", true).maybeSingle(),
    supabaseAdmin.from("search_ranking_guardrail_health_v1").select(HEALTH_FIELDS).limit(1),
    supabaseAdmin.from("search_ranking_rollout_events").select(EVENT_FIELDS).order("created_at", { ascending: false }).limit(25),
  ]);

  return NextResponse.json({ settings: settings.data ?? null, health: health.data?.[0] ?? null, events: events.data ?? [] });
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
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : null;
    await supabaseAdmin.from("search_ranking_rollout_events").insert({ event_type: "acknowledged", status: "acknowledged", reason, metadata: { acknowledged_by: adminUser?.user_id ?? null } });
    return NextResponse.json({ success: true });
  }

  const payload = {
    id: true,
    enabled: Boolean(body.enabled),
    evaluation_window_minutes: Math.max(15, Math.min(1440, Number(body.evaluation_window_minutes ?? 60))),
    minimum_sample_size: Math.max(1, Math.min(100000, Number(body.minimum_sample_size ?? 50))),
    max_no_result_rate_delta: Math.max(0, Math.min(1, Number(body.max_no_result_rate_delta ?? 0.05))),
    max_p95_latency_ms: Math.max(1, Math.min(120000, Number(body.max_p95_latency_ms ?? 2500))),
    max_pair_count_drop: Math.max(0, Math.min(1, Number(body.max_pair_count_drop ?? 0.2))),
    updated_by: adminUser?.user_id ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error: updateError } = await supabaseAdmin
    .from("search_ranking_guardrail_settings")
    .upsert(payload, { onConflict: "id" })
    .select(SETTINGS_FIELDS)
    .single();
  if (updateError) return NextResponse.json({ error: "Unable to update guardrail settings." }, { status: 500 });
  return NextResponse.json({ success: true, settings: data });
}
