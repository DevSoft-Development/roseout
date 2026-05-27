import { NextResponse } from "next/server";
import { isStrongEnoughPassword } from "@/lib/auth/password-policy";
import { hashPasswordSetupToken, isPasswordSetupExpired } from "@/lib/auth/passwordSetupTokens";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  const { token, password } = await request.json().catch(() => ({}));

  if (!token) return NextResponse.json({ ok: false, status: "missing", message: "This password setup link is missing a token." }, { status: 400 });
  if (!isStrongEnoughPassword(String(password || ""))) {
    return NextResponse.json({ ok: false, status: "weak_password", message: "Password does not meet minimum requirements (8+ chars with mixed complexity)." }, { status: 400 });
  }

  const tokenHash = hashPasswordSetupToken(String(token));
  const { data: invite } = await supabaseAdmin.from("password_setup_tokens").select("id,user_id,email,expires_at,used_at").eq("token_hash", tokenHash).maybeSingle();
  if (!invite) return NextResponse.json({ ok: false, status: "invalid", message: "This setup link is invalid or no longer active." }, { status: 400 });
  if (invite.used_at) return NextResponse.json({ ok: false, status: "used", message: "This setup link has already been used." }, { status: 400 });
  if (isPasswordSetupExpired(invite.expires_at)) return NextResponse.json({ ok: false, status: "expired", message: "This setup link has expired for your security." }, { status: 400 });

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(invite.user_id, {
    password,
    email_confirm: true,
  });

  if (updateError) {
    return NextResponse.json({ ok: false, status: "update_failed", message: "We could not create your password. Please try again." }, { status: 500 });
  }

  await supabaseAdmin.from("users").update({ status: "active", activated_at: new Date().toISOString() }).eq("id", invite.user_id);
  await supabaseAdmin.from("password_setup_tokens").update({ used_at: new Date().toISOString() }).eq("id", invite.id);

  return NextResponse.json({ ok: true, status: "success" });
}
