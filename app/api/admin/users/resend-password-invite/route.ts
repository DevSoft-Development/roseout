import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createPasswordSetupToken, getPasswordSetupExpiry, hashPasswordSetupToken, normalizePasswordSetupRole, PASSWORD_SETUP_PURPOSE } from "@/lib/auth/passwordSetupTokens";
import { passwordSetupInviteTemplate } from "@/lib/email/templates/passwordSetupInvite";
import { sendSupportEmail } from "@/lib/email/sendSupportEmail";

export async function POST(request: Request) {
  const { error } = await requireAdminApiRole(["superuser", "admin"]);
  if (error) return error;
  const body = await request.json();
  const requestedEmail = String(body.email || "").trim().toLowerCase();
  const userId = String(body.user_id || "").trim();
  if (!requestedEmail && !userId) return Response.json({ error: "Email or user_id required." }, { status: 400 });

  let userEmail = requestedEmail, role = "user", firstName = "there", authUserId = userId;
  if (userId) {
    const userResult = await supabaseAdmin.auth.admin.getUserById(userId);
    if (userResult.error || !userResult.data.user) return Response.json({ error: "User not found." }, { status: 404 });
    userEmail = userResult.data.user.email?.toLowerCase() || "";
    role = String(userResult.data.user.user_metadata?.role || "user");
    firstName = String(userResult.data.user.user_metadata?.first_name || "there");
    authUserId = userResult.data.user.id;
  }
  if (!userEmail) return Response.json({ error: "Email required." }, { status: 400 });

  await supabaseAdmin.from("password_setup_tokens").update({ used_at: new Date().toISOString(), invalidated_reason: "new_link_requested" }).eq("email", userEmail).is("used_at", null).eq("purpose", PASSWORD_SETUP_PURPOSE);

  const rawToken = createPasswordSetupToken();
  const tokenHash = hashPasswordSetupToken(rawToken);
  const expiresAt = getPasswordSetupExpiry();
  const { error: insertError } = await supabaseAdmin.from("password_setup_tokens").insert({ user_id: authUserId || null, email: userEmail, token_hash: tokenHash, purpose: PASSWORD_SETUP_PURPOSE, role: normalizePasswordSetupRole(role), expires_at: expiresAt });
  if (insertError) {
    console.error("[password-setup:create-token-failed]", { email: userEmail, userId: authUserId, tokenHashPrefix: tokenHash.slice(0, 12), error: insertError.message, details: insertError.details, hint: insertError.hint, code: insertError.code });
    return Response.json({ error: "User exists, but the password setup link could not be created." }, { status: 500 });
  }

  console.info("[password-setup:create-token]", { email: userEmail, userId: authUserId, tokenHashPrefix: tokenHash.slice(0, 12), expiresAt, purpose: PASSWORD_SETUP_PURPOSE, requestPath: new URL(request.url).pathname, insertSuccess: true });

  const emailTemplate = passwordSetupInviteTemplate({ first_name: firstName, token: rawToken, expires_at: expiresAt, role });
  await sendSupportEmail({ to: userEmail, subject: emailTemplate.subject, body: emailTemplate.text, html: emailTemplate.html, department: "security" });
  return Response.json({ success: true, message: "Password setup email resent." });
}
