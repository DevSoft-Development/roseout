import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);


const ACTIVITY_UPDATE_COLUMNS =
  "id, name, activity_name, primary_category, activity_type, primary_tag, tags, google_types, address, city, state, zip_code, status, is_searchable, data_status, missing_fields, is_hidden, last_quality_check_at, is_claimed, claimed, claim_status, claimed_at, claimed_by_email, owner_user_id, rating, view_count, click_count, theouthaven_score, roseout_score, quality_score, trend_score, conversion_score, review_score, popularity_score, ranking_badge, main_image, image_url, images, updated_at";

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

export async function POST(req: NextRequest) {
  const body = await req.json();

  const { user_id, activity_id, location_id, is_admin, ...updates } = body;

  const targetActivityId = activity_id || location_id;

  if (!user_id || !targetActivityId) {
    return NextResponse.json(
      { error: "Missing user or activity." },
      { status: 400 }
    );
  }

  // Regular owners must be linked to this activity.
  // Admin/superadmin can update any activity.
  if (!is_admin) {
    const { data: ownerRecord, error: ownerError } = await supabaseAdmin
      .from("activity_owners")
      .select("activity_id")
      .eq("user_id", user_id)
      .eq("activity_id", targetActivityId)
      .maybeSingle();

    if (ownerError || !ownerRecord) {
      return NextResponse.json(
        { error: "You do not have permission to update this activity." },
        { status: 403 }
      );
    }
  }

  const { data: activity, error } = await supabaseAdmin
    .from("activities")
    .update(sanitizeActivityUpdates(updates))
    .eq("id", targetActivityId)
    .select(ACTIVITY_UPDATE_COLUMNS)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ activity });
}