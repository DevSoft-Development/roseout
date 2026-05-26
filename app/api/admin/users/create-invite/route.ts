import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { generatePasswordInviteToken } from "@/lib/security/password-invite";

export async function POST(request: Request) {
  const { error, adminUser } = await requireAdminApiRole(["superuser", "admin"]);
  if (error) return error;

  const body = await request.json();
  const email = String(body.email || "").trim().toLowerCase();
  const firstName = String(body.first_name || "").trim();
  const lastName = String(body.last_name || "").trim();
  const role = String(body.role || "user");
  const phone = body.phone ? String(body.phone).trim() : null;
  const sendInvite = Boolean(body.send_invite ?? true);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Valid email is required." }, { status: 400 });
  }

  const existing = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (existing.data.users?.some((u) => u.email?.toLowerCase() === email)) {
    return Response.json({ error: "User already exists." }, { status: 409 });
  }

  const invited = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: { role, first_name: firstName, last_name: lastName },
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || ""}/auth/create-password`,
  });
  if (invited.error || !invited.data.user) {
    return Response.json({ error: invited.error?.message || "Failed to create invite." }, { status: 400 });
  }

  await supabaseAdmin.from("users").upsert({
    id: invited.data.user.id,
    email,
    full_name: `${firstName} ${lastName}`.trim(),
    phone,
    role,
    status: "invited",
  }, { onConflict: "id" });

  // Optional custom token table support (hash only)
  const { rawToken, tokenHash } = generatePasswordInviteToken();
  await supabaseAdmin.from("password_setup_tokens").insert({
    user_id: invited.data.user.id,
    email,
    token_hash: tokenHash,
    purpose: "create_password",
    role,
    assigned_location_id: body.assigned_location_id || null,
    expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    created_by: adminUser?.id || null,
  });

  // never return raw token
  void rawToken;

  return Response.json({ success: true, user: { id: invited.data.user.id, email }, invite_sent: sendInvite });
}
