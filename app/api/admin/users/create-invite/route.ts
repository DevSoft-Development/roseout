import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createPasswordSetupToken, getPasswordSetupExpiry, hashPasswordSetupToken, normalizeInviteRole } from "@/lib/auth/passwordSetupTokens";
import { passwordSetupInviteTemplate } from "@/lib/email/templates/passwordSetupInvite";
import { sendSupportEmail } from "@/lib/email/sendSupportEmail";

const SUPPORTED_ROLES = ["user", "owner", "admin"] as const;

export async function POST(request: Request) {
  const { error, adminUser } = await requireAdminApiRole(["superuser", "admin"]);
  if (error) return error;

  const body = await request.json();
  const email = String(body.email || "").trim().toLowerCase();
  const firstName = String(body.first_name || "").trim();
  const lastName = String(body.last_name || "").trim();
  const role = String(body.role || "user");
  const sendInvite = Boolean(body.send_invite ?? true);
  const phone = body.phone ? String(body.phone).trim() : null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Valid email is required." }, { status: 400 });
  }

  if (!SUPPORTED_ROLES.includes(role as (typeof SUPPORTED_ROLES)[number])) {
    return Response.json({ error: "Unsupported role." }, { status: 400 });
  }

  const existing = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (existing.data.users?.some((u) => u.email?.toLowerCase() === email)) {
    return Response.json({ error: "User already exists." }, { status: 409 });
  }

  const created = await supabaseAdmin.auth.admin.createUser({
    email,
    user_metadata: { role: normalizeInviteRole(role), first_name: firstName, last_name: lastName },
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
    role: normalizeInviteRole(role),
    status: "invited",
  }, { onConflict: "id" });

  await supabaseAdmin
    .from("password_setup_tokens")
    .update({ used_at: new Date().toISOString(), invalidated_reason: "new_link_requested" })
    .eq("email", email)
    .is("used_at", null)
    .eq("purpose", "create_password");

  const rawToken = createPasswordSetupToken();
  const tokenHash = hashPasswordSetupToken(rawToken);
  const expiresAt = getPasswordSetupExpiry();
  await supabaseAdmin.from("password_setup_tokens").insert({
    user_id: created.data.user.id,
    email,
    token_hash: tokenHash,
    purpose: "create_password",
    role: normalizeInviteRole(role),
    assigned_location_id: body.assigned_location_id || null,
    expires_at: expiresAt,
    created_by: adminUser?.id || null,
  });

  if (sendInvite) {
    const emailTemplate = passwordSetupInviteTemplate({
      first_name: firstName,
      token: rawToken,
      expires_at: expiresAt,
      role: normalizeInviteRole(role),
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
