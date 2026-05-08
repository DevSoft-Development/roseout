import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { sendLocationClaimApproved } from "@/lib/notifications";

function getJoinedValue<T extends Record<string, any>>(
  value: T | T[] | null | undefined,
  key: keyof T,
  fallback: string
) {
  if (Array.isArray(value)) {
    return value[0]?.[key] || fallback;
  }

  return value?.[key] || fallback;
}

export async function POST(req: Request) {
  try {
    const { id, type, status } = await req.json();

    if (!id || !type || !status) {
      return Response.json(
        { error: "Missing id, type, or status." },
        { status: 400 }
      );
    }

    if (!["approved", "rejected"].includes(status)) {
      return Response.json({ error: "Invalid status." }, { status: 400 });
    }

    if (!["restaurant", "activity"].includes(type)) {
      return Response.json({ error: "Invalid claim type." }, { status: 400 });
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.vercel.app";

    const signupToken = status === "approved" ? crypto.randomUUID() : null;
    const signupUrl =
      status === "approved"
        ? `${siteUrl}/locations/signup?token=${signupToken}`
        : null;

    if (type === "restaurant") {
      const { data: claim, error: claimLookupError } = await supabase
        .from("restaurant_claims")
        .select(
          `
          id,
          restaurant_id,
          owner_name,
          owner_email,
          owner_phone,
          restaurants (
            restaurant_name
          )
        `
        )
        .eq("id", id)
        .maybeSingle();

      if (claimLookupError || !claim) {
        return Response.json(
          { error: "Restaurant location claim not found." },
          { status: 404 }
        );
      }

      const { error: claimUpdateError } = await supabase
        .from("restaurant_claims")
        .update({
          status,
          owner_signup_token: signupToken,
          owner_signup_url: signupUrl,
        })
        .eq("id", id);

      if (claimUpdateError) {
        return Response.json(
          { error: claimUpdateError.message },
          { status: 500 }
        );
      }

      const { error: restaurantUpdateError } = await supabase
        .from("restaurants")
        .update({
          claim_status: status,
          claimed_by_email: status === "approved" ? claim.owner_email : null,
          claimed_at: status === "approved" ? new Date().toISOString() : null,
          owner_name: status === "approved" ? claim.owner_name : null,
          owner_email: status === "approved" ? claim.owner_email : null,
          owner_phone: status === "approved" ? claim.owner_phone : null,
          owner_signup_token: signupToken,
          owner_signup_url: signupUrl,
        })
        .eq("id", claim.restaurant_id);

      if (restaurantUpdateError) {
        return Response.json(
          { error: restaurantUpdateError.message },
          { status: 500 }
        );
      }

      if (status === "approved") {
        await sendLocationClaimApproved({
          email: claim.owner_email,
          phone: claim.owner_phone,
          locationName: getJoinedValue(
            claim.restaurants,
            "restaurant_name",
            "your TheOutHaven location"
          ),
          signupUrl,
        });
      }

      return Response.json({
        success: true,
        signup_url: signupUrl,
      });
    }

    if (type === "activity") {
      const { data: claim, error: claimLookupError } = await supabase
        .from("activity_claims")
        .select(
          `
          id,
          activity_id,
          owner_name,
          owner_email,
          owner_phone,
          activities (
            activity_name
          )
        `
        )
        .eq("id", id)
        .maybeSingle();

      if (claimLookupError || !claim) {
        return Response.json(
          { error: "Activity location claim not found." },
          { status: 404 }
        );
      }

      const { error: claimUpdateError } = await supabase
        .from("activity_claims")
        .update({
          status,
          owner_signup_token: signupToken,
          owner_signup_url: signupUrl,
        })
        .eq("id", id);

      if (claimUpdateError) {
        return Response.json(
          { error: claimUpdateError.message },
          { status: 500 }
        );
      }

      const { error: activityUpdateError } = await supabase
        .from("activities")
        .update({
          claim_status: status,
          claimed_by_email: status === "approved" ? claim.owner_email : null,
          claimed_at: status === "approved" ? new Date().toISOString() : null,
          owner_name: status === "approved" ? claim.owner_name : null,
          owner_email: status === "approved" ? claim.owner_email : null,
          owner_phone: status === "approved" ? claim.owner_phone : null,
          owner_signup_token: signupToken,
          owner_signup_url: signupUrl,
        })
        .eq("id", claim.activity_id);

      if (activityUpdateError) {
        return Response.json(
          { error: activityUpdateError.message },
          { status: 500 }
        );
      }

      if (status === "approved") {
        await sendLocationClaimApproved({
          email: claim.owner_email,
          phone: claim.owner_phone,
          locationName: getJoinedValue(
            claim.activities,
            "activity_name",
            "your TheOutHaven location"
          ),
          signupUrl,
        });
      }

      return Response.json({
        success: true,
        signup_url: signupUrl,
      });
    }

    return Response.json({ error: "Invalid claim type." }, { status: 400 });
  } catch (error: any) {
    return Response.json(
      { error: error.message || "Server error" },
      { status: 500 }
    );
  }
}