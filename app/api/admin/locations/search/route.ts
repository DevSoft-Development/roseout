import { NextRequest, NextResponse } from "next/server";
import { requireAdminLocationApiRead } from "@/lib/admin/admin-access";
import { logAdminLocationAction } from "@/lib/admin/audit-log";
import { getDisplayLocationName } from "@/lib/admin/admin-location-context";
import { hasReserveAccess } from "@/lib/reserve-access";
import { supabaseAdmin } from "@/lib/supabase-admin";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function planLabel(row: Record<string, any>) {
  if (hasReserveAccess(row)) return "Pro";
  const value = row.plan || row.subscription_plan || row.billing_plan || row.reserve_plan || row.reservation_plan;
  return value ? String(value) : "Free";
}

function compact(row: Record<string, any>) {
  const type = row.location_type || row.source_table || row.primary_category || "Unknown";
  return {
    id: row.id,
    name: getDisplayLocationName(row),
    location_type: type,
    address: row.address || "",
    city: row.city || "",
    state: row.state || "",
    zip_code: row.zip_code || row.zip || "",
    phone: row.phone || "",
    email: row.email || row.owner_email || "",
    plan: planLabel(row),
    reservationAccess: hasReserveAccess(row) ? "pro" : "free",
    source_table: row.source_table || row.location_type || null,
  };
}

async function runSearch(q: string, limit: number, offset: number, broad: boolean) {
  const escaped = escapeLike(q);
  const phone = digitsOnly(q);
  const fields = broad
    ? ["id", "name", "restaurant_name", "activity_name", "business_name", "owner_email", "email", "phone", "address", "city", "state", "zip_code", "borough", "neighborhood", "claim_code"]
    : ["id", "name", "restaurant_name", "activity_name", "address", "city", "state", "borough", "neighborhood"];
  const filters = fields.map((field) => `${field}.ilike.%${escaped}%`);
  if (phone.length >= 4 && broad) filters.push(`phone.ilike.%${phone}%`);

  return supabaseAdmin
    .from("locations")
    .select("*", { count: "exact" })
    .or(filters.join(","))
    .order("name", { ascending: true })
    .range(offset, offset + limit - 1);
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminLocationApiRead();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const q = clean(searchParams.get("q"));
  const limit = Math.min(25, Math.max(1, Number(searchParams.get("limit") || 10)));
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const offset = (page - 1) * limit;

  if (q.length < 2) {
    return NextResponse.json({ success: true, results: [], nextCursor: null });
  }

  let result = await runSearch(q, limit, offset, true);
  if (result.error) {
    result = await runSearch(q, limit, offset, false);
  }

  if (result.error) {
    return NextResponse.json({ success: false, error: result.error.message, results: [] }, { status: 500 });
  }

  const rows = result.data || [];
  await logAdminLocationAction({
    adminUser: auth.adminUser,
    locationId: rows[0]?.id || "00000000-0000-0000-0000-000000000000",
    actionType: "admin_location_search",
    targetType: "location_search",
    metadata: { q, returned: rows.length, page, limit },
    request,
  });

  return NextResponse.json({
    success: true,
    results: rows.map(compact),
    nextCursor: rows.length === limit ? String(page + 1) : null,
  });
}
