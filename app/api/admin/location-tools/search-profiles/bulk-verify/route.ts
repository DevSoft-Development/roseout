import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { SEARCH_PROFILE_VERSION } from "@/lib/search/profile";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { NextResponse } from "next/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SELECTED = 500;

type RequestBody = {
  locationIds?: unknown;
  override?: unknown;
  reason?: unknown;
};

export async function POST(request: Request) {
  const auth = await requireAdminApiRole(["superadmin", "admin"]);
  if (auth.error) return auth.error;

  const body = (await request.json().catch(() => ({}))) as RequestBody;
  const locationIds = Array.isArray(body.locationIds)
    ? [...new Set(body.locationIds.filter((value): value is string => typeof value === "string" && UUID.test(value)))].slice(0, MAX_SELECTED)
    : [];
  const override = body.override === true;
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";

  if (!locationIds.length) {
    return NextResponse.json({ error: "Select at least one valid profile." }, { status: 400 });
  }
  if (override && auth.adminUser?.role !== "superadmin") {
    return NextResponse.json({ error: "Only superadmins can override verification safeguards." }, { status: 403 });
  }
  if (override && reason.length < 10) {
    return NextResponse.json({ error: "An override reason of at least 10 characters is required." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("location_search_profiles")
    .select("location_id,needs_review,confidence,profile_version,primary_domain,canonical_terms")
    .in("location_id", locationIds);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const eligible = rows.filter((profile) =>
    override || (
      profile.needs_review !== true &&
      Number(profile.confidence ?? 0) >= 0.55 &&
      Number(profile.profile_version ?? 0) >= SEARCH_PROFILE_VERSION &&
      typeof profile.primary_domain === "string" &&
      Array.isArray(profile.canonical_terms) &&
      profile.canonical_terms.length > 0
    ),
  );
  const eligibleIds = eligible.map((profile) => profile.location_id);
  const skippedIds = locationIds.filter((id) => !eligibleIds.includes(id));

  if (!eligibleIds.length) {
    return NextResponse.json({ verified: 0, skipped: skippedIds.length, skippedIds });
  }

  const now = new Date().toISOString();
  const update = await supabaseAdmin
    .from("location_search_profiles")
    .update({
      verified_at: now,
      verified_by: auth.adminUser!.user_id,
      verification_source: override ? "bulk_admin_override" : "bulk_admin",
      verification_note: override ? reason : null,
      updated_at: now,
    })
    .in("location_id", eligibleIds)
    .select("location_id");

  if (update.error) return NextResponse.json({ error: update.error.message }, { status: 500 });
  return NextResponse.json({
    verified: update.data?.length ?? 0,
    skipped: skippedIds.length,
    skippedIds,
  });
}
