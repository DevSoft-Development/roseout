import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function currentTester() { const supabase = await createClient(); const { data:{user} } = await supabase.auth.getUser(); let tester:any=null; if (user?.id || user?.email) { const or=[`user_id.eq.${user.id}`]; if(user.email) or.push(`email.eq.${user.email}`); const {data}=await supabaseAdmin.from("beta_testers").select("*").or(or.join(",")).maybeSingle(); tester=data; } return {user,tester}; }
function endOfWeek(start?: string) { if (!start) return null; const d = new Date(`${start}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 6); return d.toISOString().slice(0, 10); }
function titleFor(item: any) { return item?.title || item?.pair_title || item?.name || item?.restaurant_name || item?.activity_name || item?.business_name || "Beta result"; }
function completedStepsFor(action: string, existing?: number[]) {
  const current = Array.isArray(existing) ? existing : [];
  const next = action === "feedback" ? [1, 2, 3, 4, 5] : action === "selection" ? [1, 2, 3] : [1, 2];
  return Array.from(new Set([...current, ...next])).sort();
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { user, tester } = await currentTester();
    if (!user && !tester) return NextResponse.json({ error: "Beta access is required." }, { status: 401 });
    const week = Math.min(4, Math.max(1, Number(body.week_number || 1)));
    const existing = tester?.id ? await supabaseAdmin.from("beta_test_sessions").select("id,completed_steps").eq("tester_id", tester.id).eq("week_number", week).eq("week_start_date", body.week_start_date || null).maybeSingle() : { data: null } as any;
    const sessionPayload = { user_id: user?.id ?? tester?.user_id ?? null, tester_id: tester?.id ?? null, week_number: week, week_start_date: body.week_start_date || null, week_end_date: endOfWeek(body.week_start_date), status: body.action === "feedback" ? "completed" : "in_progress", completed_steps: completedStepsFor(String(body.action || ""), existing.data?.completed_steps) };
    const session = existing.data?.id ? await supabaseAdmin.from("beta_test_sessions").update({ ...sessionPayload, updated_at: new Date().toISOString(), completed_at: body.action === "feedback" ? new Date().toISOString() : null }).eq("id", existing.data.id).select("*").single() : await supabaseAdmin.from("beta_test_sessions").insert(sessionPayload).select("*").single();
    if (session.error) throw session.error;

    if (body.action === "search_run") {
      const run = await supabaseAdmin.from("beta_search_runs").insert({ beta_session_id: session.data.id, user_id: user?.id ?? tester?.user_id ?? null, tester_id: tester?.id ?? null, beta_assignment_id: body.beta_assignment_id || null, week_number: week, outing_sentence: String(body.outing_sentence || ""), enterprise_search_query_used: body.enterprise_search_query_used || null, result_mode: body.result_mode === "paired_outing" ? "paired_outing" : "single_location", pair_requested: Boolean(body.pair_requested), refinement_choices: Array.isArray(body.refinement_choices) ? body.refinement_choices : [], refinement_text: body.refinement_text || null, updated_enterprise_search_query: body.result_set === "updated" ? body.enterprise_search_query_used || null : null }).select("*").single();
      if (run.error) throw run.error;
      const rows = [...(body.results || []).map((r:any,i:number)=>({ beta_search_run_id: run.data.id, result_type: "single_location", result_position: i+1, result_title: titleFor(r), result_data: r, result_set: body.result_set || "original" })), ...(body.pairs || []).map((p:any,i:number)=>({ beta_search_run_id: run.data.id, result_type: "paired_outing", pair_id: p.id || p.pair_id || null, result_position: i+1, result_title: titleFor(p), result_data: p, result_set: body.result_set || "original" }))];
      if (rows.length) await supabaseAdmin.from("beta_search_results").insert(rows);
      return NextResponse.json({ success: true, session: session.data, run: run.data });
    }
    if (body.action === "selection") {
      if (body.beta_search_run_id) await supabaseAdmin.from("beta_search_results").insert({ beta_search_run_id: body.beta_search_run_id, result_type: body.result_type || body.chosen_result_type || "none", result_title: titleFor(body.result), result_data: body.result || {}, was_selected: Boolean(body.was_selected || body.selected_none), was_saved: Boolean(body.was_saved), was_top_pick: Boolean(body.was_top_pick), was_chosen_action_result: Boolean(body.was_chosen_action_result) });
      return NextResponse.json({ success: true, session: session.data });
    }
    if (body.action === "feedback") {
      const entries = Object.entries(body.feedback || {});
      const rows = entries.map(([key, value]) => ({ tester_id: tester?.id ?? null, user_id: user?.id ?? null, beta_session_id: session.data.id, beta_search_run_id: body.beta_search_run_id || null, week_number: week, feedback_type: "general", feature_area: "guided_beta", message: `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`, question_key: key, question_text: key, answer_value: value == null ? null : value, answer_text: typeof value === "string" ? value : null, result_mode: body.result_mode || null, selected_none: Boolean(body.selected_none), search_query: body.outing_sentence || null }));
      if (rows.length) await supabaseAdmin.from("beta_feedback").insert(rows);
      return NextResponse.json({ success: true, session: session.data });
    }
    return NextResponse.json({ success: true, session: session.data });
  } catch (error) {
    console.error("GUIDED_BETA_ERROR", error);
    return NextResponse.json({ error: "We could not save beta progress." }, { status: 500 });
  }
}
