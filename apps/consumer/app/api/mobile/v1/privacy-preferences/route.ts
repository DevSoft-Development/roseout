import { NextRequest } from "next/server";
import { resolveMobileIdentity } from "@/app/api/mobile/v1/_lib/identity";
import { mobileError, mobileJson } from "@/app/api/mobile/v1/_lib/response";
import { getPersonalizationPreferences, setPersonalizationPreferences } from "@/lib/privacy/personalization-preferences";

export async function GET(req: NextRequest) {
  const identity = await resolveMobileIdentity(req);
  if (!identity || identity.kind !== "user") return mobileError("authentication_required", "Sign in to manage personalization.", 401);
  try {
    return mobileJson({ ok: true, preferences: await getPersonalizationPreferences(identity.userId) });
  } catch {
    return mobileError("preferences_unavailable", "Privacy controls are temporarily unavailable.", 503);
  }
}

export async function PATCH(req: NextRequest) {
  const identity = await resolveMobileIdentity(req);
  if (!identity || identity.kind !== "user") return mobileError("authentication_required", "Sign in to manage personalization.", 401);
  const body = await req.json().catch(() => ({}));
  const update: { personalizationEnabled?: boolean; searchHistoryPersonalizationEnabled?: boolean } = {};
  if (typeof body.personalizationEnabled === "boolean") update.personalizationEnabled = body.personalizationEnabled;
  if (typeof body.searchHistoryPersonalizationEnabled === "boolean") update.searchHistoryPersonalizationEnabled = body.searchHistoryPersonalizationEnabled;
  try {
    return mobileJson({ ok: true, preferences: await setPersonalizationPreferences(identity.userId, update) });
  } catch {
    return mobileError("preferences_save_failed", "Privacy controls could not be saved.", 503);
  }
}
