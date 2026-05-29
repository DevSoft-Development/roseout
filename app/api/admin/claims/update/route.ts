import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  sendClaimApprovedEmail,
  sendClaimNeedsMoreInfoEmail,
  sendClaimRejectedEmail,
  sendLocationClaimApproved,
} from "@/lib/notifications";

function getJoinedValue<T extends Record<string, any>>(
  value: T | T[] | null | undefined,
  key: keyof T,
  fallback: string,
) {
  if (Array.isArray(value)) return value[0]?.[key] || fallback;
  return value?.[key] || fallback;
}

export async function POST(req: Request) {
  const auth = await requireAdminApiRole(["superadmin", "admin", "editor"]);
  if (auth.error) return auth.error;

  try {
    const { id, type, status } = await req.json();

    if (!id || !type || !status) return Response.json({ error: "Missing id, type, or status." }, { status: 400 });
    if (!["approved", "rejected", "needs_more_info"].includes(status)) return Response.json({ error: "Invalid status." }, { status: 400 });
    if (!["restaurant", "activity", "location"].includes(type)) return Response.json({ error: "Invalid claim type." }, { status: 400 });

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.vercel.app";
    const signupToken = status === "approved" ? crypto.randomUUID() : null;
    const signupUrl = status === "approved" ? `${siteUrl}/locations/signup?token=${signupToken}` : null;

    if (type === "location") {
      const { data: claim, error: claimLookupError } = await supabaseAdmin
        .from("location_claim_requests")
        .select("id, user_id, location_id, location_name, location_type, owner_email, owner_phone, owner_name, role_at_business, claim_code, verification_status, request_type, notes")
        .eq("id", id)
        .maybeSingle();

      if (claimLookupError || !claim) return Response.json({ error: "Location claim request not found." }, { status: 404 });

      const now = new Date().toISOString();
      const { error: claimUpdateError } = await supabaseAdmin
        .from("location_claim_requests")
        .update({
          status,
          reviewed_at: now,
          reviewed_by: auth.adminUser?.user_id || null,
          claimed_at: status === "approved" ? now : null,
          updated_at: now,
        })
        .eq("id", id);

      if (claimUpdateError) return Response.json({ error: claimUpdateError.message }, { status: 500 });

      let sourceTable: string | null = null;
      let sourceId: string | null = null;

      if (status === "approved" && claim.location_id) {
        const { data: location } = await supabaseAdmin
          .from("locations")
          .select("id, source_table, source_id")
          .eq("id", claim.location_id)
          .maybeSingle();
        sourceTable = typeof location?.source_table === "string" ? location.source_table : null;
        sourceId = location?.source_id ? String(location.source_id) : null;

        const ownerUpdate = {
          claim_status: "approved",
          claim_verification_status: claim.verification_status || "admin_approved",
          is_claimed: true,
          claimed: true,
          claimed_at: now,
          claimed_by: claim.user_id || null,
          claimed_by_email: claim.owner_email,
          owner_user_id: claim.user_id || null,
          owner_email: claim.owner_email,
          owner_name: claim.owner_name,
          owner_phone: claim.owner_phone,
        };

        const { error: locationUpdateError } = await supabaseAdmin.from("locations").update(ownerUpdate).eq("id", claim.location_id);
        if (locationUpdateError) return Response.json({ error: locationUpdateError.message }, { status: 500 });

        if (sourceTable && sourceId && ["restaurants", "activities"].includes(sourceTable)) {
          await supabaseAdmin.from(sourceTable as "restaurants" | "activities").update(ownerUpdate).eq("id", sourceId);
        }

        if (claim.user_id) {
          await supabaseAdmin.from("business_claims").upsert(
            {
              user_id: claim.user_id,
              location_id: claim.location_id,
              source_table: sourceTable,
              source_location_id: sourceId,
              claim_code: claim.claim_code || `NO-CODE-${claim.id.slice(0, 8)}`,
              status: "approved",
              verification_status: claim.verification_status || "admin_approved",
              owner_email: claim.owner_email,
              owner_phone: claim.owner_phone || null,
              role_at_business: claim.role_at_business || null,
              note: claim.notes || null,
              claimed_at: now,
              reviewed_at: now,
              reviewed_by: auth.adminUser?.user_id || null,
              updated_at: now,
            },
            { onConflict: "user_id,location_id" },
          );

          await supabaseAdmin.from("location_owner_locations").upsert(
            {
              user_id: claim.user_id,
              location_id: claim.location_id,
              source_location_id: sourceId,
              status: "active",
              role: "owner",
              updated_at: now,
            },
            { onConflict: "user_id,location_id" },
          );
        }
      }

      if (status === "approved") {
        await sendClaimApprovedEmail({ email: claim.owner_email, contactNameOrOwnerName: claim.owner_name, locationName: claim.location_name, dashboardUrl: `${siteUrl}/locations/dashboard` });
      } else if (status === "rejected") {
        await sendClaimRejectedEmail({ email: claim.owner_email, contactNameOrOwnerName: claim.owner_name, locationName: claim.location_name });
      } else {
        await sendClaimNeedsMoreInfoEmail({ email: claim.owner_email, contactNameOrOwnerName: claim.owner_name, locationName: claim.location_name });
      }

      return Response.json({ success: true, dashboard_url: status === "approved" ? `${siteUrl}/locations/dashboard` : null });
    }

    if (type === "restaurant") {
      const { data: claim, error: claimLookupError } = await supabase
        .from("restaurant_claims")
        .select(`id, restaurant_id, owner_name, owner_email, owner_phone, restaurants (restaurant_name)`)
        .eq("id", id)
        .maybeSingle();
      if (claimLookupError || !claim) return Response.json({ error: "Restaurant location claim not found." }, { status: 404 });
      const { error: claimUpdateError } = await supabase.from("restaurant_claims").update({ status, owner_signup_token: signupToken, owner_signup_url: signupUrl }).eq("id", id);
      if (claimUpdateError) return Response.json({ error: claimUpdateError.message }, { status: 500 });
      if (status === "approved") {
        const { error: restaurantUpdateError } = await supabase.from("restaurants").update({ is_claimed: true, claimed: true, claim_status: status, claimed_by_email: claim.owner_email, claimed_at: new Date().toISOString(), owner_name: claim.owner_name, owner_email: claim.owner_email, owner_phone: claim.owner_phone, owner_signup_token: signupToken, owner_signup_url: signupUrl }).eq("id", claim.restaurant_id);
        if (restaurantUpdateError) return Response.json({ error: restaurantUpdateError.message }, { status: 500 });
        await sendLocationClaimApproved({ email: claim.owner_email, phone: claim.owner_phone, locationName: getJoinedValue(claim.restaurants, "restaurant_name", "your TheOutHaven location"), signupUrl });
      }
      return Response.json({ success: true, signup_url: signupUrl });
    }

    if (type === "activity") {
      const { data: claim, error: claimLookupError } = await supabase
        .from("activity_claims")
        .select(`id, activity_id, owner_name, owner_email, owner_phone, activities (activity_name)`)
        .eq("id", id)
        .maybeSingle();
      if (claimLookupError || !claim) return Response.json({ error: "Activity location claim not found." }, { status: 404 });
      const { error: claimUpdateError } = await supabase.from("activity_claims").update({ status, owner_signup_token: signupToken, owner_signup_url: signupUrl }).eq("id", id);
      if (claimUpdateError) return Response.json({ error: claimUpdateError.message }, { status: 500 });
      if (status === "approved") {
        const { error: activityUpdateError } = await supabase.from("activities").update({ is_claimed: true, claimed: true, claim_status: status, claimed_by_email: claim.owner_email, claimed_at: new Date().toISOString(), owner_name: claim.owner_name, owner_email: claim.owner_email, owner_phone: claim.owner_phone, owner_signup_token: signupToken, owner_signup_url: signupUrl }).eq("id", claim.activity_id);
        if (activityUpdateError) return Response.json({ error: activityUpdateError.message }, { status: 500 });
        await sendLocationClaimApproved({ email: claim.owner_email, phone: claim.owner_phone, locationName: getJoinedValue(claim.activities, "activity_name", "your TheOutHaven location"), signupUrl });
      }
      return Response.json({ success: true, signup_url: signupUrl });
    }

    return Response.json({ error: "Invalid claim type." }, { status: 400 });
  } catch (error: any) {
    return Response.json({ error: error.message || "Server error" }, { status: 500 });
  }
}
