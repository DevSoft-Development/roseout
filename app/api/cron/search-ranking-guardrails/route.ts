import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { evaluateRankingGuardrails } from "@/lib/search/rankingGuardrails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOCK_KEY = "search-ranking-guardrails";
const LOCK_TTL_MINUTES = 10;

function isAuthorized(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const authorization = request.headers.get("authorization");
  return authorization === `Bearer ${expected}`;
}

async function acquireLock() {
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + LOCK_TTL_MINUTES * 60_000).toISOString();
  const owner = `vercel-cron:${crypto.randomUUID()}`;

  const { data: existing } = await supabaseAdmin
    .from("search_ranking_rollout_evaluation_locks")
    .select("locked_until")
    .eq("lock_key", LOCK_KEY)
    .maybeSingle();

  if (existing?.locked_until && new Date(existing.locked_until).getTime() > now.getTime()) {
    return null;
  }

  const { error } = await supabaseAdmin
    .from("search_ranking_rollout_evaluation_locks")
    .upsert({
      lock_key: LOCK_KEY,
      locked_until: lockedUntil,
      locked_by: owner,
      updated_at: now.toISOString(),
    }, { onConflict: "lock_key" });

  if (error) throw error;
  return owner;
}

async function releaseLock(owner: string) {
  await supabaseAdmin
    .from("search_ranking_rollout_evaluation_locks")
    .delete()
    .eq("lock_key", LOCK_KEY)
    .eq("locked_by", owner);
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: rollout } = await supabaseAdmin
    .from("search_ranking_rollout_settings")
    .select("enabled")
    .eq("id", true)
    .maybeSingle();

  const { data: guardrails } = await supabaseAdmin
    .from("search_ranking_guardrail_settings")
    .select("enabled")
    .eq("id", true)
    .maybeSingle();

  if (!rollout?.enabled && !guardrails?.enabled) {
    return NextResponse.json({ status: "disabled", evaluated: false });
  }

  const owner = await acquireLock();
  if (!owner) {
    return NextResponse.json({ status: "locked", evaluated: false }, { status: 202 });
  }

  try {
    const decision = await evaluateRankingGuardrails();
    const now = new Date().toISOString();

    await supabaseAdmin
      .from("search_ranking_rollout_stage_state")
      .update({
        last_evaluated_at: now,
        last_decision: decision.status,
        last_decision_reasons: decision.reasons,
        updated_at: now,
      })
      .eq("id", true);

    if (decision.rolledBack) {
      const { data: state } = await supabaseAdmin
        .from("search_ranking_rollout_stage_state")
        .select("stage_key")
        .eq("id", true)
        .maybeSingle();

      await supabaseAdmin.from("search_ranking_rollout_stage_history").insert({
        from_stage_key: state?.stage_key ?? null,
        to_stage_key: "disabled",
        change_type: "automatic_rollback",
        reason: decision.reasons.join("; "),
        metrics_snapshot: decision.health ?? {},
      });

      await supabaseAdmin
        .from("search_ranking_rollout_stage_state")
        .update({
          stage_key: "disabled",
          stage_started_at: now,
          automatic_promotion_enabled: false,
          updated_at: now,
        })
        .eq("id", true);
    }

    return NextResponse.json({ status: decision.status, evaluated: true, decision });
  } finally {
    await releaseLock(owner);
  }
}
