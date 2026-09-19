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
      },
    });
  }

  const admin = getSupabaseAdminClient();
  const { data } = await admin
    .from("consumer_profiles")
    .select("first_name,phone_e164,birth_month,home_neighborhood,home_borough,home_city,home_state,sms_consent")
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
    },
  });
}
