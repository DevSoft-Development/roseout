import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StagedRow = {
  id: string;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  address?: string | null;
};

type LocationRow = {
  id: string;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  address?: string | null;
};

async function authorize(request: NextRequest) {
  if (process.env.NODE_ENV === "development") return null;
  if (
    process.env.IMPORT_SECRET &&
    request.headers.get("x-internal-import-secret") === process.env.IMPORT_SECRET
  ) {
    return null;
  }
  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.locationGrowth);
  return error;
}

function displayName(row?: StagedRow | LocationRow) {
  return row?.name || row?.restaurant_name || row?.activity_name || null;
}

export async function GET(request: NextRequest) {
  const auth = await authorize(request);
  if (auth) return auth;

  const batchId = request.nextUrl.searchParams.get("batchId");
  const limit = Math.min(
    Math.max(Number(request.nextUrl.searchParams.get("limit")) || 50, 1),
    200,
  );

  let stagingQuery = supabaseAdmin
    .from("location_import_staging")
    .select("id")
    .eq("duplicate_status", "possible_duplicate");
  if (batchId) stagingQuery = stagingQuery.eq("batch_id", batchId);

  const { data: stagingIds, error: stagingIdsError } = await stagingQuery.limit(500);
  if (stagingIdsError) {
    return NextResponse.json(
      { success: false, error: stagingIdsError.message },
      { status: 500 },
    );
  }

  const ids = (stagingIds || []).map((row) => row.id);
  if (!ids.length) return NextResponse.json({ success: true, matches: [] });

  const { data: matches, error } = await supabaseAdmin
    .from("location_duplicate_matches")
    .select("id,staging_id,existing_location_id,duplicate_score,match_reasons,decision,created_at")
    .in("staging_id", ids)
    .order("duplicate_score", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }

  const matchRows = matches || [];
  const stageIds = [...new Set(matchRows.map((row) => row.staging_id).filter(Boolean))];
  const locationIds = [
    ...new Set(matchRows.map((row) => row.existing_location_id).filter(Boolean)),
  ];

  const [{ data: stagedRows }, { data: locationRows }] = await Promise.all([
    supabaseAdmin
      .from("location_import_staging")
      .select("id,name,restaurant_name,activity_name,address")
      .in("id", stageIds),
    supabaseAdmin
      .from("locations")
      .select("id,name,restaurant_name,activity_name,address")
      .in("id", locationIds),
  ]);

  const stagedById = new Map((stagedRows || []).map((row) => [row.id, row]));
  const locationsById = new Map((locationRows || []).map((row) => [row.id, row]));

  return NextResponse.json({
    success: true,
    matches: matchRows.map((match) => {
      const staged = stagedById.get(match.staging_id);
      const existing = locationsById.get(match.existing_location_id);
      return {
        id: match.id,
        stagingId: match.staging_id,
        existingLocationId: match.existing_location_id,
        stagedName: displayName(staged),
        stagedAddress: staged?.address || null,
        existingName: displayName(existing),
        existingAddress: existing?.address || null,
        duplicateScore: match.duplicate_score,
        matchReasons: match.match_reasons || [],
        decision: match.decision,
      };
    }),
  });
}
