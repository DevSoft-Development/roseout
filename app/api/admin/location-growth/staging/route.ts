import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorize(request: NextRequest) {
  if (process.env.NODE_ENV === "development") return null;
  if (
    process.env.IMPORT_SECRET &&
    request.headers.get("x-internal-import-secret") === process.env.IMPORT_SECRET
  ) {
    return null;
  }
  const { error } = await requireAdminApiRole(["admin", "superadmin"]);
  return error;
}

export async function GET(request: NextRequest) {
  const auth = await authorize(request);
  if (auth) return auth;

  const batchId = request.nextUrl.searchParams.get("batchId");
  if (!batchId) {
    return NextResponse.json(
      { success: false, error: "batchId is required." },
      { status: 400 },
    );
  }

  const page = Math.max(Number(request.nextUrl.searchParams.get("page")) || 1, 1);
  const limit = Math.min(
    Math.max(Number(request.nextUrl.searchParams.get("limit")) || 50, 1),
    200,
  );
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, count, error } = await supabaseAdmin
    .from("location_import_staging")
    .select(
      "id,source,name,address,city,state,primary_category,quality_score,quality_status,duplicate_status,import_status,matched_location_id,rejection_reason",
      { count: "exact" },
    )
    .eq("batch_id", batchId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    batchId,
    page,
    limit,
    total: count || 0,
    records: data || [],
  });
}
