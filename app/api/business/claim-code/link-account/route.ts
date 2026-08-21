import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { approveLocationClaim } from "@/lib/locations/claims";
import { logClaimFunnelEvent } from "@/lib/business-claim/secureClaim";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const auth = await createClient();
    const { data } = await auth.auth.getUser();
    const user = data.user;
    if (!user?.id) return Response.json({ ok: false, error: "auth_required" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const claimRequestId = String(body.claimRequestId || "").trim();
    const challengeId = String(body.challengeId || "").trim();
    if (!claimRequestId || !challengeId) {
      return Response.json({ ok: false, error: "missing_details" }, { status: 400 });
    }

    const [{ data: claim, error: claimError }, { data: challenge, error: challengeError }] = await Promise.all([
      supabaseAdmin
        .from("location_claim_requests")
        .select("id,location_id,user_id,status,verified_contact_channel,verified_contact,verified_contact_match")
        .eq("id", claimRequestId)
        .maybeSingle(),
      supabaseAdmin
        .from("claim_verification_challenges")
        .select("id,location_id,claim_code_id,channel,contact_normalized,verified_at,consumed_at,contact_match")
        .eq("id", challengeId)
        .maybeSingle(),
    ]);
    if (claimError) throw claimError;
    if (challengeError) throw challengeError;
    if (!claim || !challenge || !challenge.verified_at || !challenge.consumed_at) {
      return Response.json({ ok: false, error: "verification_required" }, { status: 403 });
    }
    if (String(claim.location_id) !== String(challenge.location_id)) {
      return Response.json({ ok: false, error: "claim_mismatch" }, { status: 403 });
    }
    if (challenge.channel !== "email") {
      return Response.json({ ok: false, error: "email_account_required" }, { status: 400 });
    }
    if (!user.email || user.email.toLowerCase() !== String(challenge.contact_normalized).toLowerCase()) {
      return Response.json({ ok: false, error: "account_email_mismatch" }, { status: 403 });
    }
    if (claim.user_id && claim.user_id !== user.id) {
      return Response.json({ ok: false, error: "claim_already_linked" }, { status: 409 });
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from("location_claim_requests")
      .update({ user_id: user.id, owner_email: user.email, updated_at: now })
      .eq("id", claimRequestId);
    if (updateError) throw updateError;

    await logClaimFunnelEvent({
      locationId: String(claim.location_id),
      claimCodeId: challenge.claim_code_id ? String(challenge.claim_code_id) : null,
      challengeId,
      eventType: "account_linked",
      metadata: { autoApprovalEligible: Boolean(challenge.contact_match) },
    });

    if (challenge.contact_match && claim.status !== "approved") {
      const approval = await approveLocationClaim({
        claimId: claimRequestId,
        actorContext: { userId: user.id },
      });
      if (!approval.ok) {
        return Response.json({
          ok: true,
          linked: true,
          approved: false,
          status: "pending",
          message: "Owner account linked. The claim remains in review.",
        });
      }

      await logClaimFunnelEvent({
        locationId: String(claim.location_id),
        claimCodeId: challenge.claim_code_id ? String(challenge.claim_code_id) : null,
        challengeId,
        eventType: "claim_approved",
        metadata: { mode: "verified_business_contact" },
      });
      return Response.json({ ok: true, linked: true, approved: true, status: "approved" });
    }

    return Response.json({ ok: true, linked: true, approved: claim.status === "approved", status: claim.status || "pending" });
  } catch (error) {
    console.error("Claim account link failed", error);
    return Response.json({ ok: false, error: "link_failed" }, { status: 500 });
  }
}
