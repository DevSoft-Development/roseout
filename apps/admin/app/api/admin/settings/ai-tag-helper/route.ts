import { NextResponse } from "next/server";

import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import {
  AI_TAG_HELPER_ACCESS_VALUES,
  AI_TAG_HELPER_SETTINGS_KEY,
  DEFAULT_AI_TAG_HELPER_SETTINGS,
  normalizeAiTagHelperSettings,
} from "@/lib/ai-tag-helper-settings";

export async function GET() {
  const { error } = await requireAdminApiRole(["superadmin"]);
  if (error) return error;

  const { data } = await getAdminDatabaseClient()
    .from("app_settings")
    .select("value")
    .eq("key", AI_TAG_HELPER_SETTINGS_KEY)
    .maybeSingle();

  return NextResponse.json({
    settings: normalizeAiTagHelperSettings(data?.value),
  });
}

export async function PATCH(request: Request) {
  const { adminUser, error } = await requireAdminApiRole(["superadmin"]);
  if (error || !adminUser) {
    return error || NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  if (!AI_TAG_HELPER_ACCESS_VALUES.includes(body?.access)) {
    return NextResponse.json(
      { error: "Invalid AI Tag Helper access value." },
      { status: 400 },
    );
  }

  const value = {
    ...DEFAULT_AI_TAG_HELPER_SETTINGS,
    access: body.access,
  };

  const { error: saveError } = await getAdminDatabaseClient()
    .from("app_settings")
    .upsert({
      key: AI_TAG_HELPER_SETTINGS_KEY,
      value,
      updated_by: adminUser.user_id,
      updated_at: new Date().toISOString(),
    });

  if (saveError) {
    return NextResponse.json({ error: saveError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, settings: value });
}
