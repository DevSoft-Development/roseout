import { supabaseAdmin } from "@/lib/supabase-admin";
import { createAuthEmailToken, getAuthEmailCooldownSeconds } from "@/lib/auth/authEmailTokens";
import { sendRawBrandedEmail } from "@/lib/email/sender";
import { buildSiteUrl } from "@/lib/site-url";

function clean(value: unknown) {
  return String(value || "").trim();
}

async function verifyTurnstile(token: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return false;
  const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token }),
  });
  const verifyData = await verifyRes.json();
  return Boolean(verifyData?.success);
}

async function findUserByEmail(email: string) {
  let page = 1;
  while (page <= 10) {
    const listed = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (listed.error) throw listed.error;
    const found = listed.data.users?.find((user) => user.email?.toLowerCase() === email) || null;
    if (found) return found;
    if (!listed.data.users || listed.data.users.length < 1000) return null;
    page += 1;
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = clean(body.email).toLowerCase();
    const captchaToken = clean(body.captchaToken);
    const mobileRecovery = body.mobile === true || body.client === "mobile_app";
    const client = clean(body.client).toLowerCase();

    if (!email) {
      return Response.json({ success: false, error: "Please enter your email address." }, { status: 400 });
    }
    if (!captchaToken) {
      return Response.json({ success: false, error: "Please complete the security check." }, { status: 400 });
    }
    if (!(await verifyTurnstile(captchaToken))) {
      return Response.json({ success: false, error: "Security verification failed. Please try again." }, { status: 400 });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return Response.json({
        success: true,
        requestAccepted: true,
        cooldownSeconds: 60,
      });
    }

    const cooldownSeconds = await getAuthEmailCooldownSeconds({
      email,
      purpose: "password_reset",
      cooldownSeconds: 60,
    });
    if (cooldownSeconds > 0) {
      return Response.json({
        success: true,
        requestAccepted: true,
        cooldownSeconds,
        cooldownActive: true,
      });
    }

    const { token, expiresAt } = await createAuthEmailToken({
      email,
      userId: user.id,
      purpose: "password_reset",
      expiresInMinutes: 60,
      request: req,
    });
    const url = client === "mobile_app"
      ? `theouthaven://auth/reset-password?token=${encodeURIComponent(token)}`
      : buildSiteUrl(`/reset-password?token=${encodeURIComponent(token)}`);
    const emailResult = await sendRawBrandedEmail({
      to: email,
      department: "account",
      subject: "Reset your TheOutHaven password",
      heading: "Reset your password",
      preview: "Use this secure link to reset your TheOutHaven password.",
      body: `Use the secure link below to reset your TheOutHaven password. This link expires ${new Date(expiresAt).toLocaleString()}.\n\n${client === "mobile_app" ? "This reset was requested in the TheOutHaven app. Tap the button below to return to the app and choose a new password.\n\n" : ""}If you did not request a password reset, you can ignore this email.`,
      cta: { label: "Reset Password", url },
    });

    if (emailResult.status !== "sent") {
      console.error("PASSWORD_RESET_EMAIL_FAILED", {
        email,
        status: emailResult.status,
        error: emailResult.error || null,
      });
      return Response.json(
        { success: false, error: "We could not send the password reset email right now." },
        { status: 502 },
      );
    }

    return Response.json({
      success: true,
      requestAccepted: true,
      passwordResetEmailSent: true,
      cooldownSeconds: 60,
    });
  } catch (error) {
    console.error("FORGOT_PASSWORD_ERROR", error);
    return Response.json(
      { success: false, error: "We could not send the password reset email right now." },
      { status: 500 },
    );
  }
}
