import { NextResponse } from "next/server";

import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { DEFAULT_SEARCH_LIMITS } from "@/lib/search-usage-limits";

export async function GET() {
  const { error } = await requireAdminApiRole(["superadmin"]);
  if (error) return error;

  const { data } = await getAdminDatabaseClient()
    .from("app_settings")
    .select("value")
    .eq("key", "search_usage_limits")
    .maybeSingle();

  return NextResponse.json({
    settings: { ...DEFAULT_SEARCH_LIMITS, ...(data?.value || {}) },
  });
}

export async function PATCH(request: Request) {
  const { adminUser, error } = await requireAdminApiRole(["superadmin"]);
  if (error || !adminUser) {
    return error || NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const value = { ...DEFAULT_SEARCH_LIMITS, ...body };

  const { error: saveError } = await getAdminDatabaseClient()
    .from("app_settings")
    .upsert({
      key: "search_usage_limits",
      value,
      updated_by: adminUser.user_id,
      updated_at: new Date().toISOString(),
    });

  if (saveError) {
    return NextResponse.json({ error: saveError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, settings: value });
}
