import { Suspense } from "react";
import ExploreClient, { type ExploreLocation } from "./ExploreClient";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationName } from "@/lib/locationName";

export const revalidate = 300;

type ExploreSearchParams = {
  q?: string;
  kind?: string;
  area?: string;
};

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<ExploreSearchParams>;
}) {
  const params = await searchParams;

  const q = cleanParam(params.q);
  const selectedKind = normalizeKind(params.kind);
  const selectedArea = normalizeArea(params.area);
  const locations = await loadExploreData();

  return (
    <Suspense fallback={null}>
      <ExploreClient
        initialLocations={locations}
        initialQ={q}
        initialKind={selectedKind}
        initialArea={selectedArea}
      />
    </Suspense>
  );
}

async function loadExploreData() {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select(
      "id,source_table,location_type,name,restaurant_name,activity_name,main_image,image_url,images,city,borough,neighborhood,primary_category,cuisine,cuisine_type,activity_type,tags,vibe_tags,best_for_tags,search_document,description,reservation_url,reservation_link,external_reservation_url,website,rating,review_count,theouthaven_score,is_featured,created_at,is_searchable,is_hidden,data_status"
    )
    .eq("is_searchable", true)
    .eq("data_status", "clean")
    .not("is_hidden", "is", true)
    .order("is_featured", { ascending: false, nullsFirst: false })
    .order("rating", { ascending: false, nullsFirst: false })
    .limit(96);

  if (error) {
    console.error("EXPLORE_LOAD_ERROR", error.message);
    return [];
  }

  return dedupeById((data || []) as unknown as ExploreLocation[]).filter((row) =>
    Boolean(getLocationName(row, "").trim()),
  );
}

function dedupeById(locations: ExploreLocation[]) {
  const seen = new Set<string>();

  return locations.filter((location) => {
    if (!location.id || seen.has(location.id)) return false;
    seen.add(location.id);
    return true;
  });
}

function cleanParam(value: unknown) {
  return String(value || "").trim().slice(0, 120);
}

function normalizeKind(value: unknown) {
  const kind = cleanParam(value).toLowerCase();
  const allowed = new Set([
    "all",
    "restaurants",
    "activities",
    "rooftops",
    "lounges",
    "brunch",
  ]);

  return allowed.has(kind) ? kind : "all";
}

function normalizeArea(value: unknown) {
  const area = cleanParam(value);

  if (!area) return "all";

  const allowed = [
    "all",
    "Queens",
    "Brooklyn",
    "Manhattan",
    "Bronx",
    "Staten Island",
    "Long Island",
  ];

  return allowed.find((item) => item.toLowerCase() === area.toLowerCase()) || "all";
}
