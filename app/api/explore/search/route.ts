import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationName } from "@/lib/locationName";

const SELECT_FIELDS = [
  "id",
  "type",
  "source_table",
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
  "category",
  "primary_category",
  "cuisine",
  "cuisine_type",
  "activity_type",
  "tags",
  "vibes",
  "atmosphere",
  "best_for",
  "date_style_tags",
  "search_keywords",
  "search_document",
  "reservation_url",
  "external_reservation_url",
  "website",
  "rating",
  "score",
  "total_reviews",
  "reservation_count",
  "featured",
  "created_at",
  "is_searchable",
  "is_hidden",
  "data_status"
].join(",");

const SEARCH_COLUMNS = [
  "name",
  "restaurant_name",
  "activity_name",
  "business_name",
  "city",
  "borough",
  "neighborhood",
  "category",
  "primary_category",
  "cuisine",
  "cuisine_type",
  "activity_type",
  "search_document",
];

const LONG_ISLAND_TERMS = [
  "long island",
  "nassau",
  "suffolk",
  "hempstead",
  "freeport",
  "garden city",
  "mineola",
  "westbury",
  "huntington",
  "melville",
  "babylon",
  "islip",
  "patchogue",
  "riverhead",
  "great neck",
  "roslyn",
  "rockville centre",
  "valley stream",
  "massapequa",
  "farmingdale",
  "smithtown",
  "bay shore",
  "port jefferson",
  "oyster bay",
];

type ExploreLocation = {
  id: string;
  type: string | null;
  source_table: string | null;
  location_type: string | null;
  name: string | null;
  restaurant_name: string | null;
  activity_name: string | null;
  business_name: string | null;
  city: string | null;
  borough: string | null;
  neighborhood: string | null;
  category: string | null;
  primary_category: string | null;
  cuisine: string | null;
  cuisine_type: string | null;
  activity_type: string | null;
  tags: string[] | string | null;
  vibes: string[] | string | null;
  atmosphere: string[] | string | null;
  best_for: string[] | string | null;
  date_style_tags: string[] | string | null;
  search_keywords: string[] | string | null;
  search_document: string | null;
  rating: number | null;
  score: number | null;
  total_reviews: number | null;
  reservation_count?: number | null;
  views_count?: number | null;
  saves_count?: number | null;
  featured: boolean | null;
};

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = cleanParam(params.get("q"));
  const kind = normalizeKind(params.get("kind"));
  const area = normalizeArea(params.get("area"));

  try {
    let query = supabaseAdmin
      .from("locations")
      .select(SELECT_FIELDS)
      .eq("is_searchable", true)
      .eq("data_status", "clean")
      .neq("is_hidden", true);

    const searchTerms = searchTokens(q);

    if (searchTerms.length > 0) {
      const orClauses = searchTerms.flatMap((term) =>
        SEARCH_COLUMNS.map((column) => `${column}.ilike.%${escapeIlikeTerm(term)}%`),
      );
      query = query.or(orClauses.join(","));
    }

    if (area !== "all") {
      query = query.or(buildAreaOr(area));
    }

    const { data, error } = await query
      .order("featured", { ascending: false, nullsFirst: false })
      .order("rating", { ascending: false, nullsFirst: false })
      .limit(240);

    if (error) {
      console.error("EXPLORE_SEARCH_ERROR", {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      });

      return NextResponse.json(
        {
          success: false,
          items: [],
          error: process.env.NODE_ENV === "development" ? error.message : "Explore search failed",
        },
        { status: 200 },
      );
    }

    const rankedItems = dedupeById((data || []) as unknown as ExploreLocation[])
      .filter((location) => Boolean(getLocationName(location, "").trim()))
      .filter((location) => area === "all" || matchesAreaFilter(location, area))
      .filter((location) => kind === "all" || matchesKindFilter(location, kind))
      .sort((a, b) => rankScore(b, q) - rankScore(a, q))
      .slice(0, 96);

    return NextResponse.json({ success: true, items: rankedItems });
  } catch (error) {
    console.error("EXPLORE_SEARCH_ERROR", error);
    return NextResponse.json({ success: false, items: [] }, { status: 200 });
  }
}

function buildAreaOr(area: string) {
  const terms = area.toLowerCase() === "long island" ? LONG_ISLAND_TERMS : [area];
  return terms
    .flatMap((term) => {
      const safeTerm = escapeIlikeTerm(term);
      return [
        `borough.ilike.%${safeTerm}%`,
        `city.ilike.%${safeTerm}%`,
        `neighborhood.ilike.%${safeTerm}%`,
      ];
    })
    .join(",");
}

function rankScore(location: ExploreLocation, q: string) {
  const text = searchableText(location);
  const terms = searchTokens(q);
  const queryScore = terms.reduce((score, term) => {
    if (normalizeSearch(getLocationName(location, "")).includes(term)) return score + 80;
    if (text.includes(term)) return score + 25;
    return score;
  }, 0);

  return (
    queryScore +
    (location.featured ? 100 : 0) +
    Number(location.rating || location.score || 0) * 35 +
    Number(location.total_reviews || 0) * 1.4 +
    Number(location.reservation_count || 0) * 1.2
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

function matchesKindFilter(location: ExploreLocation, kind: string) {
  const text = searchableText(location);

  if (kind === "restaurants") {
    return (
      Boolean(location.restaurant_name) ||
      text.includes("restaurant") ||
      text.includes("location restaurant") ||
      text.includes("dinner") ||
      text.includes("food") ||
      text.includes("cuisine") ||
      text.includes("brunch") ||
      text.includes("steak") ||
      text.includes("seafood") ||
      text.includes("cafe") ||
      text.includes("bakery")
    );
  }

  if (kind === "activities") {
    return (
      Boolean(location.activity_name) ||
      text.includes("activity") ||
      text.includes("bowling") ||
      text.includes("arcade") ||
      text.includes("museum") ||
      text.includes("comedy") ||
      text.includes("escape room") ||
      text.includes("sip and paint") ||
      text.includes("karaoke")
    );
  }

  if (kind === "rooftops") {
    return (
      text.includes("rooftop") ||
      text.includes("roof top") ||
      text.includes("skyline") ||
      text.includes("views")
    );
  }

  if (kind === "lounges") {
    return (
      text.includes("lounge") ||
      text.includes("hookah") ||
      text.includes("bar") ||
      text.includes("nightlife") ||
      text.includes("cocktail")
    );
  }

  if (kind === "brunch") {
    return text.includes("brunch") || text.includes("breakfast");
  }

  return true;
}

function matchesAreaFilter(location: ExploreLocation, area: string) {
  const normalizedArea = normalizeSearch(area);
  const text = normalizeSearch(
    [location.borough, location.city, location.neighborhood]
      .filter(Boolean)
      .join(" "),
  );

  if (normalizedArea === "long island") {
    return LONG_ISLAND_TERMS.some((term) => text.includes(term));
  }

  return text.includes(normalizedArea);
}

function searchableText(location: ExploreLocation) {
  return normalizeSearch(
    [
      location.type,
      location.source_table,
      location.location_type,
      location.name,
      location.restaurant_name,
      location.activity_name,
      location.business_name,
      location.city,
      location.borough,
      location.neighborhood,
      location.category,
      location.primary_category,
      location.cuisine,
      location.cuisine_type,
      location.activity_type,
      location.search_document,
      ...toList(location.tags),
      ...toList(location.vibes),
      ...toList(location.atmosphere),
      ...toList(location.best_for),
      ...toList(location.date_style_tags),
      ...toList(location.search_keywords),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function toList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [String(value)];
}

function searchTokens(q: string) {
  const normalized = normalizeSearch(q);
  if (!normalized) return [];

  return Array.from(
    new Set(
      normalized
        .split(" ")
        .map((term) => term.trim())
        .filter((term) => term.length >= 2),
    ),
  ).slice(0, 8);
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

function normalizeSearch(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeIlikeTerm(value: string) {
  return value.replace(/[%,()]/g, " ").replace(/\s+/g, " ").trim();
}
