import { NextRequest } from "next/server";
import { mobileError, mobileJson } from "@/app/api/mobile/v1/_lib/response";
import {
  mobileAuthClient,
  normalizeUsPhone,
  requireMobileAuthTurnstile,
  saveConsumerProfile,
} from "@/app/api/mobile/v1/auth/_lib";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const phoneE164 = normalizeUsPhone(body.phone);
  const birthMonth = Number(body.birthMonth);
  const smsConsent = body.smsConsent === true;

  if (!email || password.length < 8) return mobileError("invalid_signup", "Enter a valid email and a password with at least 8 characters.", 400);
  if (!phoneE164) return mobileError("invalid_phone", "Enter a valid 10-digit mobile number.", 400);
  if (!Number.isInteger(birthMonth) || birthMonth < 1 || birthMonth > 12) return mobileError("invalid_birth_month", "Choose your birth month.", 400);

  const challenge = await requireMobileAuthTurnstile(req, body.turnstileToken, "mobile_signup");
  if (!challenge.success) return mobileError("turnstile_failed", challenge.error, challenge.status);

  try {
    const client = mobileAuthClient();
    const { data, error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: {
          phone_e164: phoneE164,
          birth_month: birthMonth,
          sms_consent: smsConsent,
          signup_source: "mobile_app",
        },
      },
    });
    if (error) return mobileError("signup_failed", error.message, 400);
    if (!data.user) return mobileError("signup_failed", "We could not create your account. Please try again.", 400);

    await saveConsumerProfile({ userId: data.user.id, phoneE164, birthMonth, smsConsent });

    return mobileJson({
      ok: true,
      requiresEmailConfirmation: !data.session,
      session: data.session ? {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
      } : null,
    });
  } catch {
    return mobileError("signup_unavailable", "Account creation is temporarily unavailable. Please try again.", 503);
  }
}
