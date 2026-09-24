import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createAuthEmailToken, getAuthEmailCooldownSeconds } from "@/lib/auth/authEmailTokens";
import { sendRawBrandedEmail } from "@/lib/email/sender";
import { buildSiteUrl } from "@/lib/site-url";

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    if (!email) {
      return NextResponse.json({ success: false, error: "Enter your email address." }, { status: 400 });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return NextResponse.json({ success: false, error: "We could not find an account for this email." }, { status: 404 });
    }
    if (user.email_confirmed_at) {
      return NextResponse.json({ success: true, alreadyVerified: true, email, cooldownSeconds: 0 });
    }

    const cooldownSeconds = await getAuthEmailCooldownSeconds({
      email,
      purpose: "signup_verify",
      cooldownSeconds: 60,
    });
    if (cooldownSeconds > 0) {
      return NextResponse.json(
        {
          success: false,
          code: "email_cooldown",
          error: `Please wait ${cooldownSeconds} seconds before sending another verification email.`,
          cooldownSeconds,
          email,
        },
        { status: 429 },
      );
    }

    const { token, expiresAt } = await createAuthEmailToken({
      email,
      userId: user.id,
      purpose: "signup_verify",
      expiresInMinutes: 60 * 24,
      request: req,
      metadata: { source: "signup_verification_resend" },
    });

    const url = buildSiteUrl(`/auth/verify-email?token=${encodeURIComponent(token)}`);
    const firstName = String(user.user_metadata?.first_name || "there").trim() || "there";
    const result = await sendRawBrandedEmail({
      to: email,
      department: "account",
      subject: "Verify your email for TheOutHaven",
      heading: "Verify your email",
      preview: "Verify your email to finish activating your TheOutHaven account.",
      body: `Hi ${firstName},\n\nPlease verify your email to finish activating your TheOutHaven account. This link expires ${new Date(expiresAt).toLocaleString()}.\n\nIf you did not create a TheOutHaven account, you can ignore this email.`,
      cta: { label: "Verify Email", url },
    });

    if (result.status !== "sent") {
      return NextResponse.json(
        { success: false, error: "We could not resend the verification email right now." },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true, verificationEmailSent: true, email, cooldownSeconds: 60 });
  } catch (error) {
    console.error("RESEND_SIGNUP_VERIFICATION_ERROR", error);
    return NextResponse.json(
      { success: false, error: "We could not resend the verification email right now." },
      { status: 500 },
    );
  }
}
