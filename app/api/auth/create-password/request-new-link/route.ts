import { NextResponse } from "next/server";
import { createPasswordSetupToken, getPasswordSetupExpiry, hashPasswordSetupToken, normalizeInviteRole, PASSWORD_SETUP_RESEND_COOLDOWN_MS } from "@/lib/auth/passwordSetupTokens";
import { passwordSetupInviteTemplate } from "@/lib/email/templates/passwordSetupInvite";
import { sendSupportEmail } from "@/lib/email/sendSupportEmail";
import { enforceRateLimit } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase-admin";

const generic = { ok: true, message: "If an account exists for that email, we sent a new setup link." };

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") || "unknown";
  const ipRate = enforceRateLimit(`pwd_setup:${ip}`, 15, 5 * 60 * 1000);
  if (!ipRate.ok) return NextResponse.json(generic);

  const body = await request.json().catch(() => ({}));
  const email = String(body?.email || "").trim().toLowerCase();
  if (!email) return NextResponse.json(generic);

  const users = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = users.data.users?.find((u) => u.email?.toLowerCase() === email);
  if (!user) return NextResponse.json(generic);

  const cooldownThreshold = new Date(Date.now() - PASSWORD_SETUP_RESEND_COOLDOWN_MS).toISOString();
  const { data: recent } = await supabaseAdmin
    .from("password_setup_tokens")
    .select("id")
    .eq("email", email)
    .gte("created_at", cooldownThreshold)
    .order("created_at", { ascending: false })
    .limit(1);

  if (recent?.length) return NextResponse.json(generic);

  await supabaseAdmin.from("password_setup_tokens").update({ used_at: new Date().toISOString(), invalidated_reason: "new_link_requested" }).eq("user_id", user.id).is("used_at", null);

  const rawToken = createPasswordSetupToken();
  const tokenHash = hashPasswordSetupToken(rawToken);
  const expiresAt = getPasswordSetupExpiry();
  await supabaseAdmin.from("password_setup_tokens").insert({
    user_id: user.id,
    email,
    token_hash: tokenHash,
    purpose: "create_password",
    role: normalizeInviteRole(String(user.user_metadata?.role || "user")),
    expires_at: expiresAt,
  });

  const tpl = passwordSetupInviteTemplate({ first_name: String(user.user_metadata?.first_name || "there"), token: rawToken, expires_at: expiresAt, role: String(user.user_metadata?.role || "user") });
  await sendSupportEmail({ to: email, subject: tpl.subject, body: tpl.text, html: tpl.html, department: "security" }).catch((error) => console.error("request-new-link email failure", error));

  return NextResponse.json(generic);
}
