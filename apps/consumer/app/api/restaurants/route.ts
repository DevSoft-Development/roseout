import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isPublicSearchVisible } from "@/lib/locationVisibility";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const PUBLIC_RESTAURANT_LOCATION_SELECT = `
  id,
  location_type,
  restaurant_name,
  name,
  address,
  city,
  state,
  zip_code,
  latitude,
  longitude,
  neighborhood,
  description,
  primary_category,
  cuisine,
  cuisine_type,
  primary_tag,
  tags,
  google_types,
  search_keywords,
  main_image,
  image_url,
  rating,
  review_count,
  theouthaven_score,
  external_reservation_url,
  reservation_url,
  reservation_link,
  is_searchable,
  quality_status,
  duplicate_status,
  duplicate_of,
  deleted_at,
  has_photos,
  photo_status,
  data_status,
  missing_fields,
  is_hidden,
  status,
  is_low_level,
  public_visibility_tier,
  curation_tier,
  source_quality_status,
  import_confidence
`;

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select(PUBLIC_RESTAURANT_LOCATION_SELECT)
    .eq("location_type", "restaurant")
    .eq("is_searchable", true)
    .eq("quality_status", "publish_ready")
    .or("duplicate_status.is.null,duplicate_status.neq.duplicate")
    .is("duplicate_of", null)
    .eq("has_photos", true)
    .not("photo_status", "eq", "missing_photo")
    .eq("data_status", "clean")
    .not("is_hidden", "is", true)
    .is("deleted_at", null)
    .not("status", "in", '("closed","archived")')
    .or("is_low_level.is.null,is_low_level.eq.false")
    .not("public_visibility_tier", "in", '("low_level","hidden")')
    .not("curation_tier", "eq", "low_level")
    .not("source_quality_status", "in", '("imported_unverified","generic_restaurant","needs_enrichment","low_level_review")')
    .not("import_confidence", "eq", "low")
    .order("theouthaven_score", { ascending: false, nullsFirst: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    restaurants: (data || []).filter((location) => isPublicSearchVisible(location)),
  });
}
