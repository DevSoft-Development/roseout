import { sendNotification } from "@/lib/notifications";
import {
  PASSWORD_RESET_ACCOUNT_ATTEMPTS_PER_HOUR,
  PASSWORD_RESET_IP_ATTEMPTS_PER_HOUR,
  PASSWORD_RESET_PUBLIC_MESSAGE,
  PASSWORD_RESET_SUSPICIOUS_IP_ATTEMPTS_PER_HOUR,
  generatePasswordResetToken,
  getClientIp,
  getHttpsSiteUrl,
  getPasswordResetExpiresAt,
  hashPasswordResetToken,
  normalizeResetEmail,
  verifyTurnstileToken,
} from "@/lib/passwordReset";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";

type RateEntry = {
  count: number;
  resetAt: number;
};

const ONE_HOUR_MS = 60 * 60 * 1000;
const memoryRateLimits = new Map<string, RateEntry>();

function isMemoryRateLimited(key: string, limit: number) {
  const now = Date.now();
  const entry = memoryRateLimits.get(key);

  if (!entry || entry.resetAt <= now) {
    memoryRateLimits.set(key, { count: 1, resetAt: now + ONE_HOUR_MS });
    return false;
  }

  entry.count += 1;
  return entry.count > limit;
}

async function logResetAttempt(input: {
  email: string;
  ipAddress: string;
  userAgent: string | null;
  status: string;
  userId?: string | null;
}) {
  await supabaseAdmin.from("password_reset_attempts").insert({
    email: input.email || null,
    ip_address: input.ipAddress,
    user_agent: input.userAgent,
    status: input.status,
    user_id: input.userId || null,
  });
}

async function countRecentAttempts(column: "email" | "ip_address", value: string) {
  if (!value) return 0;

  const since = new Date(Date.now() - ONE_HOUR_MS).toISOString();
  const { count, error } = await supabaseAdmin
    .from("password_reset_attempts")
    .select("id", { count: "exact", head: true })
    .eq(column, value)
    .gte("created_at", since);

  if (error) {
    throw error;
  }

  return count || 0;
}

async function isRateLimited(email: string, ipAddress: string) {
  try {
    const [accountAttempts, ipAttempts] = await Promise.all([
      countRecentAttempts("email", email),
      countRecentAttempts("ip_address", ipAddress),
    ]);

    return (
      accountAttempts >= PASSWORD_RESET_ACCOUNT_ATTEMPTS_PER_HOUR ||
      ipAttempts >= PASSWORD_RESET_IP_ATTEMPTS_PER_HOUR
    );
  } catch (error) {
    console.error("Password reset DB rate limit check failed", error);

    return (
      isMemoryRateLimited(
        `email:${email}`,
        PASSWORD_RESET_ACCOUNT_ATTEMPTS_PER_HOUR
      ) ||
      isMemoryRateLimited(`ip:${ipAddress}`, PASSWORD_RESET_IP_ATTEMPTS_PER_HOUR)
    );
  }
}

async function shouldRequireCaptcha(ipAddress: string) {
  try {
    return (
      (await countRecentAttempts("ip_address", ipAddress)) >=
      PASSWORD_RESET_SUSPICIOUS_IP_ATTEMPTS_PER_HOUR
    );
  } catch (error) {
    console.error("Password reset captcha threshold check failed", error);
    return isMemoryRateLimited(
      `captcha:${ipAddress}`,
      PASSWORD_RESET_SUSPICIOUS_IP_ATTEMPTS_PER_HOUR
    );
  }
}

async function findUserIdByEmail(email: string) {
  let page = 1;
  const perPage = 1000;

  while (page <= 10) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw error;
    }

    const user = data.users.find(
      (candidate) => candidate.email?.toLowerCase() === email
    );

    if (user?.id) {
      return user.id;
    }

    if (data.users.length < perPage) {
      return null;
    }

    page += 1;
  }

  return null;
}

export async function POST(request: Request) {
  const ipAddress = getClientIp(request);
  const userAgent = request.headers.get("user-agent");
  let email = "";

  try {
    const body = await request.json();
    email = normalizeResetEmail(body.email || body.username);

    const captchaRequired = await shouldRequireCaptcha(ipAddress);

    if (captchaRequired) {
      const captchaValid = await verifyTurnstileToken(
        body.captchaToken,
        ipAddress
      );

      if (!captchaValid) {
        try {
          await logResetAttempt({
            email,
            ipAddress,
            userAgent,
            status: "captcha_required",
          });
        } catch (error) {
          console.error("Password reset attempt log failed", error);
        }

        return Response.json({
          message: PASSWORD_RESET_PUBLIC_MESSAGE,
          captchaRequired: true,
        });
      }
    }

    const limited = await isRateLimited(email, ipAddress);

    if (limited) {
      try {
        await logResetAttempt({
          email,
          ipAddress,
          userAgent,
          status: "rate_limited",
        });
      } catch (error) {
        console.error("Password reset attempt log failed", error);
      }

      return Response.json({ message: PASSWORD_RESET_PUBLIC_MESSAGE });
    }

    const userId = email ? await findUserIdByEmail(email) : null;

    if (!userId) {
      try {
        await logResetAttempt({
          email,
          ipAddress,
          userAgent,
          status: "account_not_found",
        });
      } catch (error) {
        console.error("Password reset attempt log failed", error);
      }

      return Response.json({ message: PASSWORD_RESET_PUBLIC_MESSAGE });
    }

    const baseUrl = getHttpsSiteUrl(request);
    const token = generatePasswordResetToken();
    const tokenHash = hashPasswordResetToken(token);
    const expiresAt = getPasswordResetExpiresAt();

    await supabaseAdmin
      .from("password_reset_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("used_at", null);

    await supabaseAdmin.from("password_reset_tokens").insert({
      user_id: userId,
      email,
      token_hash: tokenHash,
      expires_at: expiresAt,
      request_ip: ipAddress,
      request_user_agent: userAgent,
    });

    const resetUrl = `${baseUrl}/reset-password?token=${token}`;

    const notification = await sendNotification({
      toEmail: email,
      subject: "Reset your TheOutHaven password",
      emailHtml: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
          <h2>Reset your TheOutHaven password</h2>
          <p>Use the secure link below to choose a new password. This link expires in 30 minutes.</p>
          <p><a href="${resetUrl}" style="background:#e1062a;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:bold;">Reset password</a></p>
          <p>If you did not request this password reset, you can ignore this email.</p>
        </div>
      `,
    });

    await logResetAttempt({
      email,
      ipAddress,
      userAgent,
      status: !process.env.RESEND_API_KEY
        ? "email_unconfigured"
        : notification.errors.length
          ? "email_failed"
          : "sent",
      userId,
    });
  } catch (error) {
    console.error("Password reset request failed", error);

    try {
      await logResetAttempt({
        email,
        ipAddress,
        userAgent,
        status: "error",
      });
    } catch (logError) {
      console.error("Password reset attempt log failed", logError);
    }
  }

  return Response.json({ message: PASSWORD_RESET_PUBLIC_MESSAGE });
}
