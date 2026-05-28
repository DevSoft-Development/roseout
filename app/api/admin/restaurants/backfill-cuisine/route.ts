import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApiRole } from "@/lib/admin-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

async function requireCuisineBackfillAuthorization(request: NextRequest) {
  if (hasSecretAuthorization(request)) return null;

  const { error } = await requireAdminApiRole([
    "superadmin",
    "admin",
    "editor",
  ]);

  return error;
}

type RestaurantCuisineRow = {
  id: string;
  restaurant_name?: string | null;
  address?: string | null;
  city?: string | null;
  cuisine?: string | null;
  food_type?: string | null;
  cuisine_type?: string | null;
  cuisine_tags?: string[] | null;
  primary_tag?: string | null;
  search_keywords?: string[] | null;
};

type CuisineBackfillBody = {
  includeGeneric?: boolean;
  limit?: number | string;
};

function isGenericCuisine(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  return !normalized || ["restaurant", "restaurants", "food", "dining"].includes(normalized);
}

function detectCuisineFromRestaurant(restaurant: RestaurantCuisineRow) {
  const text = `${restaurant.restaurant_name || ""} ${
    restaurant.address || ""
  } ${restaurant.city || ""} ${restaurant.primary_tag || ""} ${(
    restaurant.search_keywords || []
  ).join(" ")}`.toLowerCase();

  const cuisineMap: Record<string, string[]> = {
    steakhouse: ["steakhouse", "steak house", "steak"],
    seafood: ["seafood", "fish", "crab", "lobster", "oyster", "shrimp", "clam"],
    italian: ["italian", "pizza", "pizzeria", "pasta", "trattoria", "ristorante"],
    japanese: ["japanese", "sushi", "ramen", "omakase", "izakaya", "yakitori", "hibachi", "teriyaki"],
    chinese: ["chinese", "dim sum", "szechuan", "sichuan", "cantonese", "hot pot", "noodle house"],
    korean: ["korean", "kbbq", "korean bbq", "bulgogi", "kimchi"],
    thai: ["thai", "pad thai"],
    vietnamese: ["vietnamese", "pho", "banh mi"],
    filipino: ["filipino", "filipina", "pinoy"],
    indian: ["indian", "tandoori", "curry", "masala", "biryani"],
    pakistani: ["pakistani"],
    bangladeshi: ["bangladeshi"],
    sri_lankan: ["sri lankan"],
    nepalese: ["nepalese", "momo"],
    mexican: ["mexican", "taco", "taqueria", "burrito", "quesadilla", "tortas"],
    tex_mex: ["tex mex", "tex-mex"],
    latin: ["latin", "latin american"],
    spanish: ["spanish", "tapas", "paella"],
    cuban: ["cuban"],
    dominican: ["dominican"],
    puerto_rican: ["puerto rican", "boricua"],
    colombian: ["colombian", "arepa"],
    peruvian: ["peruvian", "ceviche"],
    brazilian: ["brazilian", "churrasco", "rodizio"],
    argentinian: ["argentinian", "argentine"],
    caribbean: ["caribbean", "west indian"],
    jamaican: ["jamaican", "jerk chicken", "jerk"],
    haitian: ["haitian"],
    trinidadian: ["trinidadian", "trini", "roti shop"],
    soul_food: ["soul food"],
    southern: ["southern", "cajun", "creole"],
    cajun_creole: ["cajun", "creole", "gumbo", "jambalaya"],
    bbq: ["bbq", "barbecue", "smokehouse", "smoked meats"],
    american: ["american", "burger", "burgers", "wings", "diner", "grill", "gastropub"],
    comfort_food: ["comfort food"],
    mediterranean: ["mediterranean"],
    greek: ["greek", "gyro", "souvlaki"],
    turkish: ["turkish", "kebab", "doner"],
    lebanese: ["lebanese"],
    middle_eastern: ["middle eastern", "falafel", "shawarma", "hummus"],
    israeli: ["israeli"],
    moroccan: ["moroccan"],
    african: ["african"],
    west_african: ["west african"],
    nigerian: ["nigerian", "jollof", "suya"],
    ethiopian: ["ethiopian", "injera"],
    egyptian: ["egyptian"],
    french: ["french", "bistro", "brasserie"],
    german: ["german", "biergarten", "schnitzel"],
    polish: ["polish", "pierogi"],
    russian: ["russian"],
    ukrainian: ["ukrainian"],
    british: ["british", "fish and chips"],
    irish: ["irish"],
    scandinavian: ["scandinavian"],
    vegan: ["vegan", "plant based", "plant-based"],
    vegetarian: ["vegetarian"],
    halal: ["halal"],
    kosher: ["kosher"],
    gluten_free: ["gluten free", "gluten-free"],
    organic: ["organic"],
    farm_to_table: ["farm to table", "farm-to-table"],
    brunch: ["brunch", "breakfast"],
    breakfast: ["breakfast", "pancake", "waffle", "bagel"],
    bakery: ["bakery", "bake shop", "pastry", "croissant"],
    cafe: ["cafe", "coffee", "espresso", "coffee shop"],
    dessert: ["dessert", "ice cream", "gelato", "cupcake", "donut", "doughnut", "baklava"],
    juice_bar: ["juice bar", "smoothie", "açaí", "acai"],
    healthy: ["healthy", "salad", "grain bowl"],
    fast_food: ["fast food"],
    fried_chicken: ["fried chicken", "chicken shack"],
    wings: ["wings", "wing spot"],
    burger: ["burger", "burgers"],
    pizza: ["pizza", "pizzeria"],
    sandwiches: ["sandwich", "sandwiches", "subs", "hoagie", "deli"],
    deli: ["deli", "delicatessen"],
    bagels: ["bagel", "bagels"],
    hot_dogs: ["hot dog", "hot dogs"],
    noodles: ["noodle", "noodles"],
    hot_pot: ["hot pot"],
    buffet: ["buffet"],
    fine_dining: ["fine dining"],
    wine_bar: ["wine bar"],
    cocktail_bar: ["cocktail bar", "mixology"],
    sports_bar: ["sports bar"],
    lounge: ["lounge", "hookah", "shisha"],
    rooftop: ["rooftop"],
  };

  const matches: string[] = [];

  for (const [type, keywords] of Object.entries(cuisineMap)) {
    if (keywords.some((keyword) => text.includes(keyword))) {
      matches.push(type);
    }
  }

  const uniqueMatches = Array.from(new Set(matches));
  const primary = uniqueMatches[0] || restaurant.primary_tag || null;

  return {
    cuisine: primary,
    food_type: primary,
    cuisine_tags: uniqueMatches,
  };
}

async function logCuisineBackfillRun(meta: Record<string, unknown>, error?: string) {
  try {
    await supabaseAdmin.from("import_logs").insert({
      job_name: "restaurant_cuisine_backfill",
      imported_count: Number(meta.updated || 0),
      error: error || null,
      meta,
    });
  } catch (logError) {
    console.error("Cuisine backfill logging failed:", logError);
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function POST(request: NextRequest) {
  try {
    const authError = await requireCuisineBackfillAuthorization(request);

    if (authError) {
      return authError;
    }

    const body = (await request.json().catch(() => ({}))) as CuisineBackfillBody;
    const includeGeneric = body.includeGeneric !== false;
    const limit = Math.max(1, Math.min(Number(body.limit || 250), 1000));
    const genericFilter = [
      "cuisine.is.null",
      "cuisine.eq.",
      "cuisine.eq.restaurant",
      "cuisine.eq.restaurants",
      "food_type.is.null",
      "food_type.eq.",
      "food_type.eq.restaurant",
      "food_type.eq.restaurants",
      "cuisine_type.is.null",
      "cuisine_type.eq.",
      "cuisine_type.eq.restaurant",
      "cuisine_type.eq.restaurants",
      "cuisine_tags.is.null",
    ];

    const { data: restaurants, error } = await supabaseAdmin
      .from("restaurants")
      .select(
        "id, restaurant_name, address, city, cuisine, food_type, cuisine_type, cuisine_tags, primary_tag, search_keywords"
      )
      .or(includeGeneric ? genericFilter.join(",") : "cuisine.is.null,food_type.is.null,cuisine_type.is.null,cuisine_tags.is.null")
      .limit(limit);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let updated = 0;
    let skipped = 0;

    for (const restaurant of restaurants || []) {
      const cuisineInfo = detectCuisineFromRestaurant(restaurant);

      if (!cuisineInfo.cuisine || isGenericCuisine(cuisineInfo.cuisine)) {
        skipped++;
        continue;
      }

      const { error: updateError } = await supabaseAdmin
        .from("restaurants")
        .update({
          cuisine: cuisineInfo.cuisine,
          food_type: cuisineInfo.food_type,
          cuisine_type: cuisineInfo.cuisine,
          cuisine_tags: cuisineInfo.cuisine_tags,
          primary_tag: isGenericCuisine(restaurant.primary_tag)
            ? cuisineInfo.cuisine
            : restaurant.primary_tag,
        })
        .eq("id", restaurant.id);

      if (updateError) {
        skipped++;
      } else {
        updated++;
      }
    }

    const payload = {
      success: true,
      checked: restaurants?.length || 0,
      updated,
      skipped,
      settings: {
        includeGeneric,
        limit,
      },
    };

    await logCuisineBackfillRun(payload);

    return NextResponse.json(payload);
  } catch (error: unknown) {
    const message = getErrorMessage(error) || "Cuisine backfill failed";
    await logCuisineBackfillRun({ success: false, error: message }, message);

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}