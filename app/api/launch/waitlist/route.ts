import { createHash, randomBytes } from "crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { sendRawBrandedEmail } from "@/lib/email/sender";
import { buildSiteUrl } from "@/lib/site-url";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isTurnstileEnabled, verifyTurnstileToken } from "@/lib/security/turnstile";

const CONSENT_TEXT =
  "I agree to receive email and SMS updates from TheOutHaven about launch updates, giveaway details, early access, and outing ideas. Message and data rates may apply. Message frequency may vary. Reply STOP to unsubscribe from texts. I can unsubscribe from emails at any time.";

const DUPLICATE_SOCIAL_MESSAGE =
  "This social handle is already connected to another giveaway entry. Please use the same email you signed up with or enter a different handle.";

type SignupRow = {
  id: string;
  email: string;
  email_verified: boolean | null;
  wants_giveaway: boolean | null;
  giveaway_status: string | null;
  email_verification_attempts: number | null;
};

type RequestBody = {
  fullName?: unknown;
  email?: unknown;
  phone?: unknown;
  socialHandle?: unknown;
  socialPlatform?: unknown;
  usuallyGoOutArea?: unknown;
  wantsGiveaway?: unknown;
  followedSocial?: unknown;
  taggedTwoFriends?: unknown;
  marketingConsent?: unknown;
  turnstileToken?: unknown;
  referrer?: unknown;
  giveawayPostUrl?: unknown;
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown) {
  return cleanText(value).toLowerCase();
}

function normalizeSocialHandle(value: unknown) {
  const trimmed = cleanText(value).replace(/^@+/, "");
  return trimmed ? `@${trimmed}` : "";
}

function normalizePlatform(value: unknown) {
  const platform = cleanText(value).toLowerCase();
  return ["instagram", "tiktok", "both"].includes(platform) ? platform : "";
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function getIp(headerStore: Awaited<ReturnType<typeof headers>>) {
  return (
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headerStore.get("x-real-ip") ||
    null
  );
}

function platformsConflict(incoming: string, existing: string | null) {
  if (!existing) return false;
  if (incoming === "both") return ["instagram", "tiktok", "both"].includes(existing);
  if (incoming === "instagram") return existing === "instagram" || existing === "both";
  if (incoming === "tiktok") return existing === "tiktok" || existing === "both";
  return false;
}

async function logDuplicateEvent(input: {
  signupId?: string | null;
  attemptedEmail: string;
  attemptedSocialHandle?: string | null;
  attemptedSocialPlatform?: string | null;
  conflictType: string;
  conflictSignupId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  await supabaseAdmin.from("launch_waitlist_duplicate_events").insert({
    signup_id: input.signupId ?? null,
    attempted_email: input.attemptedEmail,
    attempted_social_handle: input.attemptedSocialHandle ?? null,
    attempted_social_platform: input.attemptedSocialPlatform ?? null,
    conflict_type: input.conflictType,
    conflict_signup_id: input.conflictSignupId ?? null,
    source: "launch_waitlist",
    ip_address: input.ipAddress ?? null,
    user_agent: input.userAgent ?? null,
    metadata: {},
  });
}

async function sendVerificationEmail(params: { email: string; fullName: string; token: string }) {
  const url = buildSiteUrl(`/launch/verify?token=${encodeURIComponent(params.token)}`);
  await sendRawBrandedEmail({
    to: params.email,
    department: "account",
    subject: "Verify your email for TheOutHaven Launch Giveaway",
    heading: "Verify your email",
    preview: "You're almost entered. Verify your email for TheOutHaven Launch Giveaway.",
    body: `Hi ${params.fullName},<br><br>You're almost entered.<br><br>Thanks for joining TheOutHaven Launch List. Please verify your email to complete your entry for a chance to win a $100 gift card.<br><br>Tap the button below to verify your email.<br><br>This verification link expires in 24 hours.<br><br>After verifying, make sure you follow @TheOutHaven on Instagram or TikTok and tag 2 friends in the giveaway post comments.`,
    cta: { label: "Verify Email", url },
  });
}

export async function POST(request: Request) {
  const headerStore = await headers();
  const ipAddress = getIp(headerStore);
  const userAgent = headerStore.get("user-agent");
  const body = (await request.json().catch(() => ({}))) as RequestBody;

  const fullName = cleanText(body.fullName);
  const email = normalizeEmail(body.email);
  const phone = cleanText(body.phone);
  const usuallyGoOutArea = cleanText(body.usuallyGoOutArea);
  const wantsGiveaway = typeof body.wantsGiveaway === "boolean" ? body.wantsGiveaway : true;
  const socialHandle = wantsGiveaway ? normalizeSocialHandle(body.socialHandle) : "";
  const socialPlatform = wantsGiveaway ? normalizePlatform(body.socialPlatform) : "";
  const followedSocial = wantsGiveaway ? Boolean(body.followedSocial) : false;
  const taggedTwoFriends = wantsGiveaway ? Boolean(body.taggedTwoFriends) : false;
  const marketingConsent = Boolean(body.marketingConsent);
  const referrer = cleanText(body.referrer);
  const giveawayPostUrl = cleanText(body.giveawayPostUrl);

  if (fullName.length < 2 || fullName.length > 120) {
    return NextResponse.json({ success: false, message: "Please enter your name." }, { status: 400 });
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ success: false, message: "Please enter a valid email address." }, { status: 400 });
  }
  if (!marketingConsent) {
    return NextResponse.json({ success: false, message: "Please agree to the launch list and giveaway terms to continue." }, { status: 400 });
  }
  if (wantsGiveaway && !socialHandle) {
    return NextResponse.json({ success: false, message: "Please enter your Instagram or TikTok handle to join the giveaway." }, { status: 400 });
  }
  if (wantsGiveaway && !socialPlatform) {
    return NextResponse.json({ success: false, message: "Please choose Instagram, TikTok, or Both." }, { status: 400 });
  }

  let turnstileVerified = !isTurnstileEnabled();
  let turnstileHostname: string | null = null;
  if (isTurnstileEnabled()) {
    const token = cleanText(body.turnstileToken);
    if (!token) {
      return NextResponse.json({ success: false, message: "Please complete the verification before submitting." }, { status: 400 });
    }

    const turnstile = await verifyTurnstileToken({
      token,
      remoteIp: ipAddress,
      expectedAction: "launch_waitlist",
      source: "launch_waitlist",
      metadata: { fullName, email, socialHandle, socialPlatform, wantsGiveaway, route: "/api/launch/waitlist" },
    });
    if (!turnstile.success) {
      return NextResponse.json({ success: false, message: "Verification failed. Please refresh and try again." }, { status: 400 });
    }
    turnstileVerified = true;
    turnstileHostname = turnstile.hostname ?? null;
  }

  const { data: existing } = await supabaseAdmin
    .from("launch_waitlist_signups")
    .select("id,email,email_verified,wants_giveaway,giveaway_status,email_verification_attempts")
    .eq("email", email)
    .maybeSingle<SignupRow>();

  if (wantsGiveaway && socialHandle) {
    const { data: handleMatches } = await supabaseAdmin
      .from("launch_waitlist_signups")
      .select("id,email,social_platform")
      .eq("wants_giveaway", true)
      .ilike("social_handle", socialHandle);
    const conflict = (handleMatches || []).find((row) => row.email !== email && platformsConflict(socialPlatform, row.social_platform));
    if (conflict) {
      await logDuplicateEvent({
        signupId: existing?.id ?? null,
        attemptedEmail: email,
        attemptedSocialHandle: socialHandle,
        attemptedSocialPlatform: socialPlatform,
        conflictType: "social_handle_platform_conflict",
        conflictSignupId: conflict.id,
        ipAddress,
        userAgent,
      }).catch(() => undefined);
      return NextResponse.json({ success: false, message: DUPLICATE_SOCIAL_MESSAGE }, { status: 409 });
    }
  }

  const now = new Date();
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const isAlreadyVerified = Boolean(existing?.email_verified);
  const protectedStatuses = ["verified", "winner", "alternate"];
  const currentStatus = existing?.giveaway_status || null;
  let giveawayStatus = wantsGiveaway ? "email_unverified" : "not_entered";
  if (existing) {
    if (protectedStatuses.includes(currentStatus || "")) {
      giveawayStatus = currentStatus || giveawayStatus;
    } else if (!wantsGiveaway) {
      giveawayStatus = "not_entered";
    } else if (isAlreadyVerified && currentStatus === "email_unverified") {
      giveawayStatus = "pending_verification";
    } else if (isAlreadyVerified) {
      giveawayStatus = currentStatus || "pending_verification";
    }
  }

  const consentFields = {
    marketing_consent: true,
    marketing_consent_at: now.toISOString(),
    marketing_consent_text: CONSENT_TEXT,
    email_consent: true,
    email_consent_at: now.toISOString(),
    email_consent_text: CONSENT_TEXT,
    sms_consent: Boolean(phone),
    sms_consent_at: phone ? now.toISOString() : null,
    sms_consent_text: phone ? CONSENT_TEXT : null,
    consent_ip_address: ipAddress,
    consent_user_agent: userAgent,
  };

  const verificationFields = isAlreadyVerified
    ? {}
    : {
        email_verified: false,
        email_verification_token_hash: tokenHash,
        email_verification_sent_at: now.toISOString(),
        email_verification_expires_at: expiresAt,
        email_verification_attempts: Number(existing?.email_verification_attempts || 0) + 1,
      };

  const record: Record<string, unknown> = {
    full_name: fullName,
    email,
    phone: phone || null,
    usually_go_out_area: usuallyGoOutArea || null,
    wants_giveaway: wantsGiveaway,
    social_handle: wantsGiveaway ? socialHandle : null,
    social_platform: wantsGiveaway ? socialPlatform : null,
    followed_social: followedSocial,
    tagged_two_friends: taggedTwoFriends,
    giveaway_status: giveawayStatus,
    giveaway_post_url: giveawayPostUrl || null,
    source: "homepage",
    referrer: referrer || null,
    user_agent: userAgent,
    ip_address: ipAddress,
    turnstile_verified: turnstileVerified,
    turnstile_action: "launch_waitlist",
    turnstile_hostname: turnstileHostname,
    metadata: { route: "/api/launch/waitlist" },
    duplicate_flag: false,
    duplicate_reason: null,
    duplicate_checked_at: now.toISOString(),
    ...consentFields,
    ...verificationFields,
  };

  const result = existing
    ? await supabaseAdmin.from("launch_waitlist_signups").update(record).eq("id", existing.id).select("id").single()
    : await supabaseAdmin.from("launch_waitlist_signups").insert(record).select("id").single();

  if (result.error) {
    return NextResponse.json({ success: false, message: "Something went wrong. Please try again." }, { status: 500 });
  }

  if (!isAlreadyVerified) {
    await sendVerificationEmail({ email, fullName, token: rawToken });
  }

  if (existing && !isAlreadyVerified) {
    return NextResponse.json({ success: true, message: "You're already on the Launch List. We updated your details and sent a new verification email." });
  }
  if (existing && isAlreadyVerified) {
    return NextResponse.json({ success: true, message: "You're already on the Launch List. We updated your giveaway details." });
  }
  return NextResponse.json({
    success: true,
    message: wantsGiveaway
      ? "Almost done. Check your email and tap Verify Email to complete your giveaway entry."
      : "Almost done. Check your email and tap Verify Email to confirm your launch list signup.",
  });
}
