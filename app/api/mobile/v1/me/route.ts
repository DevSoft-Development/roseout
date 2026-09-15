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
        email: null,
        phone: null,
        birthMonth: null,
        smsConsent: false,
      },
    });
  }

  const admin = getSupabaseAdminClient();
  const { data } = await admin
    .from("consumer_profiles")
    .select("phone_e164,birth_month,sms_consent")
    .eq("user_id", identity.userId)
    .maybeSingle();

  return mobileJson({
    ok: true,
    profile: {
      kind: "user",
      userId: identity.userId,
      guestId: identity.guestId,
      email: identity.email,
      phone: data?.phone_e164 ?? null,
      birthMonth: data?.birth_month ?? null,
      smsConsent: Boolean(data?.sms_consent),
    },
  });
}
