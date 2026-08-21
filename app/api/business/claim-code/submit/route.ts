import { sendAdminNewClaimEmail, sendClaimCodeSubmittedEmail } from "@/lib/notifications";
import { sendSms } from "@/lib/sms/sendSms";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logClaimFunnelEvent, lookupSecureClaim } from "@/lib/business-claim/secureClaim";

export const dynamic = "force-dynamic";

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
      .select("id,location_id,claim_code_id,claim_code,channel,contact_normalized,contact_masked,contact_match,verified_at,consumed_at,expires_at")
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

    const { data: existing } = await supabaseAdmin
      .from("location_claim_requests")
      .select("id,status,user_id")
      .eq("location_id", lookup.location.id)
      .eq("verified_contact", challenge.contact_normalized)
      .in("status", ["pending", "needs_more_info", "approved"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let claim = existing;
    if (!claim) {
      const { data: created, error: createError } = await supabaseAdmin
        .from("location_claim_requests")
        .insert({
          user_id: null,
          location_id: lookup.location.id,
          location_name: lookup.publicLocation.name,
          location_type: lookup.publicLocation.locationType || "location",
          request_type: "Claim existing listing",
          address: lookup.publicLocation.address || null,
          city: lookup.publicLocation.city || null,
          state: lookup.publicLocation.state || null,
          zip_code: lookup.publicLocation.zipCode || null,
          owner_name: "Verified business contact",
          owner_email: ownerEmail,
          owner_phone: ownerPhone,
          status: "pending",
          verification_status: verificationStatus,
          match_status: "exact_match",
          role_at_business: null,
          claim_code: lookup.code,
          verified_contact_channel: challenge.channel,
          verified_contact: challenge.contact_normalized,
          verified_contact_match: Boolean(challenge.contact_match),
          matched_location_snapshot: lookup.publicLocation,
          submission_payload: {
            source: "qr_otp",
            challengeId,
            contactMatch: Boolean(challenge.contact_match),
          },
          submitted_at: now,
          created_at: now,
          updated_at: now,
        })
        .select("id,status,user_id")
        .single();
      if (createError || !created) throw createError || new Error("Could not create claim request.");
      claim = created;
    }

    await Promise.all([
      supabaseAdmin
        .from("claim_verification_challenges")
        .update({ consumed_at: now, updated_at: now })
        .eq("id", challengeId),
      supabaseAdmin
        .from("locations")
        .update({
          claim_status: "pending",
          claimed_by_email: ownerEmail,
          claim_submitted_at: now,
        })
        .eq("id", lookup.location.id),
      ...(lookup.claimCode?.id
        ? [
            supabaseAdmin
              .from("location_claim_codes")
              .update({ status: "redeemed", claimed_at: now, updated_at: now })
              .eq("id", lookup.claimCode.id),
          ]
        : []),
    ]);

    await logClaimFunnelEvent({
      locationId: lookup.location.id,
      claimCodeId: lookup.claimCode?.id || null,
      challengeId,
      eventType: "claim_completed",
      metadata: { contactMatch: Boolean(challenge.contact_match), channel: challenge.channel },
    });

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
