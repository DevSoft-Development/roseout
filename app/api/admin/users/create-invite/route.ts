import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createPasswordSetupToken, getPasswordSetupExpiry, hashPasswordSetupToken, normalizePasswordSetupRole, PASSWORD_SETUP_PURPOSE } from "@/lib/auth/passwordSetupTokens";
import { passwordSetupInviteTemplate } from "@/lib/email/templates/passwordSetupInvite";
import { sendSupportEmail } from "@/lib/email/sendSupportEmail";
import { isAdminRole, isUserRole, normalizeRole } from "@/lib/users/roles";

export async function POST(request: Request) {
  const { error, adminUser } = await requireAdminApiRole(["superadmin", "admin"]);
  if (error) return error;

  const body = await request.json();
  const email = String(body.email || "").trim().toLowerCase();
  const firstName = String(body.first_name || "").trim();
  const lastName = String(body.last_name || "").trim();
  const role = normalizeRole(String(body.role || "user"));
  const sendInvite = Boolean(body.send_invite ?? true);
  const phone = body.phone ? String(body.phone).trim() : null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Valid email is required." }, { status: 400 });
  }

  if (!isUserRole(role)) {
    return Response.json({ error: "Unsupported role." }, { status: 400 });
  }

  const existing = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (existing.data.users?.some((u) => u.email?.toLowerCase() === email)) {
    return Response.json({ error: "User already exists." }, { status: 409 });
  }

  const created = await supabaseAdmin.auth.admin.createUser({
    email,
    user_metadata: { first_name: firstName, last_name: lastName },
    email_confirm: true,
  });

  if (created.error || !created.data.user) {
    return Response.json({ error: created.error?.message || "Failed to create user." }, { status: 400 });
  }

  await supabaseAdmin.from("users").upsert({
    id: created.data.user.id,
    email,
    full_name: `${firstName} ${lastName}`.trim(),
    phone,
    role: normalizePasswordSetupRole(role),
    status: "invited",
  }, { onConflict: "id" });

  if (isAdminRole(role)) {
    await supabaseAdmin.from("admin_users").upsert(
      {
        email,
        full_name: `${firstName} ${lastName}`.trim() || null,
        role,
      },
      { onConflict: "email" },
    );
  }

  await supabaseAdmin
    .from("password_setup_tokens")
    .update({ used_at: new Date().toISOString(), invalidated_reason: "new_link_requested" })
    .eq("email", email)
    .is("used_at", null)
    .eq("purpose", PASSWORD_SETUP_PURPOSE);

  const rawToken = createPasswordSetupToken();
  const tokenHash = hashPasswordSetupToken(rawToken);
  const expiresAt = getPasswordSetupExpiry();
  const { error: insertError } = await supabaseAdmin.from("password_setup_tokens").insert({
    user_id: created.data.user.id,
    email,
    token_hash: tokenHash,
    purpose: PASSWORD_SETUP_PURPOSE,
    role: normalizePasswordSetupRole(role),
    assigned_location_id: body.assigned_location_id || null,
    expires_at: expiresAt,
    created_by: adminUser?.id || null,
  });

  if (insertError) {
    console.error("[password-setup:create-token-failed]", { email, userId: created.data.user.id, tokenHashPrefix: tokenHash.slice(0, 12), error: insertError.message, details: insertError.details, hint: insertError.hint, code: insertError.code });
    return Response.json({ error: "User was created, but the password setup link could not be created." }, { status: 500 });
  }

  console.info("[password-setup:create-token]", { email, userId: created.data.user.id, tokenHashPrefix: tokenHash.slice(0, 12), expiresAt, purpose: PASSWORD_SETUP_PURPOSE, requestPath: new URL(request.url).pathname, insertSuccess: true });

  if (sendInvite) {
    const emailTemplate = passwordSetupInviteTemplate({
      first_name: firstName,
      token: rawToken,
      expires_at: expiresAt,
      role: normalizePasswordSetupRole(role),
    });

    await sendSupportEmail({
      to: email,
      subject: emailTemplate.subject,
      body: emailTemplate.text,
      html: emailTemplate.html,
      department: "security",
    });

    console.info("Password setup email sent");
  }

  return Response.json({
    success: true,
    invite_sent: sendInvite,
    message: sendInvite ? "User created and password setup email sent." : "User created in invited status.",
    user: { id: created.data.user.id, email },
  });
}
