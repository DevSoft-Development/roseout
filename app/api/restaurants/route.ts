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
  data_status,
  missing_fields,
  is_hidden,
  status
`;

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select(PUBLIC_RESTAURANT_LOCATION_SELECT)
    .eq("location_type", "restaurant")
    .eq("is_searchable", true)
    .eq("data_status", "clean")
    .not("is_hidden", "is", true)
    .not("status", "in", '("closed","archived")')
    .order("theouthaven_score", { ascending: false, nullsFirst: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    restaurants: (data || []).filter(isPublicSearchVisible),
  });
}
