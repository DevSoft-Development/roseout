import { NextRequest } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { resolveMobileIdentity } from "../../_lib/identity";
import { mobileError, mobileJson } from "../../_lib/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanText(value: unknown, max = 512) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function validExpoToken(value: string | null) {
  return Boolean(value && (/^ExponentPushToken\[[^\]]+\]$/.test(value) || /^ExpoPushToken\[[^\]]+\]$/.test(value)));
}

async function requireUser(request: NextRequest) {
  const identity = await resolveMobileIdentity(request);
  return identity?.kind === "user" ? identity.userId : null;
}

export async function POST(request: NextRequest) {
  const userId = await requireUser(request);
  if (!userId) return mobileError("AUTH_REQUIRED", "Sign in to enable push notifications.", 401);

  const body = await request.json().catch(() => ({}));
  const token = cleanText(body?.expoPushToken, 512);
  const platform = body?.platform === "ios" || body?.platform === "android" ? body.platform : null;
  if (!validExpoToken(token) || !platform) return mobileError("INVALID_PUSH_DEVICE", "A valid Expo push token and platform are required.", 400);

  const now = new Date().toISOString();
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("mobile_push_devices")
    .upsert({
      user_id: userId,
      expo_push_token: token,
      platform,
      device_name: cleanText(body?.deviceName, 160),
      app_version: cleanText(body?.appVersion, 64),
      notifications_enabled: body?.notificationsEnabled !== false,
      transactional_enabled: body?.transactionalEnabled !== false,
      marketing_enabled: body?.marketingEnabled === true,
      last_seen_at: now,
      updated_at: now,
    }, { onConflict: "expo_push_token" })
    .select("id,notifications_enabled,transactional_enabled,marketing_enabled,last_seen_at")
    .single();

  if (error) return mobileError("PUSH_DEVICE_SAVE_FAILED", "This device could not be registered for notifications yet.", 500);
  return mobileJson({ ok: true, device: data });
}

export async function PATCH(request: NextRequest) {
  const userId = await requireUser(request);
  if (!userId) return mobileError("AUTH_REQUIRED", "Sign in to update notification preferences.", 401);

  const body = await request.json().catch(() => ({}));
  const token = cleanText(body?.expoPushToken, 512);
  if (!validExpoToken(token)) return mobileError("INVALID_PUSH_TOKEN", "A valid Expo push token is required.", 400);

  const admin = getSupabaseAdminClient();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString(), last_seen_at: new Date().toISOString() };
  if (typeof body?.notificationsEnabled === "boolean") update.notifications_enabled = body.notificationsEnabled;
  if (typeof body?.transactionalEnabled === "boolean") update.transactional_enabled = body.transactionalEnabled;
  if (typeof body?.marketingEnabled === "boolean") update.marketing_enabled = body.marketingEnabled;

  const { data, error } = await admin.from("mobile_push_devices")
    .update(update)
    .eq("user_id", userId)
    .eq("expo_push_token", token)
    .select("id,notifications_enabled,transactional_enabled,marketing_enabled,last_seen_at")
    .maybeSingle();

  if (error) return mobileError("PUSH_PREFERENCES_SAVE_FAILED", "Notification preferences could not be updated.", 500);
  if (!data) return mobileError("PUSH_DEVICE_NOT_FOUND", "This device is not registered yet.", 404);
  return mobileJson({ ok: true, device: data });
}

export async function DELETE(request: NextRequest) {
  const userId = await requireUser(request);
  if (!userId) return mobileError("AUTH_REQUIRED", "Sign in to disable notifications.", 401);
  const token = request.nextUrl.searchParams.get("token");
  if (!validExpoToken(token)) return mobileError("INVALID_PUSH_TOKEN", "A valid Expo push token is required.", 400);

  const admin = getSupabaseAdminClient();
  const { error } = await admin.from("mobile_push_devices")
    .update({ notifications_enabled: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("expo_push_token", token!);

  if (error) return mobileError("PUSH_DEVICE_DISABLE_FAILED", "Notifications could not be disabled on this device.", 500);
  return mobileJson({ ok: true });
}
