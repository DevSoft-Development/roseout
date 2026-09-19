import { NextResponse } from "next/server";
import { isStrongEnoughPassword } from "@/lib/auth/password-policy";
import { findPasswordSetupToken, hashPasswordSetupToken, isPasswordSetupExpired } from "@/lib/auth/passwordSetupTokens";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { assignWeeklyBetaTasksForTester } from "@/lib/beta/weeklyTasks";
import { logBetaProgramAudit, sendBetaApprovalEmailOnce } from "@/lib/beta/programAccess";

export async function POST(request: Request) {
  const { token, password } = await request.json().catch(() => ({}));
  const rawToken = String(token || "").trim();

  if (!rawToken) return NextResponse.json({ ok: false, status: "missing", message: "This password setup link is missing a token." }, { status: 400 });
  if (!isStrongEnoughPassword(String(password || ""))) return NextResponse.json({ ok: false, status: "weak_password", message: "Password does not meet minimum requirements (8+ chars with mixed complexity)." }, { status: 400 });

  const result = await findPasswordSetupToken(rawToken);
  const tokenHash = hashPasswordSetupToken(rawToken);

  if (result.error || !result.data) {
    console.info("[password-setup:create-password-lookup]", { tokenHashPrefix: tokenHash.slice(0, 12), found: false });
    return NextResponse.json({ ok: false, status: "invalid", message: "This setup link is invalid or no longer active." }, { status: 400 });
  }

  const invite = result.data;
  if (invite.used_at) return NextResponse.json({ ok: false, status: "used", message: "This setup link has already been used." }, { status: 400 });
  if (isPasswordSetupExpired(invite.expires_at)) return NextResponse.json({ ok: false, status: "expired", message: "This setup link has expired for your security." }, { status: 400 });

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(invite.user_id, { password, email_confirm: true });
  if (updateError) return NextResponse.json({ ok: false, status: "update_failed", message: "We could not create your password. Please try again." }, { status: 500 });

  const now = new Date().toISOString();
  const email = String(invite.email || "").trim().toLowerCase();
  await supabaseAdmin.from("users").update({ status: "active", activated_at: now }).eq("id", invite.user_id);
  await supabaseAdmin.from("password_setup_tokens").update({ used_at: now }).eq("id", invite.id);

  const { data: signup } = await supabaseAdmin
    .from("launch_waitlist_signups")
    .select("id,metadata,wants_giveaway")
    .eq("email", email)
    .maybeSingle();
  if (signup) {
    await supabaseAdmin.from("launch_waitlist_signups").update({
      email_verified: true,
      email_verified_at: now,
      email_verification_token_hash: null,
      beta_application_status: "approved",
      giveaway_status: signup.wants_giveaway ? "pending_beta_tasks" : "not_entered",
      weekly_task_eligibility_status: signup.wants_giveaway ? "pending_beta_tasks" : null,
    }).eq("id", signup.id);
    await logBetaProgramAudit({ action: "beta_email_verified_from_password_setup", entityType: "launch_waitlist_signup", entityId: signup.id, targetEmail: email, summary: "Launch signup email verified from password setup" });
  }

  const { data: tester } = await supabaseAdmin
    .from("beta_testers")
    .select("id,user_id,status,approved_at")
    .eq("email", email)
    .maybeSingle();
  if (tester) {
    const { data: updatedTester } = await supabaseAdmin.from("beta_testers").update({
      user_id: tester.user_id || invite.user_id,
      status: "active",
      approved_at: tester.approved_at || now,
    }).eq("id", tester.id).select("id").single();
    const testerId = updatedTester?.id || tester.id;
    const assigned = await assignWeeklyBetaTasksForTester(testerId);
    await logBetaProgramAudit({ action: "beta_tasks_assigned", entityType: "beta_tester", entityId: testerId, targetEmail: email, summary: "Weekly beta tasks assigned after password creation", metadata: assigned });
    await sendBetaApprovalEmailOnce({ email, signupId: signup?.id || null });
  }

  return NextResponse.json({ ok: true, status: "success" });
}
