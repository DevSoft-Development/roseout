import { NextResponse } from "next/server";
import { isStrongEnoughPassword } from "@/lib/auth/password-policy";
import { findPasswordSetupToken, hashPasswordSetupToken, isPasswordSetupExpired } from "@/lib/auth/passwordSetupTokens";
import { supabaseAdmin } from "@/lib/supabase-admin";

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

  await supabaseAdmin.from("users").update({ status: "active", activated_at: new Date().toISOString() }).eq("id", invite.user_id);
  await supabaseAdmin.from("password_setup_tokens").update({ used_at: new Date().toISOString() }).eq("id", invite.id);

  return NextResponse.json({ ok: true, status: "success" });
}
