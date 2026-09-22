import { NextRequest } from "next/server";
import { resolveMobileIdentity } from "@/app/api/mobile/v1/_lib/identity";
import { mobileError, mobileJson } from "@/app/api/mobile/v1/_lib/response";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export async function GET(req: NextRequest) {
  const identity = await resolveMobileIdentity(req);
  if (!identity) {
    return mobileError("mobile_identity_required", "A valid mobile user or guest session is required.", 401);
  }

  if (identity.kind === "guest") {
    return mobileJson({
      ok: true,
      profile: {
        kind: "guest",
        userId: null,
        guestId: identity.guestId,
        firstName: null,
        email: null,
        phone: null,
        birthMonth: null,
        homeNeighborhood: null,
        homeBorough: null,
        homeCity: null,
        homeState: null,
        smsConsent: false,
        personalizationEnabled: false,
      },
    });
  }

  const admin = getSupabaseAdminClient();
  const { data } = await admin
    .from("consumer_profiles")
    .select("first_name,phone_e164,birth_month,home_neighborhood,home_borough,home_city,home_state,sms_consent,personalization_enabled")
    .eq("user_id", identity.userId)
    .maybeSingle();

  return mobileJson({
    ok: true,
    profile: {
      kind: "user",
      userId: identity.userId,
      guestId: identity.guestId,
      firstName: data?.first_name ?? null,
      email: identity.email,
      phone: data?.phone_e164 ?? null,
      birthMonth: data?.birth_month ?? null,
      homeNeighborhood: data?.home_neighborhood ?? null,
      homeBorough: data?.home_borough ?? null,
      homeCity: data?.home_city ?? null,
      homeState: data?.home_state ?? null,
      smsConsent: Boolean(data?.sms_consent),
      personalizationEnabled: data?.personalization_enabled !== false,
    },
  });
}


export async function PATCH(req: NextRequest) {
  const identity = await resolveMobileIdentity(req);
  if (!identity || identity.kind !== "user") {
    return mobileError("mobile_user_required", "Sign in to change recommendation privacy settings.", 401);
  }

  let body: { personalizationEnabled?: unknown };
  try {
    body = await req.json();
  } catch {
    return mobileError("invalid_json", "Privacy preference request was not valid JSON.", 400);
  }

  if (typeof body.personalizationEnabled !== "boolean") {
    return mobileError("invalid_personalization_preference", "personalizationEnabled must be boolean.", 400);
  }

  const updatedAt = new Date().toISOString();
  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from("consumer_profiles")
    .upsert({
      user_id: identity.userId,
      personalization_enabled: body.personalizationEnabled,
      personalization_updated_at: updatedAt,
      updated_at: updatedAt,
    }, { onConflict: "user_id" });

  if (error) {
    return mobileError("privacy_preference_update_failed", "Could not update recommendation privacy settings.", 500);
  }

  return mobileJson({
    ok: true,
    personalizationEnabled: body.personalizationEnabled,
    updatedAt,
  });
}
