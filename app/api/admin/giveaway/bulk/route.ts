import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { repairBetaAccessForEmail } from "@/lib/beta/programAccess";
import { getBetaGiveawayEligibilityForEmail } from "@/lib/beta-giveaway-eligibility";
import { getBetaAccountReadinessForEmail } from "@/lib/beta/accountReadiness";

const allowedActions = new Set(["resend_setup_email", "repair_beta_access", "verify_social", "verify_tags", "mark_disqualified", "mark_prize_qualified"]);

type Body = { ids?: unknown; action?: unknown };

function missingPrizeRequirements(entry: any, eligibility: any, readiness: any) {
  const missing: string[] = [];
  if (!eligibility?.isBetaTester || !["active", "approved"].includes(String(eligibility.betaStatus || ""))) missing.push("active beta tester");
  if (!readiness?.loginReady) missing.push("login account ready");
  if (!eligibility?.weeklyTasksComplete) missing.push("weekly beta tasks");
  if (!entry.followed_social) missing.push("social follow verification");
    if (!entry.age_18_confirmed) missing.push("18+ confirmation");
  if (!(entry.giveaway_rules_agreed || entry.prize_rules_confirmed)) missing.push("reward rules agreement");
  if (entry.duplicate_flag) missing.push("duplicate review");
  if (!entry.wants_giveaway) missing.push("reward opt-in");
  if (entry.giveaway_status === "disqualified") missing.push("not disqualified");
  return missing;
}

export async function POST(request: Request) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.giveawayManage);
  if (auth.error) return auth.error;
  const body = (await request.json().catch(() => ({}))) as Body;
  const action = String(body.action || "");
  const ids = Array.isArray(body.ids) ? body.ids.map((id) => String(id)).filter(Boolean).slice(0, 100) : [];
  if (!allowedActions.has(action)) return NextResponse.json({ success: false, error: "Invalid bulk action." }, { status: 400 });
  if (!ids.length) return NextResponse.json({ success: false, error: "Select at least one entry." }, { status: 400 });

  const { data: entries, error } = await supabaseAdmin.from("launch_waitlist_signups").select("*").in("id", ids);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  const results = [];
  for (const entry of entries || []) {
    try {
      const now = new Date().toISOString();
      if (action === "resend_setup_email" || action === "repair_beta_access") {
        await repairBetaAccessForEmail({ email: entry.email, fullName: entry.full_name, phone: entry.phone, testerType: entry.tester_type, applicationId: entry.beta_application_id, actor: auth.adminUser, sendInviteIfNeeded: true });
      } else if (action === "verify_social") {
        await supabaseAdmin.from("launch_waitlist_signups").update({ followed_social: true, followed_social_verified_at: now, followed_social_verified_by: auth.adminUser?.user_id ?? null, updated_at: now }).eq("id", entry.id);
      } else if (action === "verify_tags") {
        await supabaseAdmin.from("launch_waitlist_signups").update({ tagged_two_friends: true, tagged_friends_verified_at: now, tagged_friends_verified_by: auth.adminUser?.user_id ?? null, updated_at: now }).eq("id", entry.id);
      } else if (action === "mark_disqualified") {
        await supabaseAdmin.from("launch_waitlist_signups").update({ giveaway_status: "disqualified", updated_at: now }).eq("id", entry.id);
      } else if (action === "mark_prize_qualified") {
        const [eligibility, readiness] = await Promise.all([getBetaGiveawayEligibilityForEmail(entry.email || ""), getBetaAccountReadinessForEmail(entry)]);
        const missing = missingPrizeRequirements(entry, eligibility, readiness);
        if (missing.length) throw new Error(`Missing: ${missing.join(", ")}.`);
        await supabaseAdmin.from("launch_waitlist_signups").update({ giveaway_status: "verified", giveaway_verified_at: now, giveaway_verified_by: auth.adminUser?.user_id ?? null, weekly_task_eligibility_status: eligibility.eligibilityStatus, updated_at: now }).eq("id", entry.id);
      }
      await supabaseAdmin.from("admin_audit_logs").insert({ actor_user_id: auth.adminUser?.user_id ?? null, actor_email: auth.adminUser?.email ?? null, actor_role: auth.adminUser?.role ?? null, target_email: entry.email, action: `bulk_${action}`, entity_type: "launch_waitlist_signup", entity_id: entry.id, summary: `Bulk giveaway action: ${action}`, metadata: { selectedCount: ids.length } });
      results.push({ id: entry.id, email: entry.email, success: true });
    } catch (error) {
      results.push({ id: entry.id, email: entry.email, success: false, error: error instanceof Error ? error.message : "Action failed." });
    }
  }
  const failures = results.filter((result) => !result.success);
  return NextResponse.json({ success: failures.length === 0, message: failures.length ? `${results.length - failures.length} succeeded, ${failures.length} failed.` : `${results.length} entries updated.`, results, error: failures[0]?.error }, { status: failures.length ? 207 : 200 });
}
