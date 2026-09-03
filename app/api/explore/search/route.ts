import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { runOutingSearch } from "@/lib/search/runSearch";

const CARD_FIELDS = [
  "id",
  "source_table",
  "source_id",
  "location_type",
  "name",
  "restaurant_name",
  "activity_name",
  "business_name",
  "main_image",
  "image_url",
  "images",
  "city",
  "borough",
  "neighborhood",
  "state",
  "primary_category",
  "primary_tag",
  "cuisine",
  "cuisine_type",
  "food_type",
  "activity_type",
  "tags",
  "vibe_tags",
  "best_for_tags",
  "google_types",
  "atmosphere",
  "best_for",
  "date_style_tags",
  "search_keywords",
  "search_document",
  "description",
  "reservation_url",
  "reservation_link",
  "external_reservation_url",
  "website",
  "rating",
  "review_count",
  "theouthaven_score",
  "popularity_score",
  "is_featured",
  "created_at",
  "is_searchable",
  "is_hidden",
  "data_status",
  "quality_status",
  "duplicate_status",
  "duplicate_of",
  "deleted_at",
  "has_photos",
  "photo_status",
  "is_low_level",
  "public_visibility_tier",
  "curation_tier",
  "source_quality_status",
  "import_confidence",
].join(",");

const LONG_ISLAND_CITIES = [
  "Garden City",
  "Rockville Centre",
  "Huntington",
  "Huntington Station",
  "Patchogue",
  "Great Neck",
  "Westbury",
  "Freeport",
  "Levittown",
  "Bohemia",
  "Centereach",
  "Massapequa",
  "Mineola",
  "Hempstead",
  "Farmingdale",
  "Long Beach",
  "Babylon",
  "Bay Shore",
  "Islip",
  "Ronkonkoma",
  "Smithtown",
  "Riverhead",
  "Port Jefferson",
  "Oyster Bay",
  "Glen Cove",
  "Hicksville",
  "Syosset",
  "Jericho",
  "Roslyn",
  "Manhasset",
  "Valley Stream",
];

function cleanParam(value: string | null) {
  return (value || "").replace(/[<>]/g, "").trim().slice(0, 120);
}

function normalizeKind(value: string | null) {
  const kind = cleanParam(value).toLowerCase();
  if (["restaurants", "restaurant", "food", "brunch"].includes(kind)) return "restaurants";
  if (["activities", "activity", "things", "things-to-do"].includes(kind)) return "activities";
  if (["lounges", "lounge"].includes(kind)) return "lounges";
  if (["date-night", "date night", "date"].includes(kind)) return "date-night";
  if (["groups", "group"].includes(kind)) return "groups";
  if (["open-now", "open now", "open"].includes(kind)) return "open-now";
  return "all";
}

function normalizeArea(value: string | null) {
  return cleanParam(value) || "all";
}

function buildExploreQuery(q: string, kind: string, area: string) {
  const parts = [q];
  if (kind === "restaurants") parts.push("restaurant food");
  if (kind === "activities") parts.push("activity things to do");
  if (kind === "lounges") parts.push("lounge nightlife");
  if (kind === "date-night") parts.push("date night romantic dinner");
  if (kind === "groups") parts.push("group outing fun activities");
  if (kind === "open-now") parts.push("open now late night");
  if (area !== "all") parts.push(`in ${area}`);
  return parts.filter(Boolean).join(" ").trim() || "things to do";
}

function firstObject(...values: unknown[]) {
  return values.find((value): value is Record<string, any> => Boolean(value) && typeof value === "object" && !Array.isArray(value));
}

function normalizeExploreItem(item: any) {
  const source = firstObject(item?.restaurant, item?.activity, item?.location, item?.venue, item?.place, item);
  if (!source) return item;

  const sourceTable = source.source_table ?? item?.source_table ?? (item?.restaurant || source.restaurant_name ? "restaurants" : null) ?? (item?.activity || source.activity_name ? "activities" : null);
  const locationType = source.location_type ?? source.type ?? item?.location_type ?? item?.type ?? sourceTable;

  return {
    ...source,
    id: source.id ?? source.source_id ?? item?.id,
    source_table: sourceTable,
    source_id: source.source_id ?? item?.source_id ?? source.id,
    location_type: locationType,
    type: source.type ?? item?.type ?? locationType,
    name: source.name ?? source.restaurant_name ?? source.activity_name ?? source.business_name ?? item?.name ?? null,
    restaurant_name: source.restaurant_name ?? item?.restaurant_name ?? null,
    activity_name: source.activity_name ?? item?.activity_name ?? null,
    business_name: source.business_name ?? item?.business_name ?? null,
    main_image: source.main_image ?? item?.main_image ?? null,
    image_url: source.image_url ?? source.photo_url ?? item?.image_url ?? null,
    images: source.images ?? item?.images ?? null,
    city: source.city ?? item?.city ?? null,
    borough: source.borough ?? item?.borough ?? null,
    neighborhood: source.neighborhood ?? item?.neighborhood ?? null,
    primary_category: source.primary_category ?? item?.primary_category ?? null,
    cuisine: source.cuisine ?? item?.cuisine ?? null,
    cuisine_type: source.cuisine_type ?? item?.cuisine_type ?? null,
    activity_type: source.activity_type ?? item?.activity_type ?? null,
    tags: source.tags ?? item?.tags ?? null,
    vibe_tags: source.vibe_tags ?? item?.vibe_tags ?? null,
    best_for_tags: source.best_for_tags ?? item?.best_for_tags ?? null,
    search_document: source.search_document ?? item?.search_document ?? null,
    description: source.description ?? item?.description ?? null,
    rating: source.rating ?? item?.rating ?? null,
    review_count: source.review_count ?? item?.review_count ?? null,
    theouthaven_score: source.theouthaven_score ?? item?.theouthaven_score ?? null,
    is_searchable: source.is_searchable ?? item?.is_searchable ?? true,
    is_hidden: source.is_hidden ?? item?.is_hidden ?? false,
    data_status: source.data_status ?? item?.data_status ?? "clean",
  };
}

function validExploreItem(item: any) {
  const name = String(item?.name ?? item?.restaurant_name ?? item?.activity_name ?? item?.business_name ?? "").trim();
  if (!item?.id || !name || name.toLowerCase() === "unknown location") return false;
  if (item.is_hidden === true || item.is_searchable === false) return false;
  if (item.data_status && item.data_status !== "clean") return false;
  return true;
}

function normalizeAndFilterItems(items: any[]) {
  const seen = new Set<string>();
  return items.map(normalizeExploreItem).filter(validExploreItem).filter((item) => {
    const id = String(item.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function searchableText(item: any) {
  return [
    item.name,
    item.restaurant_name,
    item.activity_name,
    item.business_name,
    item.primary_category,
    item.primary_tag,
    item.cuisine,
    item.cuisine_type,
    item.food_type,
    item.activity_type,
    item.description,
    item.search_document,
    ...(Array.isArray(item.tags) ? item.tags : []),
    ...(Array.isArray(item.vibe_tags) ? item.vibe_tags : []),
    ...(Array.isArray(item.best_for_tags) ? item.best_for_tags : []),
  ].filter(Boolean).join(" ").toLowerCase();
}

function matchesKind(item: any, kind: string) {
  if (kind === "all" || kind === "open-now") return true;
  const text = searchableText(item);
  const type = String(item.location_type || item.source_table || "").toLowerCase();
  if (kind === "restaurants") return /restaurant|food|dining|cafe|bakery|bar/.test(`${type} ${text}`);
  if (kind === "activities") return /activit|museum|bowling|karaoke|comedy|arcade|gallery|theater|spa|game|experience/.test(`${type} ${text}`);
  if (kind === "lounges") return /lounge|hookah|nightlife|cocktail|bar/.test(text);
  if (kind === "date-night") return /romantic|date|rooftop|cocktail|dinner|jazz|lounge/.test(text);
  if (kind === "groups") return /group|birthday|party|bowling|karaoke|arcade|game|comedy/.test(text);
  return true;
}

async function loadAreaCatalog(area: string, kind: string, limit: number) {
  let query = supabaseAdmin
    .from("locations")
    .select(CARD_FIELDS)
    .eq("is_searchable", true)
    .eq("quality_status", "publish_ready")
    .or("duplicate_status.is.null,duplicate_status.neq.duplicate")
    .is("duplicate_of", null)
    .eq("has_photos", true)
    .not("photo_status", "eq", "missing_photo")
    .not("address", "is", null)
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .not("primary_category", "is", null)
    .eq("data_status", "clean")
    .not("is_hidden", "is", true)
    .is("deleted_at", null)
    .or("is_low_level.is.null,is_low_level.eq.false")
    .not("public_visibility_tier", "in", '("low_level","hidden")')
    .not("curation_tier", "eq", "low_level")
    .not("source_quality_status", "in", '("imported_unverified","generic_restaurant","needs_enrichment","low_level_review")')
    .not("import_confidence", "eq", "low")
    .not("status", "in", '("closed","archived")');

  if (area === "Long Island") query = query.in("city", LONG_ISLAND_CITIES);
  else query = query.ilike("borough", area);

  const { data, error } = await query
    .order("is_featured", { ascending: false, nullsFirst: false })
    .order("rating", { ascending: false, nullsFirst: false })
    .limit(Math.max(limit * 3, 96));

  if (error) throw error;
  return normalizeAndFilterItems(data || []).filter((item) => matchesKind(item, kind)).slice(0, limit);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = cleanParam(params.get("q"));
  const kind = normalizeKind(params.get("kind"));
  const area = normalizeArea(params.get("area"));
  const limit = Math.min(96, Math.max(12, Number(params.get("limit") || 96) || 96));

  try {
    // Area cards and area pills are catalog browsing, not outing generation.
    // Reading the catalog directly keeps these interactions fast and guarantees
    // that eligible locations are not lost to planner intent/pairing logic.
    if (!q && area !== "all") {
      const items = await loadAreaCatalog(area, kind, limit);
      return NextResponse.json({ success: true, items, restaurants: [], activities: [], pairs: [], total: items.length });
    }

    const query = buildExploreQuery(q, kind, area);
    const simple = Boolean(!q || /^[\w\s-]+$/.test(q));
    const result = await runOutingSearch({
      query,
      useLLM: !simple && q.split(/\s+/).length > 3,
      displayLimit: 48,
      source: "public_explore_search",
      route: "/api/explore/search",
      logPerformance: true,
      sessionId: request.cookies.get("toh_session")?.value || request.headers.get("x-session-id"),
    });

    const restaurants = normalizeAndFilterItems(result.restaurants || []);
    const activities = normalizeAndFilterItems(result.activities || []);
    const pairs = Array.isArray(result.pairs) ? result.pairs : [];
    let items = kind === "restaurants"
      ? restaurants
      : kind === "activities" || kind === "lounges"
        ? activities
        : [...restaurants, ...activities];

    if (area !== "all") {
      const areaLower = area.toLowerCase();
      items = items.filter((item) => {
        if (area === "Long Island") return LONG_ISLAND_CITIES.some((city) => city.toLowerCase() === String(item.city || "").toLowerCase());
        return String(item.borough || "").toLowerCase() === areaLower;
      });
    }

    items = items.filter((item) => matchesKind(item, kind)).slice(0, limit);
    return NextResponse.json({ success: true, items, restaurants, activities, pairs, total: items.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Explore search failed";
    console.error("EXPLORE_SEARCH_ERROR", error);
    return NextResponse.json({ success: false, items: [], restaurants: [], activities: [], pairs: [], total: 0, error: message }, { status: 500 });
  }
}
