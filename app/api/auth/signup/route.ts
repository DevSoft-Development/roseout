import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import { getZipMarketMapping } from "@/lib/zip-market-mapping";
import { createAuthEmailToken } from "@/lib/auth/authEmailTokens";
import { sanitizeIntendedPath } from "@/lib/auth-redirect";
import { sendRawBrandedEmail } from "@/lib/email/sender";
import { buildSiteUrl } from "@/lib/site-url";

function ip(req: NextRequest) {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null
  );
}

export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({}));
    const email = String(b.email || "").trim().toLowerCase();
    const password = String(b.password || "");
    const fullName = String(b.full_name || b.fullName || "").trim();
    const zip = String(b.zip_code || b.zipCode || "").trim();
    const phone = String(b.mobile_number || b.phone || "").trim();
    const intendedPath = sanitizeIntendedPath(
      typeof b.next === "string" ? b.next : null,
    );
    const isBusinessClaimSignup = Boolean(
      intendedPath && intendedPath.startsWith("/business/claim"),
    );

    if (!email || !password || !fullName || !zip) {
      return NextResponse.json(
        { success: false, error: "Please complete the required account fields." },
        { status: 400 },
      );
    }

    const derived = getZipMarketMapping(zip);
    if (!derived) {
      return NextResponse.json(
        { success: false, error: "Please enter a valid 5-digit ZIP code." },
        { status: 400 },
      );
    }

    const ts = await verifyTurnstileToken({
      token: b.turnstileToken,
      remoteIp: ip(req),
      expectedAction: "signup",
      source: "signup",
      metadata: { email, intendedPath, isBusinessClaimSignup },
    });
    if (!ts.success) {
      return NextResponse.json(
        { success: false, error: "Security check failed. Please try again." },
        { status: 400 },
      );
    }

    const listed = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listed.error) throw listed.error;

    const existing = listed.data.users?.find((u) => u.email?.toLowerCase() === email);
    if (existing?.email_confirmed_at) {
      return NextResponse.json(
        { success: false, error: "An account with this email already exists. Please log in or reset your password." },
        { status: 400 },
      );
    }

    const accountType = isBusinessClaimSignup ? "business_owner" : "user";
    let user = existing || null;

    if (!user) {
      const created = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: false,
        user_metadata: {
          role: "user",
          full_name: fullName,
          account_type: accountType,
          business_claim_signup: isBusinessClaimSignup,
        },
      });
      if (created.error || !created.data.user) {
        return NextResponse.json(
          { success: false, error: created.error?.message || "Account could not be created." },
          { status: 400 },
        );
      }
      user = created.data.user;
    } else {
      await supabaseAdmin.auth.admin.updateUserById(user.id, {
        password,
        user_metadata: {
          ...(user.user_metadata || {}),
          role: user.user_metadata?.role || "user",
          full_name: fullName,
          account_type: accountType,
          business_claim_signup:
            Boolean(user.user_metadata?.business_claim_signup) || isBusinessClaimSignup,
        },
      });
    }

    const userId = user.id;
    const { error: profileError } = await supabaseAdmin.from("user_profiles").upsert(
      {
        id: userId,
        full_name: fullName,
        preferred_name: fullName.split(" ")[0] || fullName,
        email,
        mobile_number: phone || null,
        phone: phone || null,
        zip_code: zip,
        derived_city: derived.city,
        derived_state: derived.state,
        derived_market_area: derived.marketArea,
        sms_opt_in: Boolean(phone && b.sms_opt_in),
        sms_opt_in_at: phone && b.sms_opt_in ? new Date().toISOString() : null,
        plan: "registered",
        weekly_search_limit: 3,
        preferences: {},
        email_verified: false,
        account_type: accountType,
      } as any,
      { onConflict: "id" },
    );
    if (profileError) console.error("signup profile failed", profileError);

    try {
      await supabaseAdmin.from("users").upsert(
        {
          id: userId,
          email,
          full_name: fullName,
          phone: phone || null,
          role: "user",
          account_type: accountType,
          email_verified: false,
        } as any,
        { onConflict: "id" },
      );
    } catch {}

    const { token, expiresAt } = await createAuthEmailToken({
      email,
      userId,
      purpose: "signup_verify",
      expiresInMinutes: 60 * 24,
      request: req,
      metadata: {
        next: intendedPath,
        source: isBusinessClaimSignup ? "business_claim" : "signup",
      },
    });

    const verifyPath = intendedPath
      ? `/auth/verify-email?token=${encodeURIComponent(token)}&next=${encodeURIComponent(intendedPath)}`
      : `/auth/verify-email?token=${encodeURIComponent(token)}`;
    const url = buildSiteUrl(verifyPath);
    const claimReturnUrl = isBusinessClaimSignup && intendedPath ? buildSiteUrl(intendedPath) : null;
    const firstName = fullName.split(/\s+/)[0] || "there";

    await sendRawBrandedEmail({
      to: email,
      department: "account",
      subject: isBusinessClaimSignup
        ? "Verify your email to continue your TheOutHaven business claim"
        : "Verify your email for TheOutHaven",
      heading: isBusinessClaimSignup ? "Verify your email and continue your claim" : "Verify your email",
      preview: isBusinessClaimSignup
        ? "Your claim code is saved. Verify your email, then return to your location claim."
        : "Verify your email to finish creating your TheOutHaven account.",
      body: isBusinessClaimSignup
        ? `Hi ${firstName},

Please verify your email to finish creating your TheOutHaven owner account. Your location claim link is saved, so you do not need to rescan the QR code.

After verification, sign in and you will return to your claim page automatically.${claimReturnUrl ? `

Claim page: ${claimReturnUrl}` : ""}

This verification link expires ${new Date(expiresAt).toLocaleString()}.

If you did not create a TheOutHaven account, you can ignore this email.`
        : `Hi ${firstName},

Please verify your email to finish creating your TheOutHaven account. This link expires ${new Date(expiresAt).toLocaleString()}.

If you did not create a TheOutHaven account, you can ignore this email.`,
      cta: { label: isBusinessClaimSignup ? "Verify email and continue claim" : "Verify Email", url },
    });

    return NextResponse.json({
      success: true,
      requiresEmailConfirmation: true,
      email,
      next: intendedPath,
    });
  } catch (e: any) {
    console.error("SIGNUP_ERROR", e);
    return NextResponse.json(
      { success: false, error: "We could not create your account right now." },
      { status: 500 },
    );
  }
}
