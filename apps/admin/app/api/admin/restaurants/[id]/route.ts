import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { RESTAURANT_ADMIN_FIELDS } from "@/lib/admin/location-data-projections";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

const STRING_FIELDS = new Set([
  "restaurant_name","name","cuisine","cuisine_type","food_type","primary_category","primary_tag","description","address","formatted_address","city","state","zip_code","postal_code","neighborhood","borough","phone","email","website","website_url","reservation_link","reservation_url","booking_url","external_reservation_url","image_url","main_image","logo_url","price_range","price_level","status","google_place_id","google_maps_url","google_primary_type","atmosphere","lighting","noise_level","dress_code","parking_info","cancellation_policy","reservation_type","photo_status","quality_status","data_status"
]);
const ARRAY_FIELDS = new Set(["images","google_types","tags","vibe_tags","best_for_tags","best_for","special_features","signature_items","search_keywords","review_keywords","date_style_tags"]);
const NUMBER_FIELDS = new Set(["latitude","longitude","rating","review_count","quality_score","max_party_size","reservation_interval_minutes","turn_time_minutes","booking_cutoff_minutes"]);
const BOOLEAN_FIELDS = new Set(["is_featured","is_hidden","is_searchable","is_verified","reservation_enabled"]);
const OBJECT_FIELDS = new Set(["operating_hours","special_hours","holiday_closures"]);

function buildPatch(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (STRING_FIELDS.has(key)) patch[key] = typeof value === "string" ? value.trim().slice(0, key === "description" ? 4000 : 1500) || null : null;
    else if (ARRAY_FIELDS.has(key) && Array.isArray(value)) patch[key] = value.map((item) => String(item).trim().slice(0, 200)).filter(Boolean).slice(0, 100);
    else if (NUMBER_FIELDS.has(key)) { const number = Number(value); if (Number.isFinite(number)) patch[key] = number; }
    else if (BOOLEAN_FIELDS.has(key) && typeof value === "boolean") patch[key] = value;
    else if (OBJECT_FIELDS.has(key) && value && typeof value === "object" && !Array.isArray(value)) patch[key] = value;
  }
  patch.updated_at = new Date().toISOString();
  return patch;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.locations);
  if (auth.error) return auth.error;
  const supabaseAdmin = getSupabaseAdminClient();
  const { id } = await params;
  const { data, error } = await supabaseAdmin.from("restaurants").select(RESTAURANT_ADMIN_FIELDS).eq("id", id).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ restaurant: data });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.locationsEdit);
  if (auth.error) return auth.error;
  const supabaseAdmin = getSupabaseAdminClient();
  const { id } = await params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  const patch = buildPatch(body);
  if (Object.keys(patch).length === 1) return NextResponse.json({ error: "No supported fields to update." }, { status: 400 });
  const { data, error } = await supabaseAdmin.from("restaurants").update(patch).eq("id", id).select(RESTAURANT_ADMIN_FIELDS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ restaurant: data });
}
