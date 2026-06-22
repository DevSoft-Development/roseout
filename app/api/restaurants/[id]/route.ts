import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isPublicSearchVisible } from "@/lib/locationVisibility";
import { applyPublicLocationFilters } from "@/lib/publicLocationFilters";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const { data, error } = await supabase
    .from("locations")
    .select("*")
    .eq("id", id)
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
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!isPublicSearchVisible(data)) {
    return NextResponse.json(
      { error: "Restaurant not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({ restaurant: data });
}
