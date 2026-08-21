import { supabaseAdmin } from "@/lib/supabase-admin";
import { hashClaimValue, logClaimFunnelEvent } from "@/lib/business-claim/secureClaim";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const challengeId = String(body.challengeId || "").trim();
    const otp = String(body.otp || "").replace(/\D/g, "").slice(0, 6);

    if (!challengeId || otp.length !== 6) {
      return Response.json({ ok: false, error: "invalid_otp" }, { status: 400 });
    }

    const { data: challenge, error } = await supabaseAdmin
      .from("claim_verification_challenges")
      .select("id,location_id,claim_code_id,claim_code,contact_normalized,contact_masked,contact_match,otp_hash,expires_at,verified_at,consumed_at,attempt_count")
      .eq("id", challengeId)
      .maybeSingle();
    if (error) throw error;
    if (!challenge) return Response.json({ ok: false, error: "invalid_otp" }, { status: 404 });
    if (challenge.consumed_at) return Response.json({ ok: false, error: "challenge_consumed" }, { status: 409 });
    if (challenge.verified_at) {
      return Response.json({
        ok: true,
        challengeId,
        contactMatch: Boolean(challenge.contact_match),
        maskedContact: challenge.contact_masked,
      });
    }
    if (new Date(challenge.expires_at).getTime() <= Date.now()) {
      return Response.json({ ok: false, error: "otp_expired" }, { status: 410 });
    }
    if ((challenge.attempt_count || 0) >= 5) {
      return Response.json({ ok: false, error: "too_many_attempts" }, { status: 429 });
    }

    const expectedHash = hashClaimValue(`otp:${challenge.claim_code}:${challenge.contact_normalized}:${otp}`);
    const expected = Buffer.from(String(challenge.otp_hash), "hex");
    const actual = Buffer.from(expectedHash, "hex");
    const matches = expected.length === actual.length && cryptoSafeEqual(expected, actual);

    if (!matches) {
      await supabaseAdmin
        .from("claim_verification_challenges")
        .update({ attempt_count: (challenge.attempt_count || 0) + 1, updated_at: new Date().toISOString() })
        .eq("id", challengeId);
      return Response.json({ ok: false, error: "invalid_otp" }, { status: 400 });
    }

    const now = new Date().toISOString();
    await supabaseAdmin
      .from("claim_verification_challenges")
      .update({ verified_at: now, attempt_count: (challenge.attempt_count || 0) + 1, updated_at: now })
      .eq("id", challengeId);

    await logClaimFunnelEvent({
      locationId: String(challenge.location_id),
      claimCodeId: challenge.claim_code_id ? String(challenge.claim_code_id) : null,
      challengeId,
      eventType: "verified",
      metadata: { contactMatch: Boolean(challenge.contact_match) },
    });

    return Response.json({
      ok: true,
      challengeId,
      contactMatch: Boolean(challenge.contact_match),
      maskedContact: challenge.contact_masked,
    });
  } catch (error) {
    console.error("Claim OTP verification failed", error);
    return Response.json({ ok: false, error: "verify_failed" }, { status: 500 });
  }
}

function cryptoSafeEqual(a: Buffer, b: Buffer) {
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}
