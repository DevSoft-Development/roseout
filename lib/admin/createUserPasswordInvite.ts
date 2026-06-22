import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { createPasswordSetupToken, getPasswordSetupExpiry, hashPasswordSetupToken, normalizePasswordSetupRole, PASSWORD_SETUP_PURPOSE } from "@/lib/auth/passwordSetupTokens";
import { passwordSetupInviteTemplate } from "@/lib/email/templates/passwordSetupInvite";
import { sendRenderedEmail } from "@/lib/email/sender";
import { isAdminRole, normalizeRole } from "@/lib/users/roles";

export type CreateUserPasswordInviteInput = {
  email: string;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  role?: string | null;
  phone?: string | null;
  source?: string | null;
  createdBy?: string | null;
  sendInvite?: boolean;
  assignedLocationId?: string | null;
  betaTesterInvite?: boolean;
  programName?: string;
  rewardName?: string;
  dashboardUrl?: string;
};

export async function createUserPasswordInvite(input: CreateUserPasswordInviteInput) {
  const email = input.email.trim().toLowerCase();
  const role = normalizeRole(String(input.role || "user"));
  const publicRole = normalizePasswordSetupRole(role);
  const firstName = (input.firstName || input.fullName?.split(/\s+/)[0] || "").trim();
  const lastName = (input.lastName || input.fullName?.split(/\s+/).slice(1).join(" ") || "").trim();
  const fullName = (input.fullName || `${firstName} ${lastName}`.trim()).trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Valid email is required.");

  const existingUsers = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (existingUsers.error) throw new Error(existingUsers.error.message);
  let authUser = existingUsers.data.users?.find((user) => user.email?.toLowerCase() === email) || null;
  const createdUser = !authUser;

  if (!authUser) {
    const created = await supabaseAdmin.auth.admin.createUser({
      email,
      user_metadata: { first_name: firstName, last_name: lastName, full_name: fullName, source: input.source || "admin_invite" },
      email_confirm: true,
    });
    if (created.error || !created.data.user) throw new Error(created.error?.message || "Failed to create user.");
    authUser = created.data.user;
  }

  await supabaseAdmin.from("users").upsert({
    id: authUser.id,
    email,
    full_name: fullName || null,
    phone: input.phone || null,
    role: publicRole,
    status: "invited",
  }, { onConflict: "id" });

  if (isAdminRole(role)) await supabaseAdmin.from("admin_users").upsert({ user_id: authUser.id, role }, { onConflict: "user_id" });

  let inviteSent = false;
  let inviteError: string | null = null;
  let expiresAt: string | null = null;
  if (input.sendInvite ?? true) {
    await supabaseAdmin.from("password_setup_tokens").update({ used_at: new Date().toISOString(), invalidated_reason: "new_link_requested" }).eq("email", email).is("used_at", null).eq("purpose", PASSWORD_SETUP_PURPOSE);
    const rawToken = createPasswordSetupToken();
    const tokenHash = hashPasswordSetupToken(rawToken);
    expiresAt = getPasswordSetupExpiry();
    const inserted = await supabaseAdmin.from("password_setup_tokens").insert({
      user_id: authUser.id,
      email,
      token_hash: tokenHash,
      purpose: PASSWORD_SETUP_PURPOSE,
      role: publicRole,
      assigned_location_id: input.assignedLocationId || null,
      expires_at: expiresAt,
      created_by: input.createdBy || null,
    });
    if (inserted.error) throw new Error(inserted.error.message);

    try {
      const rendered = passwordSetupInviteTemplate({
        first_name: firstName || fullName || "there",
        token: rawToken,
        expires_at: expiresAt,
        role: publicRole,
        betaTesterInvite: input.betaTesterInvite,
        programName: input.programName,
        rewardName: input.rewardName,
        dashboardUrl: input.dashboardUrl,
      });
      await sendRenderedEmail({ to: email, rendered, department: rendered.department, templateKey: "password_setup_invite" });
      inviteSent = true;
    } catch (error) {
      inviteError = error instanceof Error ? error.message : "Password setup email failed.";
    }
  }

  return { user_id: authUser.id, invite_sent: inviteSent, created_user: createdUser, reused_user: !createdUser, invite_error: inviteError, expires_at: expiresAt };
}
