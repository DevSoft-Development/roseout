import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const MAX_PAGE_SIZE = 100;
const MAX_BULK_SIZE = 250;
const SELECT = "id,name,restaurant_name,activity_name,address,city,state,location_type,status,data_status,quality_status,source_quality_status,public_visibility_tier,duplicate_status,is_searchable,is_hidden,is_low_level,has_photos,photo_status,latitude,longitude,import_source,source,low_level_reason";

type LocationRow = Record<string, any>;

type RepairAction = "unhide" | "make_searchable";

function displayName(row: LocationRow) {
  return String(row.name || row.restaurant_name || row.activity_name || "Unnamed location").trim();
}

function publishabilityReasons(row: LocationRow) {
  const reasons: string[] = [];
  const status = String(row.status || "").toLowerCase();
  const duplicateStatus = String(row.duplicate_status || "").toLowerCase();
  const sourceQuality = String(row.source_quality_status || row.quality_status || "").toLowerCase();

  if (!displayName(row) || displayName(row) === "Unnamed location") reasons.push("Missing name");
  if (!String(row.address || "").trim()) reasons.push("Missing address");
  if (!String(row.city || "").trim()) reasons.push("Missing city");
  if (!String(row.state || "").trim()) reasons.push("Missing state");
  if (!Number.isFinite(Number(row.latitude)) || !Number.isFinite(Number(row.longitude))) reasons.push("Invalid coordinates");
  if (row.has_photos !== true && String(row.photo_status || "") === "missing_photo") reasons.push("Missing photo");
  if (["closed", "archived", "deleted", "duplicate", "rejected"].includes(status)) reasons.push(`Status is ${status}`);
  if (duplicateStatus === "duplicate") reasons.push("Marked duplicate");
  if (["low_level_review", "suppressed", "generic_restaurant"].includes(sourceQuality)) reasons.push(`Source quality is ${sourceQuality}`);

  return reasons;
}

export async function GET(request: Request) {
  const auth = await requireAdminApiRole(["superadmin", "admin"]);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(10, Number(searchParams.get("pageSize") || 50)));
  const query = String(searchParams.get("query") || "").trim();
  const state = String(searchParams.get("state") || "").trim().toUpperCase();
  const type = String(searchParams.get("type") || "").trim();
  const reason = String(searchParams.get("reason") || "all");
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let db = supabaseAdmin
    .from("locations")
    .select(SELECT, { count: "exact" })
    .or("is_hidden.eq.true,public_visibility_tier.eq.hidden,is_searchable.eq.false")
    .order("is_hidden", { ascending: false })
    .order("name", { ascending: true })
    .range(from, to);

  if (query) db = db.or(`name.ilike.%${query}%,restaurant_name.ilike.%${query}%,activity_name.ilike.%${query}%,address.ilike.%${query}%`);
  if (state) db = db.eq("state", state);
  if (type) db = db.eq("location_type", type);
  if (reason === "hidden") db = db.eq("is_hidden", true);
  if (reason === "low_level") db = db.eq("is_low_level", true);
  if (reason === "not_searchable") db = db.eq("is_searchable", false);

  const { data, error, count } = await db;
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  const rows = (data || []).map((row: LocationRow) => {
    const reasons = publishabilityReasons(row);
    return {
      ...row,
      display_name: displayName(row),
      repair_reasons: reasons,
      can_make_searchable: reasons.length === 0,
    };
  });

  return NextResponse.json({ success: true, page, pageSize, total: count || 0, rows });
}

export async function POST(request: Request) {
  const auth = await requireAdminApiRole(["superadmin", "admin"]);
  if (auth.error) return auth.error;

  const body = (await request.json().catch(() => ({}))) as { action?: RepairAction; locationIds?: string[]; dryRun?: boolean };
  const action: RepairAction = body.action === "unhide" ? "unhide" : "make_searchable";
  const ids = Array.from(new Set((body.locationIds || []).filter(Boolean))).slice(0, MAX_BULK_SIZE);
  const dryRun = body.dryRun === true;

  if (!ids.length) return NextResponse.json({ success: false, error: "Select at least one location." }, { status: 400 });

  const { data, error } = await supabaseAdmin.from("locations").select(SELECT).in("id", ids);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  let repaired = 0;
  let skipped = 0;
  const results: any[] = [];

  for (const row of (data || []) as LocationRow[]) {
    const reasons = publishabilityReasons(row);
    if (action === "make_searchable" && reasons.length) {
      skipped += 1;
      results.push({ id: row.id, name: displayName(row), status: "skipped", reasons });
      continue;
    }

    const update = action === "unhide"
      ? {
          is_hidden: false,
          public_visibility_tier: row.public_visibility_tier === "hidden" ? "standard" : row.public_visibility_tier,
        }
      : {
          is_hidden: false,
          is_low_level: false,
          low_level_reason: null,
          public_visibility_tier: "standard",
          is_searchable: true,
          data_status: "clean",
          quality_status: "publish_ready",
          source_quality_status: row.source_quality_status === "low_level_review" ? "needs_enrichment" : row.source_quality_status,
        };

    if (!dryRun) {
      const { error: updateError } = await supabaseAdmin.from("locations").update(update).eq("id", row.id);
      if (updateError) {
        skipped += 1;
        results.push({ id: row.id, name: displayName(row), status: "failed", reasons: [updateError.message] });
        continue;
      }
    }

    repaired += 1;
    results.push({ id: row.id, name: displayName(row), status: dryRun ? "would_repair" : "repaired", update });
  }

  return NextResponse.json({ success: true, dryRun, action, scanned: data?.length || 0, repaired, skipped, results });
}
