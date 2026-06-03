import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type BackfillBody = {
  source?: string;
  batchSize?: number;
  dryRun?: boolean;
  includeChains?: boolean;
  skipChains?: boolean;
  includeTheaters?: boolean;
  includeLowPriority?: boolean;
  onlySearchable?: boolean;
  onlyPublishReady?: boolean;
};

type GooglePhotoResult =
  | {
      found: true;
      placeId: string;
      photoReference: string;
      googleName: string | null;
      googleAddress: string | null;
    }
  | {
      found: false;
      reason: string;
    };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const LOW_PRIORITY_NAMES = [
  "starbucks",
  "burger king",
  "mcdonald",
  "mcdonald's",
  "dunkin",
  "baskin robbins",
  "subway",
  "wendy's",
  "wendys",
  "popeyes",
  "kfc",
  "taco bell",
  "chipotle",
  "domino",
  "domino's",
  "papa john",
  "little caesars",
  "white castle",
  "checkers",
  "five guys",
  "shake shack",
  "ihop",
  "denny",
  "applebee",
  "chili's",
  "olive garden",
  "panera",
  "pret a manger",
  "cvs",
  "walgreens",
  "rite aid",
  "duane reade",
  "target",
  "walmart",
  "costco",
  "carvel",
  "cold stone",
  "auntie anne",
  "pretzel",
  "mall kiosk",
  "food court",
  "gas station",
  "pharmacy",
  "convenience",
  "bodega",
  "deli grocery",
  "smoke shop",
  "liquor store",
];

const THEATER_TERMS = [
  "theatre",
  "theater",
  "cinema",
  "movie",
  "broadway",
  "playhouse",
  "performing arts",
  "performance venue",
  "stage",
  "box office",
];

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function forbidden(message = "Forbidden") {
  return jsonResponse({ success: false, error: message }, 403);
}

function serverError(message: string, details?: unknown) {
  return jsonResponse({ success: false, error: message, details }, 500);
}

function createAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanText(value: unknown) {
  return String(value || "").toLowerCase().trim();
}

function cleanDisplayText(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function displayName(location: Record<string, unknown>) {
  return (
    cleanDisplayText(location.name) ||
    cleanDisplayText(location.restaurant_name) ||
    cleanDisplayText(location.activity_name) ||
    "Unknown location"
  );
}

function haystack(location: Record<string, unknown>) {
  return [
    location.name,
    location.restaurant_name,
    location.activity_name,
    location.primary_category,
    location.category,
    location.location_type,
    location.activity_type,
    location.cuisine,
    location.cuisine_type,
    location.description,
    location.google_types,
    location.search_document,
  ]
    .map(cleanText)
    .join(" ");
}

function isLikelyChainOrLowPriority(location: Record<string, unknown>) {
  const text = haystack(location);
  return LOW_PRIORITY_NAMES.some((term) => text.includes(term));
}

function isLikelyTheaterOrPerformance(location: Record<string, unknown>) {
  const text = haystack(location);
  return THEATER_TERMS.some((term) => text.includes(term));
}

function isPublishReady(location: Record<string, unknown>) {
  const visibility = cleanText(location.public_visibility_tier);
  const quality = cleanText(location.quality_status);
  const curation = cleanText(location.curation_tier);

  return (
    visibility === "standard" ||
    visibility === "featured" ||
    visibility === "premium" ||
    quality === "approved" ||
    quality === "publish_ready" ||
    curation === "curated" ||
    curation === "featured"
  );
}

function eligibilityReason(location: Record<string, unknown>) {
  if (isPublishReady(location)) return "eligible_curated_or_publish_ready";

  const type = cleanText(location.location_type);
  const category = cleanText(location.primary_category || location.category);

  if (type.includes("restaurant") || category.includes("restaurant")) {
    return "eligible_non_chain_restaurant";
  }

  if (type.includes("activity") || category.includes("activity")) {
    return "eligible_activity";
  }

  return "eligible_dry_run";
}

function previewLocation(location: Record<string, unknown>, reason?: string, extra?: Record<string, unknown>) {
  return {
    id: location.id,
    name: displayName(location),
    address: location.address || null,
    city: location.city || null,
    state: location.state || null,
    rating: location.rating ?? null,
    review_count: location.review_count ?? null,
    is_searchable: location.is_searchable ?? null,
    is_low_level: location.is_low_level ?? null,
    public_visibility_tier: location.public_visibility_tier ?? null,
    quality_status: location.quality_status ?? null,
    photo_status: location.photo_status || null,
    has_photos: location.has_photos ?? null,
    reason,
    ...(extra || {}),
  };
}

function incrementReason(map: Record<string, number>, reason: string) {
  map[reason] = (map[reason] || 0) + 1;
}

function buildGoogleSearchQuery(location: Record<string, unknown>) {
  return [
    displayName(location),
    cleanDisplayText(location.address),
    cleanDisplayText(location.city),
    cleanDisplayText(location.state),
    cleanDisplayText(location.zip_code),
  ]
    .filter(Boolean)
    .join(" ");
}

async function findGooglePlacePhoto(
  location: Record<string, unknown>,
  googleKey: string,
): Promise<GooglePhotoResult> {
  const query = buildGoogleSearchQuery(location);

  if (!query) {
    return { found: false, reason: "missing_google_query" };
  }

  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  url.searchParams.set("key", googleKey);

  const response = await fetch(url.toString());

  if (!response.ok) {
    return { found: false, reason: `google_http_${response.status}` };
  }

  const payload = await response.json();
  const status = String(payload.status || "UNKNOWN");

  if (status === "ZERO_RESULTS") {
    return { found: false, reason: "zero_results" };
  }

  if (status === "OVER_QUERY_LIMIT") {
    return { found: false, reason: "over_query_limit" };
  }

  if (status === "REQUEST_DENIED") {
    throw new Error(`Google Places request denied: ${payload.error_message || "No error message"}`);
  }

  if (status !== "OK") {
    return { found: false, reason: `google_status_${status.toLowerCase()}` };
  }

  const results = Array.isArray(payload.results) ? payload.results : [];

  for (const result of results) {
    const placeId = result.place_id;
    const photos = Array.isArray(result.photos) ? result.photos : [];
    const photoReference = photos[0]?.photo_reference;

    if (placeId && photoReference) {
      return {
        found: true,
        placeId,
        photoReference,
        googleName: result.name || null,
        googleAddress: result.formatted_address || null,
      };
    }
  }

  return { found: false, reason: "no_photo_reference" };
}

function buildGooglePhotoUrl(photoReference: string, googleKey: string) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/photo");
  url.searchParams.set("maxwidth", "1200");
  url.searchParams.set("photo_reference", photoReference);
  url.searchParams.set("key", googleKey);
  return url.toString();
}

async function updateLocationPhoto(
  supabase: any,
  location: Record<string, unknown>,
  photoUrl: string,
  placeId: string,
) {
  const now = new Date().toISOString();

  const preferredUpdate = {
    image_url: photoUrl,
    photo_url: photoUrl,
    google_place_id: placeId,
    has_photos: true,
    photo_status: "has_photo",
    updated_at: now,
  };

  let result = await supabase
    .from("locations")
    .update(preferredUpdate)
    .eq("id", location.id);

  if (result.error) {
    const minimalUpdate = {
      image_url: photoUrl,
      has_photos: true,
      photo_status: "has_photo",
    };

    result = await supabase
      .from("locations")
      .update(minimalUpdate)
      .eq("id", location.id);
  }

  if (result.error) {
    return { success: false, error: result.error };
  }

  return { success: true };
}

async function loadMissingPhotoLocations(supabase: any, batchSize: number) {
  const preferredSelect = [
    "id",
    "name",
    "restaurant_name",
    "activity_name",
    "address",
    "city",
    "state",
    "zip_code",
    "image_url",
    "photo_url",
    "has_photos",
    "photo_status",
    "google_place_id",
    "place_id",
    "rating",
    "review_count",
    "is_low_level",
    "is_searchable",
    "quality_status",
    "public_visibility_tier",
    "curation_tier",
    "primary_category",
    "category",
    "location_type",
    "activity_type",
    "cuisine",
    "cuisine_type",
    "description",
    "google_types",
    "search_document",
  ].join(",");

  const minimalSelect = [
    "id",
    "name",
    "restaurant_name",
    "activity_name",
    "address",
    "city",
    "state",
    "zip_code",
    "image_url",
    "has_photos",
    "photo_status",
  ].join(",");

  let result = await supabase
    .from("locations")
    .select(preferredSelect)
    .or("has_photos.is.false,has_photos.is.null,photo_status.eq.missing_photo,image_url.is.null")
    .order("is_searchable", { ascending: false, nullsFirst: false })
    .order("is_low_level", { ascending: true, nullsFirst: false })
    .order("rating", { ascending: false, nullsFirst: false })
    .order("review_count", { ascending: false, nullsFirst: false })
    .limit(batchSize);

  if (result.error) {
    console.warn(
      "Preferred location select/order failed, retrying minimal select:",
      result.error.message,
    );

    result = await supabase
      .from("locations")
      .select(minimalSelect)
      .or("has_photos.is.false,has_photos.is.null,photo_status.eq.missing_photo,image_url.is.null")
      .limit(batchSize);
  }

  if (result.error) {
    throw result.error;
  }

  return Array.isArray(result.data) ? result.data : [];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const startedAt = Date.now();

  try {
    const expectedSecret = Deno.env.get("CRON_SECRET") || "";
    const providedSecret = req.headers.get("x-cron-secret") || "";

    if (!expectedSecret || providedSecret !== expectedSecret) {
      return forbidden("Invalid cron secret");
    }

    let body: BackfillBody = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const source = body.source || "manual";
    const dryRun = body.dryRun === true;
    const includeChains = body.includeChains === true;
    const skipChains = body.skipChains !== false;
    const includeTheaters = body.includeTheaters === true;
    const includeLowPriority = body.includeLowPriority === true;
    const onlySearchable = body.onlySearchable === true;
    const onlyPublishReady = body.onlyPublishReady === true;

    const requestedBatchSize = Number(body.batchSize || 25);
    const batchSize = Math.max(1, Math.min(requestedBatchSize, 100));

    const supabase = createAdminClient();
    const locations = await loadMissingPhotoLocations(supabase, batchSize);

    const googleKey = Deno.env.get("GOOGLE_PLACES_API_KEY") || "";

    let checked = 0;
    let eligible = 0;
    let googleChecked = 0;
    let googleMatched = 0;
    let googleNoPhoto = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    const locationsPreview = [];
    const skippedPreview = [];
    const updatedPreview = [];
    const skippedByReason: Record<string, number> = {};

    for (const location of locations) {
      checked += 1;

      try {
        if (onlySearchable && location.is_searchable !== true) {
          skipped += 1;
          incrementReason(skippedByReason, "not_searchable");
          if (skippedPreview.length < 10) skippedPreview.push(previewLocation(location, "not_searchable"));
          continue;
        }

        if (onlyPublishReady && !isPublishReady(location)) {
          skipped += 1;
          incrementReason(skippedByReason, "not_publish_ready");
          if (skippedPreview.length < 10) skippedPreview.push(previewLocation(location, "not_publish_ready"));
          continue;
        }

        if (!includeTheaters && isLikelyTheaterOrPerformance(location)) {
          skipped += 1;
          incrementReason(skippedByReason, "theater_or_performance");
          if (skippedPreview.length < 10) skippedPreview.push(previewLocation(location, "theater_or_performance"));
          continue;
        }

        const lowPriority = isLikelyChainOrLowPriority(location);

        if (!includeLowPriority && skipChains && !includeChains && lowPriority) {
          skipped += 1;
          incrementReason(skippedByReason, "chain_or_low_priority");
          if (skippedPreview.length < 10) skippedPreview.push(previewLocation(location, "chain_or_low_priority"));
          continue;
        }

        eligible += 1;

        if (dryRun) {
          skipped += 1;
          if (locationsPreview.length < 10) {
            locationsPreview.push(previewLocation(location, eligibilityReason(location)));
          }
          continue;
        }

        if (!googleKey) {
          skipped += 1;
          incrementReason(skippedByReason, "missing_google_places_key");
          if (skippedPreview.length < 10) {
            skippedPreview.push(previewLocation(location, "missing_google_places_key"));
          }
          continue;
        }

        googleChecked += 1;

        const googlePhoto = await findGooglePlacePhoto(location, googleKey);
        await sleep(150);

        if (!googlePhoto.found) {
          skipped += 1;
          googleNoPhoto += 1;
          incrementReason(skippedByReason, googlePhoto.reason);
          if (skippedPreview.length < 10) {
            skippedPreview.push(previewLocation(location, googlePhoto.reason));
          }
          continue;
        }

        const photoUrl = buildGooglePhotoUrl(googlePhoto.photoReference, googleKey);
        const updateResult = await updateLocationPhoto(supabase, location, photoUrl, googlePhoto.placeId);

        if (!updateResult.success) {
          failed += 1;
          incrementReason(skippedByReason, "update_failed");
          if (skippedPreview.length < 10) {
            skippedPreview.push(previewLocation(location, "update_failed", {
              updateError: updateResult.error?.message || String(updateResult.error),
            }));
          }
          continue;
        }

        updated += 1;
        googleMatched += 1;

        if (updatedPreview.length < 10) {
          updatedPreview.push(previewLocation(location, "updated_google_photo", {
            googleName: googlePhoto.googleName,
            googleAddress: googlePhoto.googleAddress,
            googlePlaceId: googlePhoto.placeId,
          }));
        }
      } catch (error) {
        failed += 1;
        incrementReason(skippedByReason, "location_processing_error");
        console.error("Photo backfill failed for location", location?.id, error);

        if (skippedPreview.length < 10) {
          skippedPreview.push(previewLocation(location, "location_processing_error", {
            error: error instanceof Error ? error.message : String(error),
          }));
        }
      }
    }

    return jsonResponse({
      success: true,
      source,
      dryRun,
      includeChains,
      skipChains,
      includeTheaters,
      includeLowPriority,
      onlySearchable,
      onlyPublishReady,
      checked,
      eligible,
      googleChecked,
      googleMatched,
      googleNoPhoto,
      updated,
      skipped,
      failed,
      skippedByReason,
      eligiblePreviewCount: locationsPreview.length,
      skippedPreviewCount: skippedPreview.length,
      updatedPreviewCount: updatedPreview.length,
      message: dryRun
        ? "Dry run completed. No database updates were made."
        : "Photo backfill completed.",
      debug: {
        queryReturnedArray: Array.isArray(locations),
        rawCount: locations.length,
        locationsPreview,
        skippedPreview,
        updatedPreview,
      },
      timingMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error("nightly-photo-backfill failed", error);

    return serverError("nightly-photo-backfill failed", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
});
