import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import { normalizeZip } from "@/lib/geo/geo-area";
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
    const firstName = String(b.first_name || b.firstName || b.full_name || b.fullName || "").trim().split(/\s+/)[0] || "";
    const birthMonth = Number(b.birth_month || b.birthMonth);
    const zip = normalizeZip(b.zip_code || b.zipCode);
    const phone = String(b.mobile_number || b.phone || "").trim();
    const smsConsent = Boolean(phone && (b.sms_consent === true || b.marketing_sms_opt_in === true));
    const smsConsentAt = smsConsent ? new Date().toISOString() : null;
    const intendedPath = sanitizeIntendedPath(
      typeof b.next === "string" ? b.next : null,
    );
    const signupSource = b.signup_source === "mobile_app" ? "mobile_app" : "web";
    const expectedTurnstileAction =
      b.turnstileAction === "mobile_signup" ? "mobile_signup" : "signup";
    const isBusinessClaimSignup = Boolean(
      intendedPath && intendedPath.startsWith("/business/claim"),
    );
    const claimUrl =
      isBusinessClaimSignup && intendedPath
        ? new URL(intendedPath, "https://theouthaven.com")
        : null;
    const selectedLocationId = claimUrl?.searchParams.get("location") || null;
    const planInterval =
      claimUrl?.searchParams.get("plan") === "annual" ? "annual" : "monthly";
    const pendingBusinessClaim = isBusinessClaimSignup
      ? {
          selected_location_id: selectedLocationId,
          location_name: String(b.business_name || "").trim(),
          address: String(b.business_address || "").trim(),
          city: String(b.business_city || "").trim(),
          state: String(b.business_state || "").trim(),
          zip_code: String(b.business_zip || "").trim(),
          location_type: String(b.business_type || "").trim(),
          plan_interest: "pro",
          plan_interval: planInterval,
        }
      : null;

    if (!email || !password || !firstName || !zip || !Number.isInteger(birthMonth) || birthMonth < 1 || birthMonth > 12) {
      return NextResponse.json(
        { success: false, error: "Please complete the required account fields." },
        { status: 400 },
      );
    }
    if (
      isBusinessClaimSignup &&
      !selectedLocationId &&
      (!pendingBusinessClaim?.location_name ||
        !pendingBusinessClaim.address ||
        !pendingBusinessClaim.city ||
        !pendingBusinessClaim.state ||
        !pendingBusinessClaim.zip_code ||
        !pendingBusinessClaim.location_type)
    ) {
      return NextResponse.json(
        { success: false, error: "Please complete the business location details." },
        { status: 400 },
      );
    }

    const ts = await verifyTurnstileToken({
      token: b.turnstileToken,
      remoteIp: ip(req),
      expectedAction: expectedTurnstileAction,
      source: signupSource === "mobile_app" ? "mobile_signup" : "signup",
      metadata: { email, intendedPath, isBusinessClaimSignup, signupSource },
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
          first_name: firstName,
          birth_month: birthMonth,
          home_zip_code: zip,
          phone_e164: phone || null,
          sms_consent: smsConsent,
          account_type: accountType,
          business_claim_signup: isBusinessClaimSignup,
          pending_business_claim: pendingBusinessClaim,
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
          first_name: firstName,
          birth_month: birthMonth,
          home_zip_code: zip,
          phone_e164: phone || null,
          sms_consent: smsConsent,
          account_type: accountType,
          business_claim_signup:
            Boolean(user.user_metadata?.business_claim_signup) || isBusinessClaimSignup,
          pending_business_claim:
            pendingBusinessClaim || user.user_metadata?.pending_business_claim || null,
        },
      });
    }

    const userId = user.id;
    const { error: profileError } = await supabaseAdmin.from("consumer_profiles").upsert(
      {
        user_id: userId,
        first_name: firstName,
        phone_e164: phone || null,
        birth_month: birthMonth,
        home_zip_code: zip,
        sms_consent: smsConsent,
        sms_consent_at: smsConsentAt,
        sms_consent_source: smsConsent
          ? signupSource === "mobile_app" ? "mobile_account_signup" : "web_account_signup"
          : null,
        sms_consent_text: smsConsent
          ? "I agree to receive SMS messages from TheOutHaven about my account, saved plans, OUTing reminders, reservations, and optional offers."
          : null,
        personalization_enabled: true,
        updated_at: new Date().toISOString(),
      } as any,
      { onConflict: "user_id" },
    );
    if (profileError) {
      console.error("signup consumer profile failed", profileError);
      throw profileError;
    }

    const { error: userRowError } = await supabaseAdmin.from("users").upsert(
      {
        id: userId,
        email,
        role: "user",
      } as any,
      { onConflict: "id" },
    );
    if (userRowError) {
      console.error("signup users row failed", userRowError);
      throw userRowError;
    }

    const { token, expiresAt } = await createAuthEmailToken({
      email,
      userId,
      purpose: "signup_verify",
      expiresInMinutes: 60 * 24,
      request: req,
      metadata: {
        next: intendedPath,
        source: isBusinessClaimSignup
          ? "business_claim"
          : signupSource === "mobile_app" ? "mobile_signup" : "signup",
      },
    });

    const verifyPath = intendedPath
      ? `/auth/verify-email?token=${encodeURIComponent(token)}&next=${encodeURIComponent(intendedPath)}`
      : `/auth/verify-email?token=${encodeURIComponent(token)}`;
    const url = buildSiteUrl(verifyPath);
    const claimReturnUrl = isBusinessClaimSignup && intendedPath ? buildSiteUrl(intendedPath) : null;
    const greetingName = firstName || "there";

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
        ? `Hi ${greetingName},\n\nPlease verify your email to finish creating your TheOutHaven owner account. Your location claim link is saved, so you do not need to rescan the QR code.\n\nAfter verification, sign in and you will return to your claim page automatically.${claimReturnUrl ? `\n\nClaim page: ${claimReturnUrl}` : ""}\n\nThis verification link expires ${new Date(expiresAt).toLocaleString()}.\n\nIf you did not create a TheOutHaven account, you can ignore this email.`
        : `Hi ${greetingName},\n\nPlease verify your email to finish creating your TheOutHaven account. This link expires ${new Date(expiresAt).toLocaleString()}.\n\nIf you did not create a TheOutHaven account, you can ignore this email.`,
      cta: { label: isBusinessClaimSignup ? "Verify email and continue claim" : "Verify Email", url },
    });

    return NextResponse.json({
      success: true,
      requiresEmailConfirmation: true,
      email,
      next: intendedPath,
      signupSource,
      userId,
    });
  } catch (e: any) {
    console.error("SIGNUP_ERROR", e);
    return NextResponse.json(
      { success: false, error: "We could not create your account right now." },
      { status: 500 },
    );
  }
}
