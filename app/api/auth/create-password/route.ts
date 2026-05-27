import { supabaseAdmin } from "@/lib/supabase-admin";
import { isStrongEnoughPassword } from "@/lib/auth/password-policy";
import { hashPasswordInviteToken } from "@/lib/security/password-invite";
import { verifyCaptcha } from "@/lib/security/verifyCaptcha";

export async function POST(request: Request) {
  const { token, password, captchaToken } = await request.json();
  const forwardedFor = request.headers.get("x-forwarded-for") || "";
  const remoteIp = forwardedFor.split(",")[0]?.trim() || undefined;

  const captcha = await verifyCaptcha(captchaToken, remoteIp);
  if (!captcha.success) {
    return Response.json(
      { error: "CAPTCHA verification failed. Please try again." },
      { status: 400 },
    );
  }

  if (!isStrongEnoughPassword(String(password || ""))) {
    return Response.json({ error: "Password does not meet minimum requirements (8+ chars with mixed complexity)." }, { status: 400 });
  }

  const tokenHash = hashPasswordInviteToken(String(token || ""));
  const { data } = await supabaseAdmin.from("password_setup_tokens").select("id, user_id, email, expires_at, used_at").eq("token_hash", tokenHash).maybeSingle();
  if (!data || data.used_at || new Date(data.expires_at).getTime() < Date.now()) {
    return Response.json({ error: "Invalid or expired token." }, { status: 400 });
  }

  if (data.user_id) {
    const updated = await supabaseAdmin.auth.admin.updateUserById(data.user_id, { password });
    if (updated.error) return Response.json({ error: updated.error.message }, { status: 400 });
    await supabaseAdmin.from("users").update({ status: "active", activated_at: new Date().toISOString() }).eq("id", data.user_id);
  }

  await supabaseAdmin.from("password_setup_tokens").update({ used_at: new Date().toISOString() }).eq("id", data.id);
  return Response.json({ success: true });
}
