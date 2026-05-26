import { supabaseAdmin } from "@/lib/supabase-admin";
import { hashPasswordInviteToken } from "@/lib/security/password-invite";

export async function POST(request: Request) {
  const { token } = await request.json();
  if (!token) return Response.json({ valid: false, status: "invalid" });
  const tokenHash = hashPasswordInviteToken(String(token));
  const { data } = await supabaseAdmin.from("password_setup_tokens").select("email, role, expires_at, used_at").eq("token_hash", tokenHash).eq("purpose", "create_password").maybeSingle();
  if (!data) return Response.json({ valid: false, status: "invalid" });
  if (data.used_at) return Response.json({ valid: false, status: "used" });
  if (new Date(data.expires_at).getTime() < Date.now()) return Response.json({ valid: false, status: "expired" });
  return Response.json({ valid: true, status: "valid", email: data.email.replace(/(.{2}).+(@.+)/, "$1***$2"), role: data.role });
}
