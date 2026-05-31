import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildLocationCleanupUpdates } from "@/lib/location-growth/cleanExistingLocations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_LIMIT = 500;

async function authorize(request: NextRequest) {
  const importSecret = process.env.IMPORT_SECRET;

  if (
    importSecret &&
    request.headers.get("x-internal-import-secret") === importSecret
  ) {
    return null;
  }

  // Browser-triggered cleanup relies on the signed-in admin session. In
  // development, IMPORT_SECRET may be omitted, but normal users must still be
  // blocked by admin API authorization.
  const { error } = await requireAdminApiRole(["admin", "superadmin"]);
  return error;
}
function numberParam(value: unknown, fallback: number) { const n = Number(value ?? fallback); return Number.isInteger(n) ? n : fallback; }
function validTable(table: string) { return table === "locations"; }

async function cleanBatch(limit: number, offset: number) {
  const from = offset;
  const to = offset + limit - 1;
  const { data, error } = await supabaseAdmin.from("locations").select("*").range(from, to);
  if (error) throw error;
  let updated = 0;
  const errors: Array<{ id: string | number; error: string }> = [];
  for (const row of data || []) {
    try {
      const updates = buildLocationCleanupUpdates(row);
      const { error: updateError } = await supabaseAdmin.from("locations").update(updates).eq("id", row.id);
      if (updateError) throw updateError;
      updated += 1;
    } catch (error) {
      errors.push({ id: row.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { processed: data?.length || 0, updated, nextOffset: (data?.length || 0) < limit ? null : offset + limit, errors };
}

export async function GET(request: NextRequest) {
  const authError = await authorize(request);
  if (authError) return authError;
  const params = request.nextUrl.searchParams;
  const table = params.get("table") || "locations";
  if (!validTable(table)) return NextResponse.json({ success: false, error: "Only table=locations is supported." }, { status: 400 });
  if (params.get("rpc") === "true" || params.get("full") === "true") {
    const { data, error } = await supabaseAdmin.rpc("oh_refresh_location_quality");
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, processed: data || 0, updated: data || 0, nextOffset: null, mode: "rpc" });
  }
  const limit = Math.min(Math.max(numberParam(params.get("limit"), 100), 1), MAX_LIMIT);
  const offset = Math.max(numberParam(params.get("offset"), 0), 0);
  const result = await cleanBatch(limit, offset);
  return NextResponse.json({ success: true, table, ...result });
}

export async function POST(request: NextRequest) {
  const authError = await authorize(request);
  if (authError) return authError;
  const body = await request.json().catch(() => ({}));
  const table = body.table || "locations";
  if (!validTable(table)) return NextResponse.json({ success: false, error: "Only table=locations is supported." }, { status: 400 });
  if (body.rpc === true || body.full === true) {
    const { data, error } = await supabaseAdmin.rpc("oh_refresh_location_quality");
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, processed: data || 0, updated: data || 0, nextOffset: null, mode: "rpc" });
  }
  const limit = Math.min(Math.max(numberParam(body.limit, 100), 1), MAX_LIMIT);
  const offset = Math.max(numberParam(body.offset, 0), 0);
  const result = await cleanBatch(limit, offset);
  return NextResponse.json({ success: true, table, ...result });
}
