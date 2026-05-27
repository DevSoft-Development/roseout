export async function verifyCaptcha(captchaToken: string | null | undefined, remoteIp?: string) {
  if (!captchaToken) {
    return { success: false, error: "Missing CAPTCHA token." };
  }

  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    if (process.env.NODE_ENV !== "production") {
      return { success: false, error: "TURNSTILE_SECRET_KEY is not configured." };
    }

    return { success: false, error: "CAPTCHA is not configured." };
  }

  const formData = new FormData();
  formData.append("secret", secret);
  formData.append("response", captchaToken);
  if (remoteIp) formData.append("remoteip", remoteIp);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    return { success: false, error: "CAPTCHA verification failed. Please try again." };
  }

  const result = (await response.json()) as { success?: boolean };

  if (!result.success) {
    return { success: false, error: "CAPTCHA verification failed. Please try again." };
  }

  return { success: true };
}
