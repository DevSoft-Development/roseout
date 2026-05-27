import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { generatePasswordInviteToken } from "@/lib/security/password-invite";
import { passwordSetupInviteTemplate } from "@/lib/email/templates/passwordSetupInvite";
import { sendSupportEmail } from "@/lib/email/sendSupportEmail";

export async function POST(request: Request) {
  const { error } = await requireAdminApiRole(["superuser", "admin"]);
  if (error) return error;

  const body = await request.json();
  const requestedEmail = String(body.email || "").trim().toLowerCase();
  const userId = String(body.user_id || "").trim();

  if (!requestedEmail && !userId) return Response.json({ error: "Email or user_id required." }, { status: 400 });

  let userEmail = requestedEmail;
  let role = "user";
  let firstName = "there";
  let authUserId = userId;

  if (userId) {
    const userResult = await supabaseAdmin.auth.admin.getUserById(userId);
    if (userResult.error || !userResult.data.user) return Response.json({ error: "User not found." }, { status: 404 });
    userEmail = userResult.data.user.email?.toLowerCase() || "";
    role = String(userResult.data.user.user_metadata?.role || "user");
    firstName = String(userResult.data.user.user_metadata?.first_name || "there");
    authUserId = userResult.data.user.id;
  }

  if (!userEmail) return Response.json({ error: "Email required." }, { status: 400 });

  await supabaseAdmin.from("password_setup_tokens").update({ used_at: new Date().toISOString() }).eq("email", userEmail).is("used_at", null).eq("purpose", "create_password");

  const { rawToken, tokenHash } = generatePasswordInviteToken();
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  await supabaseAdmin.from("password_setup_tokens").insert({
    user_id: authUserId || null,
    email: userEmail,
    token_hash: tokenHash,
    purpose: "create_password",
    role,
    expires_at: expiresAt,
  });

  const emailTemplate = passwordSetupInviteTemplate({ first_name: firstName, token: rawToken, expires_at: expiresAt, role });

  await sendSupportEmail({
    to: userEmail,
    subject: emailTemplate.subject,
    body: emailTemplate.text,
    html: emailTemplate.html,
    department: "security",
  });

  console.info("Password setup email resent");
  return Response.json({ success: true, message: "Password setup email resent." });
}
