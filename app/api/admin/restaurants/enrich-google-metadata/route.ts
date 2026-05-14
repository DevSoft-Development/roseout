import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApiRole } from "@/lib/admin-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const GOOGLE_API_KEY =
  process.env.GOOGLE_PLACES_API_KEY ||
  process.env.GOOGLE_MAPS_API_KEY ||
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

type RestaurantRow = {
  id: string;
  restaurant_name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  google_place_id?: string | null;
  cuisine?: string | null;
  food_type?: string | null;
  cuisine_type?: string | null;
  cuisine_tags?: string[] | null;
  primary_tag?: string | null;
  search_keywords?: string[] | null;
};

type GooglePlace = {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  vicinity?: string;
  rating?: number;
  user_ratings_total?: number;
  types?: string[];
  formatted_phone_number?: string;
  international_phone_number?: string;
  website?: string;
  url?: string;
  geometry?: {
    location?: {
      lat?: number;
      lng?: number;
    };
  };
  photos?: {
    photo_reference?: string;
  }[];
};

const CUISINE_KEYWORDS: Record<string, string[]> = {
  steakhouse: ["steakhouse", "steak house", "steak"],
  seafood: ["seafood", "fish", "crab", "lobster", "oyster", "shrimp"],
  italian: ["italian", "pizza", "pizzeria", "pasta", "trattoria", "ristorante"],
  sushi: ["sushi", "omakase"],
  japanese: ["japanese", "ramen", "izakaya", "yakitori", "hibachi", "teriyaki"],
  chinese: ["chinese", "dim sum", "szechuan", "sichuan", "cantonese", "hot pot"],
  korean: ["korean", "kbbq", "korean bbq", "bulgogi", "kimchi"],
  thai: ["thai", "pad thai"],
  vietnamese: ["vietnamese", "pho", "banh mi"],
  indian: ["indian", "tandoori", "curry", "masala", "biryani"],
  mexican: ["mexican", "taco", "taqueria", "burrito", "quesadilla"],
  latin: ["latin", "latin american"],
  spanish: ["spanish", "tapas", "paella"],
  dominican: ["dominican"],
  puerto_rican: ["puerto rican", "boricua"],
  caribbean: ["caribbean", "west indian"],
  jamaican: ["jamaican", "jerk chicken", "jerk"],
  soul_food: ["soul food"],
  southern: ["southern", "cajun", "creole"],
  bbq: ["bbq", "barbecue", "smokehouse"],
  american: ["american", "burger", "diner", "grill", "gastropub"],
  mediterranean: ["mediterranean"],
  greek: ["greek", "gyro", "souvlaki"],
  middle_eastern: ["middle eastern", "falafel", "shawarma", "hummus"],
  african: ["african"],
  nigerian: ["nigerian", "jollof", "suya"],
  ethiopian: ["ethiopian", "injera"],
  french: ["french", "bistro", "brasserie"],
  vegan: ["vegan", "plant based", "plant-based"],
  vegetarian: ["vegetarian"],
  halal: ["halal"],
  kosher: ["kosher"],
  brunch: ["brunch", "breakfast"],
  bakery: ["bakery", "pastry", "croissant"],
  cafe: ["cafe", "coffee", "espresso"],
  dessert: ["dessert", "ice cream", "gelato", "cupcake", "donut"],
  rooftop: ["rooftop"],
  cocktail_bar: ["cocktail bar", "mixology"],
  wine_bar: ["wine bar"],
};

function getBearerToken(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  return auth.slice(7).trim();
}

function hasSecretAuthorization(request: NextRequest) {
  if (process.env.NODE_ENV === "development") return true;

  const importSecret = request.headers.get("x-internal-import-secret");
  const bearerToken = getBearerToken(request);

  if (process.env.IMPORT_SECRET && importSecret === process.env.IMPORT_SECRET) {
    return true;
  }

  if (process.env.CRON_SECRET && bearerToken === process.env.CRON_SECRET) {
    return true;
  }

  return false;
}

async function requireAuthorization(request: NextRequest) {
  if (hasSecretAuthorization(request)) return null;

  const { error } = await requireAdminApiRole([
    "superuser",
    "admin",
    "editor",
  ]);

  return error;
}

function isGeneric(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  return (
    !normalized ||
    ["restaurant", "restaurants", "food", "dining", "eatery"].includes(normalized)
  );
}

function normalizeArray(values: unknown[]) {
  return Array.from(
    new Set(
      values
        .flat()
        .filter(Boolean)
        .map((value) => String(value).trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function inferCuisine(text: string) {
  const normalized = text.toLowerCase();
  const matches: string[] = [];

  for (const [cuisine, keywords] of Object.entries(CUISINE_KEYWORDS)) {
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      matches.push(cuisine);
    }
  }

  const tags = Array.from(new Set(matches));
  return {
    primary: tags[0] || null,
    tags,
  };
}

function buildSearchKeywords(place: GooglePlace, restaurant: RestaurantRow, cuisineTags: string[]) {
  return normalizeArray([
    restaurant.restaurant_name,
    restaurant.city,
    restaurant.state,
    place.name,
    place.types || [],
    cuisineTags,
    "restaurant",
    "date night",
    "theouthaven",
  ]);
}

function getPhotoUrl(photoReference?: string | null) {
  if (!photoReference || !GOOGLE_API_KEY) return null;

  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${photoReference}&key=${GOOGLE_API_KEY}`;
}

async function googleTextSearch(query: string): Promise<GooglePlace | null> {
  if (!GOOGLE_API_KEY) throw new Error("Missing GOOGLE_PLACES_API_KEY");

  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  url.searchParams.set("type", "restaurant");
  url.searchParams.set("key", GOOGLE_API_KEY);

  const response = await fetch(url.toString(), { cache: "no-store" });
  const json = await response.json();

  if (!response.ok || json.status === "REQUEST_DENIED") {
    throw new Error(json.error_message || "Google Text Search failed");
  }

  return json.results?.[0] || null;
}

async function googleDetails(placeId: string): Promise<GooglePlace | null> {
  if (!GOOGLE_API_KEY) throw new Error("Missing GOOGLE_PLACES_API_KEY");

  const fields = [
    "place_id",
    "name",
    "formatted_address",
    "formatted_phone_number",
    "international_phone_number",
    "website",
    "url",
    "rating",
    "user_ratings_total",
    "types",
    "geometry",
    "photos",
  ].join(",");

  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", fields);
  url.searchParams.set("key", GOOGLE_API_KEY);

  const response = await fetch(url.toString(), { cache: "no-store" });
  const json = await response.json();

  if (!response.ok || json.status === "REQUEST_DENIED") {
    throw new Error(json.error_message || "Google Details failed");
  }

  return json.result || null;
}

function buildGoogleQuery(restaurant: RestaurantRow) {
  return [
    restaurant.restaurant_name,
    restaurant.address,
    restaurant.city,
    restaurant.state || "NY",
  ]
    .filter(Boolean)
    .join(" ");
}

async function logRun(meta: Record<string, unknown>, error?: string) {
  try {
    await supabaseAdmin.from("import_logs").insert({
      job_name: "restaurant_google_metadata_enrichment",
      imported_count: Number(meta.updated || 0),
      error: error || null,
      meta,
    });
  } catch {
    // Do not fail the enrichment if logging fails.
  }
}

export async function POST(request: NextRequest) {
  try {
    const authError = await requireAuthorization(request);
    if (authError) return authError;

    const body = await request.json().catch(() => ({}));

    const limit = Math.max(1, Math.min(Number(body.limit || 50), 250));
    const includeGeneric = body.includeGeneric !== false;
    const updateImages = body.updateImages !== false;

    const filters = [
      "primary_tag.is.null",
      "search_keywords.is.null",
      "google_place_id.is.null",
      "cuisine.is.null",
      "food_type.is.null",
      "cuisine_type.is.null",
      "cuisine_tags.is.null",
    ];

    if (includeGeneric) {
      filters.push(
        "primary_tag.eq.restaurant",
        "primary_tag.eq.restaurants",
        "primary_tag.eq.food",
        "cuisine.eq.restaurant",
        "cuisine.eq.restaurants",
        "food_type.eq.restaurant",
        "food_type.eq.restaurants"
      );
    }

    const { data: restaurants, error } = await supabaseAdmin
      .from("restaurants")
      .select(
        `
        id,
        restaurant_name,
        address,
        city,
        state,
        google_place_id,
        cuisine,
        food_type,
        cuisine_type,
        cuisine_tags,
        primary_tag,
        search_keywords
        `
      )
      .or(filters.join(","))
      .limit(limit);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    let checked = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    const results: Record<string, unknown>[] = [];

    for (const restaurant of restaurants || []) {
      checked++;

      try {
        const query = buildGoogleQuery(restaurant);

        if (!query.trim()) {
          skipped++;
          results.push({ id: restaurant.id, status: "skipped", reason: "Missing name/address" });
          continue;
        }

        let place: GooglePlace | null = null;

        if (restaurant.google_place_id) {
          place = await googleDetails(restaurant.google_place_id);
        } else {
          const searchResult = await googleTextSearch(query);
          if (searchResult?.place_id) {
            place = await googleDetails(searchResult.place_id);
          }
        }

        if (!place) {
          skipped++;
          results.push({ id: restaurant.id, status: "skipped", reason: "No Google match" });
          continue;
        }

        const cuisineText = [
          restaurant.restaurant_name,
          restaurant.name,
          restaurant.city,
          restaurant.primary_tag,
          restaurant.search_keywords?.join(" "),
          place.name,
          place.types?.join(" "),
        ]
          .filter(Boolean)
          .join(" ");

        const cuisine = inferCuisine(cuisineText);
        const primaryTag = cuisine.primary || restaurant.primary_tag || null;
        const keywords = buildSearchKeywords(place, restaurant, cuisine.tags);
        const photoReference = place.photos?.[0]?.photo_reference || null;

        const updatePayload: Record<string, unknown> = {
          google_place_id: place.place_id || restaurant.google_place_id || null,
          rating: place.rating || null,
          review_count: place.user_ratings_total || null,
          phone:
            place.formatted_phone_number ||
            place.international_phone_number ||
            null,
          website: place.website || null,
          google_maps_url: place.url || null,
          primary_tag: isGeneric(restaurant.primary_tag)
            ? primaryTag
            : restaurant.primary_tag,
          search_keywords: keywords,
        };

        if (isGeneric(restaurant.cuisine) && primaryTag) {
          updatePayload.cuisine = primaryTag;
        }

        if (isGeneric(restaurant.food_type) && primaryTag) {
          updatePayload.food_type = primaryTag;
        }

        if (isGeneric(restaurant.cuisine_type) && primaryTag) {
          updatePayload.cuisine_type = primaryTag;
        }

        if (!restaurant.cuisine_tags?.length && cuisine.tags.length) {
          updatePayload.cuisine_tags = cuisine.tags;
        }

        if (updateImages) {
          const imageUrl = getPhotoUrl(photoReference);
          if (imageUrl) updatePayload.image_url = imageUrl;
        }

        if (place.geometry?.location?.lat && place.geometry?.location?.lng) {
          updatePayload.latitude = place.geometry.location.lat;
          updatePayload.longitude = place.geometry.location.lng;
        }

        const { error: updateError } = await supabaseAdmin
          .from("restaurants")
          .update(updatePayload)
          .eq("id", restaurant.id);

        if (updateError) {
          failed++;
          results.push({
            id: restaurant.id,
            status: "failed",
            error: updateError.message,
          });
          continue;
        }

        updated++;
        results.push({
          id: restaurant.id,
          status: "updated",
          name: restaurant.restaurant_name,
          primary_tag: updatePayload.primary_tag,
          cuisine: updatePayload.cuisine || restaurant.cuisine,
        });
      } catch (itemError) {
        failed++;
        results.push({
          id: restaurant.id,
          status: "failed",
          error: itemError instanceof Error ? itemError.message : String(itemError),
        });
      }
    }

    const payload = {
      success: true,
      checked,
      updated,
      skipped,
      failed,
      settings: {
        limit,
        includeGeneric,
        updateImages,
      },
      results,
    };

    await logRun(payload);

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await logRun({ success: false, error: message }, message);

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}