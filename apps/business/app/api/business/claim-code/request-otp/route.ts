import { sendRawBrandedEmail } from "@/lib/email/sender";
import { linkFraudIdentity, recordFraudSignal } from "@/lib/fraud";
import { requireTurnstile } from "@/lib/security/turnstile";
import { sendSupportSms } from "@/lib/sms/telnyx";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  claimContactMatchesLocation,
  generateClaimOtp,
  hashClaimValue,
  logClaimFunnelEvent,
  lookupSecureClaim,
  maskClaimContact,
  normalizeClaimContact,
  type ClaimContactChannel,
} from "@/lib/business-claim/secureClaim";

export const dynamic = "force-dynamic";

function getIp(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

function validContact(channel: ClaimContactChannel, contact: string) {
  if (channel === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
  return /^\+1\d{10}$/.test(contact);
}

async function settleFraudEvidence(tasks: Array<Promise<unknown>>) {
  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === "rejected") console.warn("Claim fraud evidence write failed", result.reason);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const channel = body.channel === "sms" ? "sms" : "email";
    const contact = normalizeClaimContact(channel, body.contact);

    if (!validContact(channel, contact)) {
      return Response.json({ ok: false, error: "invalid_contact" }, { status: 400 });
    }

    const turnstile = await requireTurnstile({
      request: req,
      token: typeof body.turnstileToken === "string" ? body.turnstileToken : null,
      action: "business_claim_otp",
    });
    if (!turnstile.success) {
      return Response.json({ ok: false, error: "turnstile_failed" }, { status: turnstile.status });
    }

    const lookup = await lookupSecureClaim(body.code);
    if (!lookup.ok) {
      return Response.json({ ok: false, error: lookup.error }, { status: lookup.error === "invalid_code" ? 404 : 409 });
    }

    const ipHash = hashClaimValue(`ip:${getIp(req)}`);
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const [{ count: contactCount }, { count: ipCount }] = await Promise.all([
      supabaseAdmin
        .from("claim_verification_challenges")
        .select("id", { count: "exact", head: true })
        .eq("claim_code", lookup.code)
        .eq("contact_normalized", contact)
        .gte("created_at", since),
      supabaseAdmin
        .from("claim_verification_challenges")
        .select("id", { count: "exact", head: true })
        .eq("ip_hash", ipHash)
        .gte("created_at", since),
    ]);

    if ((contactCount || 0) >= 5 || (ipCount || 0) >= 10) {
      const abuseSubjectId = `otp:${lookup.location.id}:${ipHash.slice(0, 20)}`;
      await settleFraudEvidence([
        recordFraudSignal({
          subjectType: "claim",
          subjectId: abuseSubjectId,
          relatedSubjectType: "location",
          relatedSubjectId: String(lookup.location.id),
          signalType: "claim_otp_rate_limit",
          category: "account_takeover",
          source: "claim_code_request_otp",
          ruleKey: "claim_takeover_attempt",
          severity: 4,
          scoreDelta: 40,
          evidence: { contact_attempts_1h: contactCount || 0, ip_attempts_1h: ipCount || 0 },
          dedupeKey: `claim-otp-rate:${lookup.location.id}:${ipHash}:${new Date().toISOString().slice(0, 13)}`,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        }),
        linkFraudIdentity({
          identityType: "ip_hash",
          identityHash: ipHash,
          subjectType: "claim",
          subjectId: abuseSubjectId,
          source: "claim_code_request_otp",
          metadata: { reason: "rate_limit" },
        }),
      ]);
      return Response.json({ ok: false, error: "rate_limited" }, { status: 429 });
    }

    const otp = generateClaimOtp();
    const masked = maskClaimContact(channel, contact);
    const contactMatch = claimContactMatchesLocation(channel, contact, lookup.location);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { data: challenge, error: insertError } = await supabaseAdmin
      .from("claim_verification_challenges")
      .insert({
        location_id: lookup.location.id,
        claim_code_id: lookup.claimCode?.id || null,
        claim_code: lookup.code,
        channel,
        contact_normalized: contact,
        contact_masked: masked,
        contact_match: contactMatch,
        otp_hash: hashClaimValue(`otp:${lookup.code}:${contact}:${otp}`),
        expires_at: expiresAt,
        ip_hash: ipHash,
      })
      .select("id")
      .single();
    if (insertError || !challenge) throw insertError || new Error("Could not create verification challenge.");

    const identityType = channel === "email" ? "email_hash" : "phone_hash";
    const evidenceTasks: Array<Promise<unknown>> = [
      linkFraudIdentity({
        identityType,
        rawValue: contact,
        subjectType: "claim",
        subjectId: String(challenge.id),
        source: "claim_code_request_otp",
      }),
      linkFraudIdentity({
        identityType: "ip_hash",
        identityHash: ipHash,
        subjectType: "claim",
        subjectId: String(challenge.id),
        source: "claim_code_request_otp",
      }),
    ];
    if (!contactMatch) {
      evidenceTasks.push(recordFraudSignal({
        subjectType: "claim",
        subjectId: String(challenge.id),
        relatedSubjectType: "location",
        relatedSubjectId: String(lookup.location.id),
        signalType: "unmatched_claim_contact",
        category: "ownership",
        source: "claim_code_request_otp",
        ruleKey: "location_contact_anomaly",
        severity: 3,
        scoreDelta: 25,
        evidence: { channel, business_contact_match: false },
        dedupeKey: `claim-contact-mismatch:${challenge.id}`,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }));
    }
    await settleFraudEvidence(evidenceTasks);

    if (channel === "email") {
      const result = await sendRawBrandedEmail({
        to: contact,
        department: "account",
        subject: `${otp} is your TheOutHaven verification code`,
        heading: "Verify your business claim",
        body: `Enter ${otp} to verify your claim for ${lookup.publicLocation.name}. This code expires in 10 minutes. If you did not request this, you can ignore this email.`,
      });
      if (result.status === "error") throw new Error(result.error || "Email delivery failed.");
    } else {
      await sendSupportSms({
        to: contact,
        body: `TheOutHaven: ${otp} is your verification code for ${lookup.publicLocation.name}. It expires in 10 minutes.`,
      });
    }

    await logClaimFunnelEvent({
      locationId: lookup.location.id,
      claimCodeId: lookup.claimCode?.id || null,
      challengeId: challenge.id,
      eventType: "verification_started",
      metadata: { channel, contactMatch },
    });

    return Response.json({
      ok: true,
      challengeId: challenge.id,
      maskedContact: masked,
      expiresInSeconds: 600,
    });
  } catch (error) {
    console.error("Claim OTP request failed", error);
    return Response.json({ ok: false, error: "otp_send_failed" }, { status: 500 });
  }
}
