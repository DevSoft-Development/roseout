export async function verifyCaptcha(token: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    return { ok: process.env.NODE_ENV !== "production", error: "CAPTCHA is not configured." };
  }
  if (!token) return { ok: false, error: "CAPTCHA token is required." };

  const body = new URLSearchParams({ secret, response: token });
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
  });
  const data = (await response.json()) as { success?: boolean };
  return { ok: !!data.success, error: data.success ? undefined : "CAPTCHA failed." };
}
