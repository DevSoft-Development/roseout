import { NextRequest, NextResponse } from "next/server";

import { ADMIN_ROLES } from "@theouthaven/auth/admin-roles";
import { getCurrentAdminOrNull } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}
function displayName(row: Record<string, any>) {
  return row.name || row.restaurant_name || row.activity_name || row.business_name || "Unnamed location";
}
function hasReserveAccess(row: Record<string, any>) {
  if (row.reservation_enabled === true || row.internal_reservations_enabled === true || row.uses_internal_reservations === true || row.reservation_embed_enabled === true) return true;
  const plan = String(row.plan || row.subscription_plan || row.billing_plan || row.reserve_plan || row.reservation_plan || "").trim().toLowerCase();
  return ["pro", "premium", "enterprise", "white_label", "business_pro"].includes(plan);
}
function compact(row: Record<string, any>) {
  const reserve = hasReserveAccess(row);
  const rawPlan = row.plan || row.subscription_plan || row.billing_plan || row.reserve_plan || row.reservation_plan;
  return {
    id: row.id,
    name: displayName(row),
    location_type: row.location_type || row.source_table || row.primary_category || "Unknown",
    address: row.address || "",
    city: row.city || "",
    state: row.state || "",
    zip_code: row.zip_code || row.zip || "",
    phone: row.phone || "",
    email: row.email || row.owner_email || "",
    plan: reserve ? "Pro" : rawPlan ? String(rawPlan) : "Free",
    reservationAccess: reserve ? "pro" : "free",
  };
}
async function runSearch(q: string, limit: number, offset: number, broad: boolean) {
  const escaped = escapeLike(q);
  const phone = digitsOnly(q);
  const fields = broad
    ? ["id","name","restaurant_name","activity_name","business_name","owner_email","email","phone","address","city","state","zip_code","borough","neighborhood","claim_code"]
    : ["id","name","restaurant_name","activity_name","address","city","state","borough","neighborhood"];
  const filters = fields.map((field) => `${field}.ilike.%${escaped}%`);
  if (phone.length >= 4 && broad) filters.push(`phone.ilike.%${phone}%`);
  return getAdminDatabaseClient().from("locations").select("*", { count: "exact" }).or(filters.join(",")).order("name", { ascending: true }).range(offset, offset + limit - 1);
}

export async function GET(request: NextRequest) {
  const admin = await getCurrentAdminOrNull();
  if (!admin) return NextResponse.json({ success: false, error: "Unauthorized.", results: [] }, { status: 401 });
  if (!(ADMIN_ROLES as readonly string[]).includes(admin.role)) return NextResponse.json({ success: false, error: "Forbidden.", results: [] }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const q = clean(searchParams.get("q"));
  const limit = Math.min(25, Math.max(1, Number(searchParams.get("limit") || 10)));
  const page = Math.max(1, Number(searchParams.get("page") || 1));
  const offset = (page - 1) * limit;
  if (q.length < 2) return NextResponse.json({ success: true, results: [], nextCursor: null });

  let result = await runSearch(q, limit, offset, true);
  if (result.error) result = await runSearch(q, limit, offset, false);
  if (result.error) return NextResponse.json({ success: false, error: result.error.message, results: [] }, { status: 500 });

  const rows = result.data || [];
  await getAdminDatabaseClient().from("admin_location_action_logs").insert({
    admin_user_id: admin.user_id || null,
    admin_email: admin.email || null,
    admin_role: admin.role || null,
    location_id: rows[0]?.id || "00000000-0000-0000-0000-000000000000",
    action_type: "admin_location_search",
    target_type: "location_search",
    metadata: { q, returned: rows.length, page, limit },
    ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null,
    user_agent: request.headers.get("user-agent") || null,
  });

  return NextResponse.json({ success: true, results: rows.map(compact), nextCursor: rows.length === limit ? String(page + 1) : null });
}
