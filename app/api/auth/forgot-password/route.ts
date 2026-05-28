import { supabaseAdmin } from "@/lib/supabase-admin";

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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = clean(body.email).toLowerCase();
    const captchaToken = clean(body.captchaToken);

    if (!email) {
      return Response.json({ error: "Please enter your email address." }, { status: 400 });
    }

    if (!captchaToken) {
      return Response.json({ error: "Please complete the CAPTCHA." }, { status: 400 });
    }

    const captchaOk = await verifyTurnstile(captchaToken);
    if (!captchaOk) {
      return Response.json({ error: "CAPTCHA verification failed." }, { status: 400 });
    }

    await supabaseAdmin.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || ""}/reset-password`,
    });

    return Response.json({ success: true });
  } catch (error: unknown) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Server error" },
      { status: 500 }
    );
  }
}
