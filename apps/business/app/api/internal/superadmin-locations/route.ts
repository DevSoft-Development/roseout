import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationOwnerAccess } from "@/lib/auth/locationOwnerAccess";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await getLocationOwnerAccess(user.id, user.email);
  if (!access.isSuperadmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const search = String(request.nextUrl.searchParams.get("q") || "").trim().slice(0, 100);
  if (search.length < 2) return NextResponse.json({ locations: [], page: 0, hasMore: false }, { headers: { "Cache-Control": "private, no-store" } });
  const page = Math.min(2000, Math.max(0, Number.parseInt(request.nextUrl.searchParams.get("page") || "0", 10) || 0));
  const limit = 30;
  let query = supabaseAdmin.from("locations")
    .select("id,name,restaurant_name,activity_name,city,state,location_type,is_demo,is_hidden", { count: "exact" })
    .order("id", { ascending: true });
  // Search only after input, never enumerate every location on an empty query.
  // Keep UUID comparisons typed to avoid Postgres uuid cast errors.
  const safe = search.replace(/[%,().*"\\]/g, "").trim();
  if (safe.length < 2) return NextResponse.json({ locations: [], page: 0, hasMore: false });
  const filters = [
    "name", "restaurant_name", "activity_name", "city",
    "phone", "normalized_phone", "owner_email", "claimed_by_email",
    "webmaster_email", "reservation_owner_email",
  ].map(field => `${field}.ilike.%${safe}%`);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(safe)) {
    filters.push(`id.eq.${safe}`);
  }
  query = query.or(filters.join(","));
  const { data, error, count } = await query.range(page * limit, page * limit + limit - 1);
  if (error) return NextResponse.json({ error: "Location search unavailable" }, { status: 503 });
  return NextResponse.json({
    locations: (data || []).filter(row => (!row.is_demo && !row.is_hidden) || (row.id === "642a2ad6-c144-47b7-b9ff-f89554edf0da" && row.is_demo)).map(row => ({
      id: row.id, name: row.name || row.restaurant_name || row.activity_name || "Unnamed location",
      city: row.city, state: row.state, type: row.location_type, isDemo: row.id === "642a2ad6-c144-47b7-b9ff-f89554edf0da" && row.is_demo,
    })),
    page, hasMore: (page + 1) * limit < (count || 0),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
