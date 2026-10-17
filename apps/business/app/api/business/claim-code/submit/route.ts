import { logClaimFunnelEvent, lookupSecureClaim } from "@/lib/business-claim/secureClaim";
import { linkFraudIdentity, recordFraudSignal } from "@/lib/fraud";
import { recordGtmEvent } from "@/lib/gtm/events";
import { sendAdminNewClaimEmail, sendClaimCodeSubmittedEmail } from "@/lib/notifications";
import { sendSms } from "@/lib/sms/sendSms";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

async function settleFraudEvidence(tasks: Array<Promise<unknown>>) {
  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === "rejected") console.warn("Claim fraud evidence write failed", result.reason);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const challengeId = String(body.challengeId || "").trim();
    if (!challengeId) return Response.json({ ok: false, error: "verification_required" }, { status: 400 });

    const lookup = await lookupSecureClaim(body.code);
    if (!lookup.ok) {
      return Response.json({ ok: false, error: lookup.error }, { status: lookup.error === "invalid_code" ? 404 : 409 });
    }

    const { data: challenge, error: challengeError } = await supabaseAdmin
      .from("claim_verification_challenges")
      .select("id,location_id,claim_code_id,claim_code,channel,contact_normalized,contact_masked,contact_match,verified_at,consumed_at,expires_at,ip_hash")
      .eq("id", challengeId)
      .maybeSingle();
    if (challengeError) throw challengeError;

    if (
      !challenge ||
      String(challenge.location_id) !== String(lookup.location.id) ||
      challenge.claim_code !== lookup.code ||
      !challenge.verified_at
    ) {
      return Response.json({ ok: false, error: "verification_required" }, { status: 403 });
    }
    if (challenge.consumed_at) return Response.json({ ok: false, error: "challenge_consumed" }, { status: 409 });
    if (new Date(challenge.expires_at).getTime() <= Date.now()) {
      return Response.json({ ok: false, error: "otp_expired" }, { status: 410 });
    }

    const ownerEmail = challenge.channel === "email" ? challenge.contact_normalized : null;
    const ownerPhone = challenge.channel === "sms" ? challenge.contact_normalized : null;
    const verificationStatus = challenge.contact_match
      ? "otp_verified_business_contact_match"
      : "otp_verified_manual_review";
    const now = new Date().toISOString();

    // Claim request creation and challenge redemption occur in ONE database transaction.
    // On any failure PostgreSQL rolls back the claim record and code mutations.
    const { data: claimId, error: submissionError } = await supabaseAdmin.rpc(
      "submit_verified_location_claim", {
        p_challenge_id: challengeId,
        p_location_id: String(lookup.location.id),
        p_code: lookup.code,
        p_claim_code_id: lookup.claimCode?.id || null,
        p_claim: {
          location_name: lookup.publicLocation.name,
          location_type: lookup.publicLocation.locationType || "location",
          address: lookup.publicLocation.address || null,
          city: lookup.publicLocation.city || null,
          state: lookup.publicLocation.state || null,
          zip_code: lookup.publicLocation.zipCode || null,
          matched_location_snapshot: lookup.publicLocation,
        },
      });
    if (submissionError || !claimId) {
      return Response.json({ ok: false, error: "challenge_not_redeemable" }, { status: 409 });
    }
    const claim = { id: String(claimId), status: "pending", user_id: null };

    const identityType = challenge.channel === "email" ? "email_hash" : "phone_hash";
    const fraudTasks: Array<Promise<unknown>> = [
      linkFraudIdentity({
        identityType,
        rawValue: challenge.contact_normalized,
        subjectType: "claim",
        subjectId: String(claim.id),
        source: "claim_code_submit",
        metadata: { location_id: String(lookup.location.id) },
      }),
    ];
    if (challenge.ip_hash) {
      fraudTasks.push(linkFraudIdentity({
        identityType: "ip_hash",
        identityHash: String(challenge.ip_hash),
        subjectType: "claim",
        subjectId: String(claim.id),
        source: "claim_code_submit",
        metadata: { location_id: String(lookup.location.id) },
      }));
    }
    if (!challenge.contact_match) {
      fraudTasks.push(recordFraudSignal({
        subjectType: "claim",
        subjectId: String(claim.id),
        relatedSubjectType: "location",
        relatedSubjectId: String(lookup.location.id),
        signalType: "claim_requires_ownership_review",
        category: "ownership",
        source: "claim_code_submit",
        ruleKey: "location_ownership_mismatch",
        severity: 4,
        scoreDelta: 40,
        evidence: {
          challenge_id: challengeId,
          channel: challenge.channel,
          otp_verified: true,
          business_contact_match: false,
          verification_status: verificationStatus,
        },
        dedupeKey: `claim-ownership-review:${claim.id}`,
        expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
      }));
    }
    await settleFraudEvidence(fraudTasks);

    await logClaimFunnelEvent({
      locationId: lookup.location.id,
      claimCodeId: lookup.claimCode?.id || null,
      challengeId,
      eventType: "claim_completed",
      metadata: { contactMatch: Boolean(challenge.contact_match), channel: challenge.channel },
    });

    await recordGtmEvent({
      locationId: String(lookup.location.id),
      eventType: "claim_submitted",
      channel: challenge.channel,
      source: "secure_claim_code",
      metadata: { claimRequestId: String(claim.id), contactMatch: Boolean(challenge.contact_match) },
    }).catch((error) => console.warn("GTM claim event write failed", error));

    await Promise.allSettled([
      ownerEmail
        ? sendClaimCodeSubmittedEmail({
            email: ownerEmail,
            contactNameOrOwnerName: "there",
            locationName: lookup.publicLocation.name,
            claimCode: lookup.code,
            claimRequestId: claim.id,
          })
        : Promise.resolve(),
      ownerPhone
        ? sendSms({
            to: ownerPhone,
            body: `TheOutHaven: Your claim for ${lookup.publicLocation.name} was received. Claim reference: ${claim.id}.`,
          })
        : Promise.resolve(),
      sendAdminNewClaimEmail({
        locationName: lookup.publicLocation.name,
        requestType: "Claim existing listing",
        contactNameOrOwnerName: "Verified business contact",
        businessEmail: ownerEmail,
        phone: ownerPhone,
        matchStatus: "exact_match",
        verificationStatus,
        planInterest: "free_discovery",
        claimCode: lookup.code,
        claimRequestId: claim.id,
        locationId: lookup.location.id,
        address: lookup.publicLocation.address,
        city: lookup.publicLocation.city,
        state: lookup.publicLocation.state,
        zipCode: lookup.publicLocation.zipCode,
      }),
    ]);

    return Response.json({
      ok: true,
      claimRequestId: claim.id,
      status: claim.status || "pending",
      contactMatch: Boolean(challenge.contact_match),
      accountEmail: ownerEmail,
      needsAccount: !claim.user_id,
      profileStrength: lookup.publicLocation.profileStrength,
      missingItems: lookup.publicLocation.missingItems,
    });
  } catch (error) {
    console.error("Claim code submit failed", error);
    return Response.json({ ok: false, error: "submit_failed" }, { status: 500 });
  }
}
