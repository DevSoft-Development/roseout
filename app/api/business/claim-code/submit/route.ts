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
    .select("id, name, restaurant_name, activity_name, location_type, address, city, state, zip_code, claim_status, is_claimed, claimed, owner_user_id, claimed_by_email")
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
    if (status === "approved" || location.is_claimed || location.claimed || location.owner_user_id || location.claimed_by_email) {
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
        status: "pending",
        verification_status: "code_verified",
      })
      .select("id")
      .single();

    if (error) throw error;

    await supabaseAdmin
      .from("locations")
      .update({ claim_status: "pending" })
      .eq("id", location.id)
      .is("owner_user_id", null);

    return Response.json({ ok: true, id: request.id });
  } catch {
    return Response.json({ ok: false, error: "submit_failed" }, { status: 500 });
  }
}
