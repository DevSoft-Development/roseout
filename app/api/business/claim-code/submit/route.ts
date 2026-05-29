import { normalizeClaimCode } from "@/lib/claimQr";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return String(value || "").trim();
}

async function getLocationForCode(code: string) {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("id, source_table, source_id, name, restaurant_name, activity_name, location_type, address, city, state, zip_code, claim_status, is_claimed, claimed, owner_user_id, claimed_by, claimed_by_email")
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
      return Response.json({ ok: false, error: "auth_required" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const code = normalizeClaimCode(body.code);
    const businessEmail = clean(body.businessEmail).toLowerCase();
    const businessPhone = clean(body.businessPhone);
    const roleAtBusiness = clean(body.roleAtBusiness);
    const note = clean(body.note);
    const now = new Date().toISOString();

    if (!code) return Response.json({ ok: false, error: "empty_code" }, { status: 400 });
    if (!businessEmail || !roleAtBusiness) {
      return Response.json({ ok: false, error: "missing_details" }, { status: 400 });
    }

    const location = await getLocationForCode(code);
    if (!location) return Response.json({ ok: false, error: "invalid_code" }, { status: 404 });

    const status = String(location.claim_status || "").toLowerCase();
    if (status === "expired") return Response.json({ ok: false, error: "expired_code" }, { status: 409 });
    if (status === "disabled") return Response.json({ ok: false, error: "disabled_code" }, { status: 409 });
    if (status === "redeemed") return Response.json({ ok: false, error: "used_code" }, { status: 409 });
    if (status === "approved" || status === "claimed" || location.is_claimed || location.claimed || location.owner_user_id || location.claimed_by || location.claimed_by_email) {
      return Response.json({ ok: false, error: "location_claimed" }, { status: 409 });
    }

    const locationName = location.name || location.restaurant_name || location.activity_name || "TheOutHaven location";
    const notes = [
      `Location ID: ${location.id}`,
      `Claim code verified: ${code}`,
      `Authenticated user ID: ${user.id}`,
      `Authenticated user email: ${user.email || "unknown"}`,
      `Role at business: ${roleAtBusiness}`,
      note,
    ]
      .filter(Boolean)
      .join("\n\n");

    const { data: request, error } = await supabaseAdmin
      .from("location_claim_requests")
      .insert({
        location_name: locationName,
        location_type: location.location_type || "Location",
        request_type: "Claim existing listing",
        address: location.address || null,
        city: location.city || null,
        state: location.state || null,
        zip_code: location.zip_code || null,
        owner_name: roleAtBusiness,
        owner_email: businessEmail,
        owner_phone: businessPhone || null,
        notes,
        status: "approved",
        verification_status: "code_verified",
        user_id: user.id,
        location_id: location.id,
        claim_code: code,
        claimed_at: now,
      })
      .select("id")
      .single();

    if (error) throw error;

    const ownerUpdate = {
      is_claimed: true,
      claimed: true,
      claim_status: "approved",
      claim_verification_status: "code_verified",
      claimed_by: user.id,
      claimed_by_email: businessEmail,
      claimed_at: now,
      owner_user_id: user.id,
      owner_email: businessEmail,
      owner_phone: businessPhone || null,
      owner_name: roleAtBusiness,
      plan: "free_discovery",
      is_pro: false,
    };

    const { error: locationUpdateError } = await supabaseAdmin
      .from("locations")
      .update(ownerUpdate)
      .eq("id", location.id)
      .is("owner_user_id", null);

    if (locationUpdateError) throw locationUpdateError;

    const sourceTable = typeof location.source_table === "string" ? location.source_table : null;
    const sourceId = location.source_id ? String(location.source_id) : null;

    if (sourceTable && sourceId && ["restaurants", "activities"].includes(sourceTable)) {
      await supabaseAdmin
        .from(sourceTable as "restaurants" | "activities")
        .update(ownerUpdate)
        .eq("id", sourceId);
    }

    await supabaseAdmin.from("business_claims").upsert(
      {
        user_id: user.id,
        location_id: location.id,
        source_table: sourceTable,
        source_location_id: sourceId,
        claim_code: code,
        status: "approved",
        verification_status: "code_verified",
        owner_email: businessEmail,
        owner_phone: businessPhone || null,
        role_at_business: roleAtBusiness,
        note: note || null,
        claimed_at: now,
        updated_at: now,
      },
      { onConflict: "location_id" },
    );

    await supabaseAdmin.from("location_owner_locations").upsert(
      {
        user_id: user.id,
        location_id: location.id,
        source_location_id: sourceId,
        status: "active",
        role: "owner",
        updated_at: now,
      },
      { onConflict: "user_id,location_id" },
    );

    return Response.json({ ok: true, id: request.id, dashboardUrl: "/locations/dashboard" });
  } catch {
    return Response.json({ ok: false, error: "submit_failed" }, { status: 500 });
  }
}
