import { normalizeClaimCode } from "@/lib/claimQr";
import {
  sendAdminNewClaimEmail,
  sendClaimCodeSubmittedEmail,
} from "@/lib/notifications";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value || "").trim();
}

function phoneDigits(value: unknown) {
  return clean(value).replace(/\D/g, "");
}

async function getLocationForCode(code: string) {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select(
      "id, source_table, source_id, name, restaurant_name, activity_name, location_type, address, city, state, zip_code, claim_status, is_claimed, claimed, owner_user_id, claimed_by, claimed_by_email",
    )
    .eq("claim_code", code)
    .maybeSingle();

  if (error) throw error;
  return data;
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
    const now = new Date().toISOString();

    if (!code)
      return Response.json({ ok: false, error: "empty_code" }, { status: 400 });
    if (!businessEmail || !roleAtBusiness) {
      return Response.json(
        { ok: false, error: "missing_details" },
        { status: 400 },
      );
    }

    const location = await getLocationForCode(code);
    if (!location)
      return Response.json(
        { ok: false, error: "invalid_code" },
        { status: 404 },
      );

    const status = String(location.claim_status || "").toLowerCase();
    if (status === "expired")
      return Response.json(
        { ok: false, error: "expired_code" },
        { status: 409 },
      );
    if (status === "disabled")
      return Response.json(
        { ok: false, error: "disabled_code" },
        { status: 409 },
      );
    if (status === "redeemed")
      return Response.json({ ok: false, error: "used_code" }, { status: 409 });

    const locationName =
      location.name ||
      location.restaurant_name ||
      location.activity_name ||
      "TheOutHaven location";
    const existingOwner =
      status === "approved" ||
      status === "claimed" ||
      location.is_claimed ||
      location.claimed ||
      location.owner_user_id ||
      location.claimed_by ||
      location.claimed_by_email;
    const ownerPhone = phoneDigits(businessPhone) || businessPhone || null;
    const notes = [
      `Location ID: ${location.id}`,
      `Claim code verified: ${code}`,
      `Authenticated user ID: ${user.id}`,
      `Authenticated user email: ${user.email || "unknown"}`,
      `Role at business: ${roleAtBusiness}`,
      existingOwner
        ? "Location appears to have an existing owner. Review as a potential ownership dispute; current owner details were not exposed to the claimant."
        : null,
      note,
    ]
      .filter(Boolean)
      .join("\n\n");

    const { data: duplicateRows, error: duplicateError } = await supabaseAdmin
      .from("location_claim_requests")
      .select("id")
      .eq("status", "pending")
      .eq("location_id", location.id)
      .eq("owner_email", businessEmail)
      .limit(1);

    if (duplicateError) throw duplicateError;
    if (duplicateRows?.[0]) {
      return Response.json({
        ok: true,
        id: duplicateRows[0].id,
        claimRequestId: duplicateRows[0].id,
        confirmationUrl: "/business/claim?submitted=pending",
        message: existingOwner
          ? "This location already has an owner. Your request was sent to TheOutHaven for review."
          : "Your claim is already pending review.",
      });
    }

    const { data: request, error } = await supabaseAdmin
      .from("location_claim_requests")
      .insert({
        location_name: locationName,
        location_type: location.location_type || "Location",
        request_type: existingOwner
          ? "Claim existing listing dispute"
          : "Claim existing listing",
        address: location.address || null,
        city: location.city || null,
        state: location.state || null,
        zip_code: location.zip_code || null,
        owner_name: roleAtBusiness,
        owner_email: businessEmail,
        owner_phone: ownerPhone,
        notes,
        status: "pending",
        verification_status: "code_verified",
        user_id: user.id,
        location_id: location.id,
        claim_code: code,
        plan_interest: "free_discovery",
        role_at_business: roleAtBusiness,
        match_status: "exact_match",
        confidence_score: 100,
        matched_location_snapshot: {
          id: location.id,
          name: locationName,
          address: location.address || null,
          city: location.city || null,
          state: location.state || null,
          zipCode: location.zip_code || null,
          locationType: location.location_type || null,
          claimStatus: location.claim_status || null,
          isClaimed: Boolean(location.is_claimed || location.claimed),
        },
        submission_payload: {
          code,
          businessEmail,
          businessPhone,
          roleAtBusiness,
          note: note || null,
          authenticatedUserEmail: user.email || null,
        },
        submitted_at: now,
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();

    if (error) throw error;

    await Promise.allSettled([
      sendClaimCodeSubmittedEmail({
        email: businessEmail,
        contactNameOrOwnerName: roleAtBusiness,
        locationName,
        claimCode: code,
        claimRequestId: request.id,
      }),
      sendAdminNewClaimEmail({
        locationName,
        requestType: existingOwner
          ? "Claim existing listing dispute"
          : "Claim existing listing",
        contactNameOrOwnerName: roleAtBusiness,
        businessEmail,
        phone: ownerPhone,
        matchStatus: "exact_match",
        verificationStatus: "code_verified",
        planInterest: "free_discovery",
        claimCode: code,
        claimRequestId: request.id,
        locationId: location.id,
        address: location.address || null,
        city: location.city || null,
        state: location.state || null,
        zipCode: location.zip_code || null,
      }),
    ]);

    return Response.json({
      ok: true,
      id: request.id,
      claimRequestId: request.id,
      confirmationUrl: "/business/claim?submitted=pending",
      message: existingOwner
        ? "This location already has an owner. Your request was sent to TheOutHaven for review."
        : "Claim submitted for review.",
    });
  } catch (error) {
    console.error("Claim code submit failed", error);
    return Response.json(
      { ok: false, error: "submit_failed" },
      { status: 500 },
    );
  }
}
