import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { approveLocationClaim, rejectLocationClaim, linkLegacyApprovedClaimToOwnerAccess } from "@/lib/locations/claims";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
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
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.claimsManage);
  if (auth.error) return auth.error;

  try {
    const { id, type, status, userId, ownerUserId } = await req.json();

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

      const resolvedOwnerUserId = userId || ownerUserId || claim.user_id || null;
      if (status === "approved" && !resolvedOwnerUserId) {
        return Response.json(
          { error: "Link this claim to the owner's user account before approval." },
          { status: 400 },
        );
      }

      if (status === "approved" && resolvedOwnerUserId && claim.user_id !== resolvedOwnerUserId) {
        const { error: ownerLinkError } = await supabaseAdmin
          .from("location_claim_requests")
          .update({ user_id: resolvedOwnerUserId, updated_at: new Date().toISOString() })
          .eq("id", id);
        if (ownerLinkError) return Response.json({ error: ownerLinkError.message }, { status: 500 });
      }

      const serviceResult = status === "approved"
        ? await approveLocationClaim({ claimId: id, actorContext: { userId: auth.adminUser?.user_id || null } })
        : await rejectLocationClaim({ claimId: id, actorContext: { userId: auth.adminUser?.user_id || null }, reason: status === "needs_more_info" ? "needs_more_info" : null, status });

      if (!serviceResult.ok) {
        return Response.json({ error: serviceResult.error }, { status: serviceResult.status || 500 });
      }

      if (status === "approved") {
        await sendClaimApprovedEmail({ email: claim.owner_email, contactNameOrOwnerName: claim.owner_name, locationName: claim.location_name, dashboardUrl: `${siteUrl}/business/dashboard` });
      } else if (status === "rejected") {
        await sendClaimRejectedEmail({ email: claim.owner_email, contactNameOrOwnerName: claim.owner_name, locationName: claim.location_name });
      } else {
        await sendClaimNeedsMoreInfoEmail({ email: claim.owner_email, contactNameOrOwnerName: claim.owner_name, locationName: claim.location_name });
      }

      return Response.json({ success: true, dashboard_url: status === "approved" ? `${siteUrl}/business/dashboard` : null });
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
        const resolvedOwnerUserId = userId || ownerUserId;
        if (!resolvedOwnerUserId) {
          return Response.json({ error: "Link this claim to the owner's user account before approval." }, { status: 400 });
        }
        await linkLegacyApprovedClaimToOwnerAccess({ type: "restaurant", claimId: id, userId: resolvedOwnerUserId, reviewedBy: auth.adminUser?.user_id || null });
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
        const resolvedOwnerUserId = userId || ownerUserId;
        if (!resolvedOwnerUserId) {
          return Response.json({ error: "Link this claim to the owner's user account before approval." }, { status: 400 });
        }
        await linkLegacyApprovedClaimToOwnerAccess({ type: "activity", claimId: id, userId: resolvedOwnerUserId, reviewedBy: auth.adminUser?.user_id || null });
        await sendLocationClaimApproved({ email: claim.owner_email, phone: claim.owner_phone, locationName: getJoinedValue(claim.activities, "activity_name", "your TheOutHaven location"), signupUrl });
      }
      return Response.json({ success: true, signup_url: signupUrl });
    }

    return Response.json({ error: "Invalid claim type." }, { status: 400 });
  } catch (error: any) {
    return Response.json({ error: error.message || "Server error" }, { status: 500 });
  }
}
