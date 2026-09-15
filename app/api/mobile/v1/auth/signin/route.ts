import { NextRequest } from "next/server";
import { mobileError, mobileJson } from "@/app/api/mobile/v1/_lib/response";
import { mobileAuthClient, requireMobileAuthTurnstile } from "@/app/api/mobile/v1/auth/_lib";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || !password) return mobileError("invalid_credentials", "Email and password are required.", 400);

  const challenge = await requireMobileAuthTurnstile(req, body.turnstileToken, "mobile_signin");
  if (!challenge.success) return mobileError("turnstile_failed", challenge.error, challenge.status);

  try {
    const client = mobileAuthClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session) return mobileError("signin_failed", "Email or password is incorrect.", 401);
    return mobileJson({
      ok: true,
      session: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
      },
    });
  } catch {
    return mobileError("signin_unavailable", "Sign in is temporarily unavailable. Please try again.", 503);
  }
}
