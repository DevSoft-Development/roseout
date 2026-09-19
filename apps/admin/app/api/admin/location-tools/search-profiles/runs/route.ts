import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { LOCATION_SEARCH_PROFILE_RUN_FIELDS } from "@/lib/admin/location-data-projections";
import { createProfileRun } from "@/lib/search/profile/profileRunRepository";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";

export async function GET() {
  const auth = await requireAdminApiRole(["superadmin", "admin"]);
  if (auth.error) return auth.error;
  const result = await supabaseAdmin.from("location_search_profile_runs").select(LOCATION_SEARCH_PROFILE_RUN_FIELDS).order("created_at", { ascending: false }).limit(100);
  return result.error ? NextResponse.json({ error: result.error.message }, { status: 500 }) : NextResponse.json({ runs: result.data });
}

export async function POST(request: Request) {
  const auth = await requireAdminApiRole(["superadmin", "admin"]);
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => ({}));
  if (typeof body.mode !== "string" || !body.mode.trim()) return NextResponse.json({ error: "mode is required" }, { status: 400 });
  const ids = Array.isArray(body.locationIds) && body.locationIds.every((id: unknown) => typeof id === "string") ? body.locationIds.slice(0, 500) : undefined;
  try {
    return NextResponse.json({
      run: await createProfileRun({
        mode: body.mode.trim().slice(0, 80),
        filters: typeof body.filters === "object" && body.filters && !Array.isArray(body.filters) ? body.filters : {},
        configuration: typeof body.configuration === "object" && body.configuration && !Array.isArray(body.configuration) ? body.configuration : {},
        requestedBy: auth.adminUser?.user_id ?? "",
        locationIds: ids,
      }),
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Run creation failed" }, { status: 500 });
  }
}
