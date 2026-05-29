import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApiRole(["superadmin", "admin", "editor", "viewer"]);
  if (auth.error) return auth.error;

  try {
    const { data: restaurantClaims, error: restaurantError } = await supabaseAdmin
      .from("restaurant_claims")
      .select(`
        id,
        restaurant_id,
        owner_name,
        owner_email,
        owner_phone,
        message,
        status,
        created_at,
        restaurants (
          name,
          restaurant_name,
          address,
          city,
          state,
          zip_code
        )
      `)
      .order("created_at", { ascending: false });

    if (restaurantError) {
      return Response.json({ error: restaurantError.message }, { status: 500 });
    }

    const { data: activityClaims, error: activityError } = await supabaseAdmin
      .from("activity_claims")
      .select(`
        id,
        activity_id,
        owner_name,
        owner_email,
        owner_phone,
        message,
        status,
        created_at,
        activities (
          name,
          activity_name,
          activity_type,
          address,
          city,
          state,
          zip_code
        )
      `)
      .order("created_at", { ascending: false });

    if (activityError) {
      return Response.json({ error: activityError.message }, { status: 500 });
    }

    const { data: locationClaims, error: locationError } = await supabaseAdmin
      .from("location_claim_requests")
      .select("id, location_id, location_name, location_type, address, city, state, zip_code, owner_name, owner_email, owner_phone, notes, status, verification_status, claim_code, submitted_at, created_at")
      .order("created_at", { ascending: false });

    if (locationError) {
      return Response.json({ error: locationError.message }, { status: 500 });
    }

    return Response.json({
      restaurantClaims:
        restaurantClaims?.map((claim: any) => ({
          ...claim,
          name: claim.restaurants?.name,
          restaurant_name: claim.restaurants?.restaurant_name,
          address: claim.restaurants?.address,
          city: claim.restaurants?.city,
          state: claim.restaurants?.state,
          zip_code: claim.restaurants?.zip_code,
        })) || [],

      activityClaims:
        activityClaims?.map((claim: any) => ({
          ...claim,
          name: claim.activities?.name,
          activity_name: claim.activities?.activity_name,
          activity_type: claim.activities?.activity_type,
          address: claim.activities?.address,
          city: claim.activities?.city,
          state: claim.activities?.state,
          zip_code: claim.activities?.zip_code,
        })) || [],

      locationClaims: locationClaims || [],
    });
  } catch (error: any) {
    return Response.json(
      { error: error.message || "Server error" },
      { status: 500 }
    );
  }
}
