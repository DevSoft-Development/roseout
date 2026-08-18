import { normalizeClaimCode } from "@/lib/claimQr";
import { submitLocationClaim } from "@/lib/locations/claims";
import { sendAdminNewClaimEmail, sendClaimCodeSubmittedEmail } from "@/lib/notifications";
import { createClient } from "@/lib/supabase-server";
import { requireTurnstile } from "@/lib/security/turnstile";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value || "").trim();
}

function phoneDigits(value: unknown) {
  return clean(value).replace(/\D/g, "");
}

function errorKey(message?: string) {
  const raw = String(message || "").toLowerCase();
  if (raw.includes("already been claimed")) return "location_claimed";
  if (raw.includes("manual verification")) return "claim_needs_manual_review";
  if (raw.includes("sign in")) return "auth_required";
  return null;
}

type CanonicalClaimCode = {
  id: string;
  location_id: string;
  status: string | null;
  expires_at: string | null;
  claimed_at: string | null;
  revoked_at: string | null;
};

function canonicalCodeError(row: CanonicalClaimCode) {
  const status = String(row.status || "").toLowerCase();
  if (row.revoked_at || status === "revoked" || status === "disabled" || status === "failed") return "disabled_code";
  if (row.claimed_at || ["claimed", "redeemed", "used"].includes(status)) return "used_code";
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return "expired_code";
  if (status !== "sent") return "disabled_code";
  return null;
}

async function submitCanonicalClaimCode({
  code,
  userId,
  businessEmail,
  businessPhone,
  roleAtBusiness,
  note,
}: {
  code: string;
  userId: string;
  businessEmail: string;
  businessPhone: string;
  roleAtBusiness: string;
  note: string;
}) {
  const { data: claimCode, error: claimCodeError } = await supabaseAdmin
    .from("location_claim_codes")
    .select("id,location_id,status,expires_at,claimed_at,revoked_at")
    .eq("code", code)
    .maybeSingle();

  if (claimCodeError) throw claimCodeError;
  if (!claimCode) return null;

  const canonical = claimCode as CanonicalClaimCode;
  const codeError = canonicalCodeError(canonical);
  if (codeError) return { ok: false as const, error: codeError, status: 409 };

  const { data: location, error: locationError } = await supabaseAdmin
    .from("locations")
    .select("id,name,restaurant_name,activity_name,address,city,state,zip_code,phone,website,claim_status,is_claimed,claimed,source_table,source_id")
    .eq("id", canonical.location_id)
    .maybeSingle();

  if (locationError) throw locationError;
  if (!location) return { ok: false as const, error: "invalid_code", status: 404 };

  const alreadyClaimed = Boolean((location as any).is_claimed || (location as any).claimed || String((location as any).claim_status || "").toLowerCase() === "claimed");
  if (alreadyClaimed) return { ok: false as const, error: "location_claimed", status: 409 };

  const { data: duplicate } = await supabaseAdmin
    .from("location_claim_requests")
    .select("id,status")
    .eq("location_id", canonical.location_id)
    .eq("owner_email", businessEmail)
    .in("status", ["pending", "needs_more_info", "approved"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (duplicate?.id) {
    return { ok: true as const, claimId: duplicate.id, status: duplicate.status || "pending" };
  }

  const locationName = clean((location as any).name || (location as any).restaurant_name || (location as any).activity_name) || "TheOutHaven Location";
  const now = new Date().toISOString();
  const ownerPhone = phoneDigits(businessPhone) || businessPhone || null;

  const { data: claim, error: createError } = await supabaseAdmin
    .from("location_claim_requests")
    .insert({
      user_id: userId,
      location_id: canonical.location_id,
      location_name: locationName,
      location_type: String((location as any).source_table || "location"),
      request_type: "Claim existing listing",
      address: (location as any).address || null,
      city: (location as any).city || null,
      state: (location as any).state || null,
      zip_code: (location as any).zip_code || null,
      owner_name: roleAtBusiness,
      owner_email: businessEmail,
      owner_phone: ownerPhone,
      notes: note || null,
      status: "pending",
      verification_status: "crm_claim_code_verified",
      match_status: "exact_match",
      role_at_business: roleAtBusiness,
      claim_code: code,
      matched_location_snapshot: {
        locationId: canonical.location_id,
        displayName: locationName,
        sourceTable: (location as any).source_table || "locations",
        sourceLocationId: (location as any).source_id || null,
        address: (location as any).address || null,
        city: (location as any).city || null,
        state: (location as any).state || null,
        zipCode: (location as any).zip_code || null,
        phone: (location as any).phone || null,
        website: (location as any).website || null,
      },
      submission_payload: { source: "crm_claim_code", claimCodeId: canonical.id },
      submitted_at: now,
      created_at: now,
      updated_at: now,
    })
    .select("id,status")
    .single();

  if (createError || !claim) throw createError || new Error("Could not create claim request.");

  await Promise.all([
    supabaseAdmin
      .from("locations")
      .update({ claim_status: "pending", claimed_by_email: businessEmail, claim_submitted_at: now })
      .eq("id", canonical.location_id),
    supabaseAdmin
      .from("location_claim_codes")
      .update({ status: "redeemed", claimed_at: now, claimed_by_user_id: userId, updated_at: now })
      .eq("id", canonical.id),
  ]);

  await Promise.allSettled([
    sendClaimCodeSubmittedEmail({
      email: businessEmail,
      contactNameOrOwnerName: roleAtBusiness,
      locationName,
      claimCode: code,
      claimRequestId: claim.id,
    }),
    sendAdminNewClaimEmail({
      locationName,
      requestType: "Claim existing listing",
      contactNameOrOwnerName: roleAtBusiness,
      businessEmail,
      phone: ownerPhone,
      matchStatus: "exact_match",
      verificationStatus: "crm_claim_code_verified",
      planInterest: "free_discovery",
      claimCode: code,
      claimRequestId: claim.id,
      locationId: canonical.location_id,
      address: (location as any).address || null,
      city: (location as any).city || null,
      state: (location as any).state || null,
      zipCode: (location as any).zip_code || null,
    }),
  ]);

  return { ok: true as const, claimId: claim.id, status: claim.status || "pending" };
}

export async function POST(req: Request) {
  try {
    const authSupabase = await createClient();
    const { data: userData } = await authSupabase.auth.getUser();
    const user = userData.user;

    if (!user?.id) {
      return Response.json(
        { ok: false, error: "auth_required" },
        { status: 401 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const code = normalizeClaimCode(body.code);
    const businessEmail = clean(body.businessEmail).toLowerCase();
    const businessPhone = clean(body.businessPhone);
    const roleAtBusiness = clean(body.roleAtBusiness);
    const note = clean(body.note);

    if (!code) {
      return Response.json({ ok: false, error: "empty_code" }, { status: 400 });
    }
    if (!businessEmail || !roleAtBusiness) {
      return Response.json(
        { ok: false, error: "missing_details" },
        { status: 400 },
      );
    }

    const turnstile = await requireTurnstile({
      request: req,
      token: typeof body.turnstileToken === "string" ? body.turnstileToken : null,
      action: "business_claim_submit",
    });
    if (!turnstile.success) {
      return Response.json(
        { ok: false, error: "turnstile_failed", message: turnstile.error },
        { status: turnstile.status },
      );
    }

    const canonical = await submitCanonicalClaimCode({
      code,
      userId: user.id,
      businessEmail,
      businessPhone,
      roleAtBusiness,
      note,
    });

    if (canonical) {
      if (!canonical.ok) {
        return Response.json(
          { ok: false, error: canonical.error },
          { status: canonical.status },
        );
      }
      return Response.json({
        ok: true,
        id: canonical.claimId,
        claimRequestId: canonical.claimId,
        confirmationUrl: "/business/claim?submitted=pending",
        message: canonical.status === "pending" ? "Claim submitted for review." : "Your claim request is already being reviewed.",
      });
    }

    const ownerPhone = phoneDigits(businessPhone) || businessPhone || undefined;
    const result = await submitLocationClaim({
      token: code,
      contactName: roleAtBusiness,
      email: businessEmail,
      phone: ownerPhone,
      role: roleAtBusiness,
      notes: note || undefined,
      source: "qr",
      userId: user.id,
    });

    if (!result.ok) {
      return Response.json(
        {
          ok: false,
          error: errorKey(result.error) || "submit_failed",
          message: result.error,
        },
        { status: result.status || 500 },
      );
    }

    return Response.json({
      ok: true,
      id: result.claimId,
      claimRequestId: result.claimId,
      confirmationUrl: "/business/claim?submitted=pending",
      message:
        result.status === "pending"
          ? "Claim submitted for review."
          : "Your claim request is already being reviewed.",
    });
  } catch (error) {
    console.error("Claim code submit failed", error);
    return Response.json(
      { ok: false, error: "submit_failed" },
      { status: 500 },
    );
  }
}
