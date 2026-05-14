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
  steakhouse: ["steakhouse", "steak house", "steak", "chophouse"],
  seafood: ["seafood", "fish", "crab", "lobster", "oyster", "shrimp"],
  italian: ["italian", "pizza", "pizzeria", "pasta", "trattoria", "ristorante"],
  sushi: ["sushi", "omakase"],
  japanese: ["japanese", "ramen", "izakaya", "yakitori", "hibachi", "teriyaki"],
  chinese: ["chinese", "dim sum", "szechuan", "sichuan", "hot pot", "cantonese"],
  korean: ["korean", "kbbq", "korean bbq", "bulgogi", "kimchi"],
  thai: ["thai", "pad thai"],
  vietnamese: ["vietnamese", "pho", "banh mi"],
  indian: ["indian", "tandoori", "curry", "masala", "biryani"],
  mexican: ["mexican", "taco", "taqueria", "birria", "quesadilla"],
  latin: ["latin", "latin american"],
  spanish: ["spanish", "tapas", "paella"],
  dominican: ["dominican"],
  puerto_rican: ["puerto rican", "boricua"],
  caribbean: ["caribbean", "jamaican", "jerk", "oxtail"],
  soul_food: ["soul food"],
  southern: ["southern", "cajun", "creole", "fried chicken"],
  bbq: ["bbq", "barbecue", "smokehouse"],
  american: ["american", "burger", "diner", "grill", "gastropub"],
  mediterranean: ["mediterranean", "shawarma", "falafel", "hummus"],
  greek: ["greek", "gyro", "souvlaki"],
  middle_eastern: ["middle eastern"],
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
  dessert: ["dessert", "ice cream", "gelato", "donut", "cupcake"],
  rooftop: ["rooftop", "sky lounge", "skybar"],
  cocktail_bar: ["cocktail", "cocktail bar", "speakeasy", "mixology"],
  wine_bar: ["wine bar", "wine lounge"],
};

function getBearerToken(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";

  if (!auth.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  return auth.slice(7).trim();
}

function hasSecretAuthorization(request: NextRequest) {
  if (process.env.NODE_ENV === "development") {
    return true;
  }

  const importSecret = request.headers.get(
    "x-internal-import-secret"
  );

  const bearerToken = getBearerToken(request);

  if (
    process.env.IMPORT_SECRET &&
    importSecret === process.env.IMPORT_SECRET
  ) {
    return true;
  }

  if (
    process.env.CRON_SECRET &&
    bearerToken === process.env.CRON_SECRET
  ) {
    return true;
  }

  return false;
}

async function requireAuthorization(request: NextRequest) {
  if (hasSecretAuthorization(request)) {
    return null;
  }

  const { error } = await requireAdminApiRole([
    "superuser",
    "admin",
    "editor",
  ]);

  return error;
}

function isGeneric(value: unknown) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  return (
    !normalized ||
    [
      "restaurant",
      "restaurants",
      "food",
      "dining",
      "eatery",
    ].includes(normalized)
  );
}

function normalizeArray(values: unknown[]) {
  return Array.from(
    new Set(
      values
        .flat()
        .filter(Boolean)
        .map((value) =>
          String(value).trim().toLowerCase()
        )
        .filter(Boolean)
    )
  );
}

function inferCuisine(text: string) {
  const normalized = text.toLowerCase();

  const matches: string[] = [];

  for (const [cuisine, keywords] of Object.entries(
    CUISINE_KEYWORDS
  )) {
    if (
      keywords.some((keyword) =>
        normalized.includes(keyword)
      )
    ) {
      matches.push(cuisine);
    }
  }

  const tags = Array.from(new Set(matches));

  return {
    primary: tags[0] || null,
    tags,
  };
}

function inferVenueFallback(
  place: GooglePlace,
  text: string
) {
  const types = (place.types || []).map((type) =>
    type.toLowerCase()
  );

  const normalized = text.toLowerCase();

  const contains = (...keywords: string[]) =>
    keywords.some((keyword) =>
      normalized.includes(keyword)
    );

  if (contains("steak", "chophouse"))
    return "steakhouse";

  if (contains("sushi", "omakase"))
    return "sushi";

  if (
    contains(
      "ramen",
      "izakaya",
      "yakitori",
      "hibachi"
    )
  )
    return "japanese";

  if (
    contains(
      "pizza",
      "pasta",
      "trattoria",
      "ristorante",
      "italian"
    )
  )
    return "italian";

  if (
    contains(
      "taco",
      "taqueria",
      "birria",
      "quesadilla",
      "mexican"
    )
  )
    return "mexican";

  if (
    contains(
      "kbbq",
      "korean bbq",
      "bulgogi",
      "kimchi"
    )
  )
    return "korean";

  if (
    contains(
      "dim sum",
      "hot pot",
      "szechuan",
      "sichuan",
      "cantonese"
    )
  )
    return "chinese";

  if (
    contains(
      "shawarma",
      "falafel",
      "gyro",
      "souvlaki",
      "hummus"
    )
  )
    return "mediterranean";

  if (
    contains(
      "jerk",
      "oxtail",
      "caribbean",
      "jamaican"
    )
  )
    return "caribbean";

  if (
    contains(
      "soul food",
      "southern",
      "fried chicken",
      "cajun",
      "creole"
    )
  )
    return "soul_food";

  if (contains("pho", "banh mi"))
    return "vietnamese";

  if (contains("thai", "pad thai"))
    return "thai";

  if (
    contains(
      "biryani",
      "masala",
      "tandoori",
      "indian"
    )
  )
    return "indian";

  if (
    contains(
      "bbq",
      "barbecue",
      "smokehouse"
    )
  )
    return "bbq";

  if (
    contains(
      "vegan",
      "plant based",
      "plant-based"
    )
  )
    return "vegan";

  if (
    contains(
      "brunch",
      "breakfast"
    )
  )
    return "brunch";

  if (
    contains(
      "seafood",
      "oyster",
      "lobster",
      "crab",
      "shrimp"
    )
  )
    return "seafood";

  if (
    contains(
      "rooftop",
      "sky lounge",
      "skybar"
    )
  )
    return "rooftop";

  if (
    contains(
      "speakeasy",
      "cocktail",
      "mixology"
    )
  )
    return "cocktail_bar";

  if (
    contains(
      "wine bar",
      "wine lounge"
    )
  )
    return "wine_bar";

  if (
    contains(
      "nightclub",
      "night club",
      "lounge"
    )
  )
    return "nightlife";

  if (
    contains(
      "bakery",
      "pastry",
      "croissant"
    )
  )
    return "bakery";

  if (
    contains(
      "coffee",
      "espresso",
      "cafe"
    )
  )
    return "cafe";

  if (
    contains(
      "dessert",
      "ice cream",
      "gelato",
      "donut",
      "cupcake"
    )
  )
    return "dessert";

  if (types.includes("night_club"))
    return "nightlife";

  if (types.includes("bar"))
    return "bar";

  if (types.includes("cafe"))
    return "cafe";

  if (types.includes("bakery"))
    return "bakery";

  if (types.includes("meal_takeaway"))
    return "casual_dining";

  if (types.includes("restaurant"))
    return "restaurant";

  return null;
}

function buildSearchKeywords(
  place: GooglePlace,
  restaurant: RestaurantRow,
  cuisineTags: string[]
) {
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

function getPhotoUrl(
  photoReference?: string | null
) {
  if (!photoReference || !GOOGLE_API_KEY) {
    return null;
  }

  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${photoReference}&key=${GOOGLE_API_KEY}`;
}

async function googleTextSearch(
  query: string
): Promise<GooglePlace | null> {
  if (!GOOGLE_API_KEY) {
    throw new Error(
      "Missing GOOGLE_PLACES_API_KEY"
    );
  }

  const url = new URL(
    "https://maps.googleapis.com/maps/api/place/textsearch/json"
  );

  url.searchParams.set("query", query);
  url.searchParams.set("type", "restaurant");
  url.searchParams.set("key", GOOGLE_API_KEY);

  const response = await fetch(url.toString(), {
    cache: "no-store",
  });

  const json = await response.json();

  if (
    !response.ok ||
    json.status === "REQUEST_DENIED"
  ) {
    throw new Error(
      json.error_message ||
        "Google Text Search failed"
    );
  }

  return json.results?.[0] || null;
}

async function googleDetails(
  placeId: string
): Promise<GooglePlace | null> {
  if (!GOOGLE_API_KEY) {
    throw new Error(
      "Missing GOOGLE_PLACES_API_KEY"
    );
  }

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

  const url = new URL(
    "https://maps.googleapis.com/maps/api/place/details/json"
  );

  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", fields);
  url.searchParams.set("key", GOOGLE_API_KEY);

  const response = await fetch(url.toString(), {
    cache: "no-store",
  });

  const json = await response.json();

  if (
    !response.ok ||
    json.status === "REQUEST_DENIED"
  ) {
    throw new Error(
      json.error_message ||
        "Google Details failed"
    );
  }

  return json.result || null;
}

function buildGoogleQuery(
  restaurant: RestaurantRow
) {
  return [
    restaurant.restaurant_name,
    restaurant.address,
    restaurant.city,
    restaurant.state || "NY",
  ]
    .filter(Boolean)
    .join(" ");
}

function getMissingColumn(
  errorMessage: string
) {
  return (
    errorMessage.match(
      /'([^']+)' column/
    )?.[1] ||
    errorMessage.match(
      /column "([^"]+)"/
    )?.[1] ||
    errorMessage.match(
      /column ([a-zA-Z0-9_]+) does not exist/
    )?.[1] ||
    null
  );
}

async function safeUpdateRestaurant(
  id: string,
  payload: Record<string, unknown>
) {
  const rowForSave = { ...payload };

  const removedColumns: string[] = [];

  for (let attempt = 0; attempt < 12; attempt++) {
    const { error } = await supabaseAdmin
      .from("restaurants")
      .update(rowForSave)
      .eq("id", id);

    if (!error) {
      return {
        error: null,
        removedColumns,
      };
    }

    const missingColumn = getMissingColumn(
      error.message
    );

    if (
      missingColumn &&
      missingColumn in rowForSave
    ) {
      delete rowForSave[missingColumn];

      removedColumns.push(missingColumn);

      continue;
    }

    return {
      error,
      removedColumns,
    };
  }

  return {
    error: {
      message:
        "Unable to update restaurant after removing unsupported columns",
    },
    removedColumns,
  };
}

export async function POST(
  request: NextRequest
) {
  try {
    const authError =
      await requireAuthorization(request);

    if (authError) {
      return authError;
    }

    const body = await request
      .json()
      .catch(() => ({}));

    const limit = Math.max(
      1,
      Math.min(
        Number(body.limit || 50),
        250
      )
    );

    const includeGeneric =
      body.includeGeneric !== false;

    const updateImages =
      body.updateImages !== false;

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
        "primary_tag.eq.food",
        "cuisine.eq.restaurant",
        "food_type.eq.restaurant"
      );
    }

    const {
      data: restaurants,
      error,
    } = await supabaseAdmin
      .from("restaurants")
      .select(`
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
      `)
      .or(filters.join(","))
      .limit(limit);

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    let checked = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    const results: Record<
      string,
      unknown
    >[] = [];

    for (const restaurant of restaurants || []) {
      checked++;

      try {
        const query =
          buildGoogleQuery(restaurant);

        if (!query.trim()) {
          skipped++;

          results.push({
            id: restaurant.id,
            status: "skipped",
            reason:
              "Missing restaurant name/address",
          });

          continue;
        }

        let place: GooglePlace | null =
          null;

        if (restaurant.google_place_id) {
          place = await googleDetails(
            restaurant.google_place_id
          );
        } else {
          const searchResult =
            await googleTextSearch(query);

          if (searchResult?.place_id) {
            place = await googleDetails(
              searchResult.place_id
            );
          }
        }

        if (!place) {
          skipped++;

          results.push({
            id: restaurant.id,
            status: "skipped",
            reason: "No Google match",
            name:
              restaurant.restaurant_name,
          });

          continue;
        }

        const cuisineText = [
          restaurant.restaurant_name,
          restaurant.city,
          restaurant.primary_tag,
          restaurant.search_keywords?.join(
            " "
          ),
          place.name,
          place.types?.join(" "),
        ]
          .filter(Boolean)
          .join(" ");

        const cuisine =
          inferCuisine(cuisineText);

        const fallbackTag =
          inferVenueFallback(
            place,
            cuisineText
          );

        const primaryTag =
          cuisine.primary ||
          fallbackTag ||
          restaurant.primary_tag ||
          null;

        const keywords =
          buildSearchKeywords(
            place,
            restaurant,
            cuisine.tags
          );

        const photoReference =
          place.photos?.[0]
            ?.photo_reference || null;

        const updatePayload: Record<
          string,
          unknown
        > = {
          google_place_id:
            place.place_id ||
            restaurant.google_place_id ||
            null,

          rating: place.rating || null,

          review_count:
            place.user_ratings_total ||
            null,

          phone:
            place.formatted_phone_number ||
            place.international_phone_number ||
            null,

          website: place.website || null,

          google_maps_url:
            place.url || null,

          primary_tag: primaryTag,

          search_keywords: keywords,
        };

        if (
          isGeneric(
            restaurant.cuisine
          ) &&
          cuisine.primary
        ) {
          updatePayload.cuisine =
            cuisine.primary;
        }

        if (
          isGeneric(
            restaurant.food_type
          ) &&
          primaryTag
        ) {
          updatePayload.food_type =
            primaryTag;
        }

        if (
          isGeneric(
            restaurant.cuisine_type
          ) &&
          primaryTag
        ) {
          updatePayload.cuisine_type =
            primaryTag;
        }

        if (
          !restaurant.cuisine_tags
            ?.length &&
          cuisine.tags.length
        ) {
          updatePayload.cuisine_tags =
            cuisine.tags;
        }

        if (updateImages) {
          const imageUrl =
            getPhotoUrl(photoReference);

          if (imageUrl) {
            updatePayload.image_url =
              imageUrl;
          }
        }

        if (
          place.geometry?.location?.lat &&
          place.geometry?.location?.lng
        ) {
          updatePayload.latitude =
            place.geometry.location.lat;

          updatePayload.longitude =
            place.geometry.location.lng;
        }

        const {
          error: updateError,
          removedColumns,
        } =
          await safeUpdateRestaurant(
            restaurant.id,
            updatePayload
          );

        if (updateError) {
          failed++;

          results.push({
            id: restaurant.id,
            status: "failed",
            name:
              restaurant.restaurant_name,
            error:
              updateError.message,
            removedColumns,
          });

          continue;
        }

        updated++;

        results.push({
          id: restaurant.id,
          status: "updated",
          name:
            restaurant.restaurant_name,
          primary_tag: primaryTag,
          cuisine:
            updatePayload.cuisine ||
            restaurant.cuisine,
          food_type:
            updatePayload.food_type ||
            restaurant.food_type,
          cuisine_type:
            updatePayload.cuisine_type ||
            restaurant.cuisine_type,
          cuisine_tags:
            updatePayload.cuisine_tags ||
            restaurant.cuisine_tags,
          removedColumns,
        });
      } catch (itemError) {
        failed++;

        results.push({
          id: restaurant.id,
          status: "failed",
          name:
            restaurant.restaurant_name,
          error:
            itemError instanceof Error
              ? itemError.message
              : String(itemError),
        });
      }
    }

    return NextResponse.json({
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
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 }
    );
  }
}