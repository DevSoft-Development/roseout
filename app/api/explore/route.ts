import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const revalidate = 300;

const CARD_FIELDS = [
  "id",
  "source_table",
  "location_type",
  "name",
  "restaurant_name",
  "activity_name",
  "main_image",
  "image_url",
  "images",
  "city",
  "borough",
  "neighborhood",
  "primary_category",
  "cuisine",
  "cuisine_type",
  "activity_type",
  "tags",
  "vibe_tags",
  "best_for_tags",
  "search_document",
  "description",
  "reservation_url",
  "reservation_link",
  "external_reservation_url",
  "website",
  "rating",
  "review_count",
  "theouthaven_score",
  "is_featured",
  "created_at",
  "is_searchable",
  "quality_status",
  "duplicate_status",
  "has_photos",
  "photo_status",
  "is_hidden",
  "data_status",
  "is_low_level",
  "public_visibility_tier",
  "curation_tier",
  "source_quality_status",
  "import_confidence",
].join(",");

export async function GET(request: NextRequest) {
  const start = Date.now();
  const params = request.nextUrl.searchParams;
  const city = params.get("city");
  const borough = params.get("borough");
  const page = Math.max(1, Number(params.get("page") || 1));
  const limit = Math.min(48, Math.max(1, Number(params.get("limit") || 24)));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabaseAdmin
    .from("locations")
    .select(CARD_FIELDS)
    .eq("is_searchable", true)
    .eq("quality_status", "publish_ready")
    .or("duplicate_status.is.null,duplicate_status.neq.duplicate")
    .eq("has_photos", true)
    .not("photo_status", "eq", "missing_photo")
    .not("address", "is", null)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .not("primary_category", "is", null)
    .eq("data_status", "clean")
    .not("is_hidden", "is", true)
    .not("status", "in", '("closed","archived")')
    .or("is_low_level.is.null,is_low_level.eq.false")
    .not("public_visibility_tier", "in", '("low_level","hidden")')
    .not("curation_tier", "eq", "low_level")
    .not(
      "source_quality_status",
      "in",
      '("imported_unverified","generic_restaurant","needs_enrichment","low_level_review")',
    )
    .not("import_confidence", "eq", "low");

  if (city) query = query.ilike("city", `%${city}%`);
  if (borough) query = query.ilike("borough", `%${borough}%`);

  const dbStart = Date.now();
  const { data, error } = await query
    .order("is_featured", { ascending: false, nullsFirst: false })
    .order("rating", { ascending: false, nullsFirst: false })
    .range(from, to);
  const dbMs = Date.now() - dbStart;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const items = data || [];
  const hasMore = items.length === limit;
  const totalMs = Date.now() - start;

  console.log(
    "ROUTE_TIMING",
    JSON.stringify({
      route: "/api/explore",
      total_ms: totalMs,
      db_ms: dbMs,
      cache_status: "miss",
      result_count: items.length,
    }),
  );

  return NextResponse.json({
    items,
    page,
    limit,
    hasMore,
  });
}
