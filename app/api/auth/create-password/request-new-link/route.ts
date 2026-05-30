import { NextResponse } from "next/server";
import { createPasswordSetupToken, getPasswordSetupExpiry, hashPasswordSetupToken, normalizePasswordSetupRole, PASSWORD_SETUP_PURPOSE, PASSWORD_SETUP_RESEND_COOLDOWN_MS } from "@/lib/auth/passwordSetupTokens";
import { passwordSetupInviteTemplate } from "@/lib/email/templates/passwordSetupInvite";
import { sendRenderedEmail } from "@/lib/email/sender";
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

  const { data: profile } = await supabaseAdmin
    .from("users")
    .select("role, full_name")
    .eq("id", user.id)
    .maybeSingle();
  const role = normalizePasswordSetupRole(String(profile?.role || "user"));
  const firstName = String(profile?.full_name || "there").split(" ")[0] || "there";

  const cooldownThreshold = new Date(Date.now() - PASSWORD_SETUP_RESEND_COOLDOWN_MS).toISOString();
  const { data: recent } = await supabaseAdmin
    .from("password_setup_tokens")
    .select("id")
    .eq("email", email)
    .gte("created_at", cooldownThreshold)
    .order("created_at", { ascending: false })
    .limit(1);

  if (recent?.length) return NextResponse.json(generic);

  await supabaseAdmin.from("password_setup_tokens").update({ used_at: new Date().toISOString(), invalidated_reason: "new_link_requested" }).eq("user_id", user.id).is("used_at", null).eq("purpose", PASSWORD_SETUP_PURPOSE);

  const rawToken = createPasswordSetupToken();
  const tokenHash = hashPasswordSetupToken(rawToken);
  const expiresAt = getPasswordSetupExpiry();
  const { error: insertError } = await supabaseAdmin.from("password_setup_tokens").insert({
    user_id: user.id,
    email,
    token_hash: tokenHash,
    purpose: PASSWORD_SETUP_PURPOSE,
    role,
    expires_at: expiresAt,
  });

  if (insertError) {
    console.error("[password-setup:create-token-failed]", { email, userId: user.id, tokenHashPrefix: tokenHash.slice(0, 12), error: insertError.message, details: insertError.details, hint: insertError.hint, code: insertError.code });
    return NextResponse.json(generic);
  }

  console.info("[password-setup:create-token]", { email, userId: user.id, tokenHashPrefix: tokenHash.slice(0, 12), expiresAt, purpose: PASSWORD_SETUP_PURPOSE, requestPath: new URL(request.url).pathname, insertSuccess: true });

  const tpl = passwordSetupInviteTemplate({ first_name: firstName, token: rawToken, expires_at: expiresAt, role });
  await sendRenderedEmail({ to: email, rendered: tpl, department: tpl.department, templateKey: "password_setup_invite" }).catch((error) => console.error("request-new-link email failure", error));

  return NextResponse.json(generic);
}
