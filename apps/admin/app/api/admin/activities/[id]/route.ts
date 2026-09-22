import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

const ACTIVITY_UPDATE_BLOCKLIST = new Set([
  "cuisine",
  "cuisine_type",
  "food_type",
  "hours_of_operation",
  "days_of_operation",
  "kitchen_closing_time",
  "google_maps_link",
]);

function sanitizeActivityUpdates(updates: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(updates).filter(([key]) => !ACTIVITY_UPDATE_BLOCKLIST.has(key))
  );
}

const ACTIVITY_WITH_OWNERS_SELECT = `
  id,
  name,
  activity_name,
  primary_category,
  activity_type,
  primary_tag,
  tags,
  google_types,
  address,
  city,
  state,
  zip_code,
  status,
  is_searchable,
  data_status,
  missing_fields,
  is_hidden,
  last_quality_check_at,
  is_claimed,
  claimed,
  claim_status,
  claimed_at,
  claimed_by_email,
  owner_user_id,
  rating,
  review_count,
  view_count,
  click_count,
  theouthaven_score,
  roseout_score,
  quality_score,
  trend_score,
  conversion_score,
  review_score,
  popularity_score,
  ranking_badge,
  main_image,
  image_url,
  images,
  description,
  price_range,
  atmosphere,
  group_friendly,
  external_reservation_url,
  reservation_url,
  reservation_link,
  reservation_enabled,
  website,
  phone,
  date_style_tags,
  detail_url,
  claim_url,
  neighborhood,
  latitude,
  longitude,
  noise_level,
  dress_code,
  parking_info,
  operating_hours,
  special_hours,
  holiday_closures,
  hours,
  best_for,
  special_features,
  signature_items,
  search_keywords,
  review_keywords,
  review_snippet,
  google_maps_url,
  price_level,
  created_at,
  activity_owners (
    id,
    user_id,
    email
  )
`;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.locations);
  if (auth.error) return auth.error;
  const supabaseAdmin = getSupabaseAdminClient();
  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("activities")
    .select(ACTIVITY_WITH_OWNERS_SELECT)
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ activity: data });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.locationsEdit);
  if (auth.error) return auth.error;
  const supabaseAdmin = getSupabaseAdminClient();
  const { id } = await params;
  const body = await request.json();

  const { owner_email, activity_owners, ...rawUpdates } = body;
  const updates = sanitizeActivityUpdates(rawUpdates);

  const { data: activity, error } = await supabaseAdmin
    .from("activities")
    .update(updates)
    .eq("id", id)
    .select(ACTIVITY_WITH_OWNERS_SELECT)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (owner_email !== undefined) {
    const { data: existingOwner } = await supabaseAdmin
      .from("activity_owners")
      .select("id")
      .eq("activity_id", id)
      .maybeSingle();

    if (existingOwner) {
      await supabaseAdmin
        .from("activity_owners")
        .update({ email: owner_email })
        .eq("activity_id", id);
    } else if (owner_email) {
      await supabaseAdmin.from("activity_owners").insert({
        activity_id: id,
        email: owner_email,
      });
    }
  }

  const { data: updatedActivity } = await supabaseAdmin
    .from("activities")
    .select(ACTIVITY_WITH_OWNERS_SELECT)
    .eq("id", id)
    .single();

  return NextResponse.json({ activity: updatedActivity || activity });
}