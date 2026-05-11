import {
  hashPasswordResetToken,
  isValidPasswordResetToken,
} from "@/lib/passwordReset";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function isValidPassword(password: unknown) {
  return typeof password === "string" && password.length >= 8;
}

export async function POST(request: Request) {
  const body = await request.json();
  const token = body.token;
  const password = body.password;

  if (!isValidPasswordResetToken(token) || !isValidPassword(password)) {
    return Response.json(
      { error: "Invalid or expired reset link." },
      { status: 400 }
    );
  }

  const tokenHash = hashPasswordResetToken(token);
  const now = new Date().toISOString();

  const { data: resetToken, error: tokenError } = await supabaseAdmin
    .from("password_reset_tokens")
    .select("id, user_id, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .is("used_at", null)
    .gt("expires_at", now)
    .maybeSingle();

  if (tokenError) {
    console.error("Password reset token lookup failed", tokenError);
    return Response.json(
      { error: "Could not reset password. Please request a new link." },
      { status: 500 }
    );
  }

  if (!resetToken?.user_id) {
    return Response.json(
      { error: "Invalid or expired reset link." },
      { status: 400 }
    );
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
    resetToken.user_id,
    { password }
  );

  if (updateError) {
    console.error("Password reset update failed", updateError);
    return Response.json(
      { error: "Could not reset password. Please request a new link." },
      { status: 500 }
    );
  }

  await supabaseAdmin
    .from("password_reset_tokens")
    .update({ used_at: now })
    .eq("id", resetToken.id);

  return Response.json({ success: true });
}
