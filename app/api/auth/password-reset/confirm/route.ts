import { sendNotification } from "@/lib/notifications";
import {
  PASSWORD_RESET_GENERIC_ERROR,
  getClientIp,
  hashPasswordResetToken,
  isValidPasswordResetToken,
} from "@/lib/passwordReset";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

function isValidPassword(password: unknown) {
  return typeof password === "string" && password.length >= 8;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatPasswordChangedTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "long",
    timeZone: "UTC",
  }).format(date);
}

async function revokeUserSessions(userId: string) {
  const { error } = await supabaseAdmin.rpc("revoke_user_sessions", {
    target_user_id: userId,
  });

  if (error) {
    throw error;
  }
}

export async function POST(request: Request) {
  const body = await request.json();
  const token = body.token;
  const password = body.password;
  const ipAddress = getClientIp(request);
  const userAgent = request.headers.get("user-agent") || "Unknown device";

  if (!isValidPasswordResetToken(token) || !isValidPassword(password)) {
    return Response.json({ error: PASSWORD_RESET_GENERIC_ERROR }, { status: 400 });
  }

  const tokenHash = hashPasswordResetToken(token);
  const now = new Date();
  const nowIso = now.toISOString();

  const { data: resetToken, error: tokenError } = await supabaseAdmin
    .from("password_reset_tokens")
    .select("id, user_id, email, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .is("used_at", null)
    .gt("expires_at", nowIso)
    .maybeSingle();

  if (tokenError) {
    console.error("Password reset token lookup failed", tokenError);
    return Response.json({ error: PASSWORD_RESET_GENERIC_ERROR }, { status: 500 });
  }

  if (!resetToken?.user_id) {
    return Response.json({ error: PASSWORD_RESET_GENERIC_ERROR }, { status: 400 });
  }

  const { data: userData, error: userError } =
    await supabaseAdmin.auth.admin.getUserById(resetToken.user_id);

  if (userError || !userData.user) {
    console.error("Password reset user lookup failed", userError);
    return Response.json({ error: PASSWORD_RESET_GENERIC_ERROR }, { status: 400 });
  }

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
    resetToken.user_id,
    { password }
  );

  if (updateError) {
    console.error("Password reset update failed", updateError);
    return Response.json({ error: PASSWORD_RESET_GENERIC_ERROR }, { status: 500 });
  }

  await supabaseAdmin
    .from("password_reset_tokens")
    .update({ used_at: nowIso })
    .eq("user_id", resetToken.user_id)
    .is("used_at", null);

  try {
    await revokeUserSessions(resetToken.user_id);
  } catch (error) {
    console.error("Password reset session revocation failed", error);
    return Response.json({ error: PASSWORD_RESET_GENERIC_ERROR }, { status: 500 });
  }

  const safeIpAddress = escapeHtml(ipAddress);
  const safeUserAgent = escapeHtml(userAgent);

  await sendNotification({
    toEmail: resetToken.email || userData.user.email,
    subject: "Your TheOutHaven password was changed",
    emailHtml: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
        <h2>Your TheOutHaven password was changed</h2>
        <p>Your password was changed at <strong>${formatPasswordChangedTime(now)}</strong>.</p>
        <p>Request IP: <strong>${safeIpAddress}</strong></p>
        <p>Device: <strong>${safeUserAgent}</strong></p>
        <p>If you did not make this change, contact TheOutHaven support immediately.</p>
      </div>
    `,
  });

  return Response.json({ success: true });
}
