import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logCronJobRun } from "../_shared/cronLogger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": [
    "authorization",
    "x-client-info",
    "apikey",
    "content-type",
    "x-cron-secret",
    "x-worker-secret",
  ].join(", "),
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const PREFERRED_SELECT = [
  "id",
  "name",
  "restaurant_name",
  "activity_name",
  "address",
  "city",
  "state",
  "zip_code",
  "google_place_id",
  "image_url",
  "main_image",
  "images",
  "has_photos",
  "photo_status",
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

const FALLBACK_SELECT =
  "id,name,address,city,state,zip_code,google_place_id,image_url,main_image,has_photos,photo_status";
const MISSING_PHOTO_FILTER =
  "has_photos.is.false,has_photos.is.null,photo_status.eq.missing_photo,image_url.is.null,main_image.is.null";

const ADMIN_ROLES = new Set([
  "superadmin",
  "admin",
  "experience_team",
  "sales_ambassador",
  "support",
]);

const LOW_PRIORITY_TERMS = [
  "starbucks",
  "burger king",
  "mcdonald",
  "dunkin",
  "subway",
  "wendy",
  "popeyes",
  "kfc",
  "taco bell",
  "chipotle",
  "domino",
  "papa john",
  "white castle",
  "five guys",
  "shake shack",
  "ihop",
  "denny",
  "applebee",
  "olive garden",
  "panera",
  "cvs",
  "walgreens",
  "rite aid",
  "target",
  "walmart",
  "costco",
  "gas station",
  "pharmacy",
  "convenience",
  "bodega",
  "smoke shop",
  "liquor store",
  "food court",
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
  "box office",
];

type LocationRow = Record<string, unknown>;
type SupabaseClient = ReturnType<typeof createClient>;
type User = {
  id: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
};

type GooglePhotoResult =
  | {
      found: true;
      placeId: string;
      googleName: string | null;
      googleAddress: string | null;
    }
  | { found: false; reason: string };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalize(value: unknown) {
  return clean(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function secureCompare(left: string, right: string) {
  if (!left || !right || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function createAdminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRole) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function roleFromTable(
  supabase: SupabaseClient,
  table: string,
  userId: string,
) {
  try {
    const { data, error } = await supabase
      .from(table)
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data?.role) return null;
    return clean(data.role).toLowerCase();
  } catch {
    return null;
  }
}

async function requireAdminOrSecret(req: Request, supabase: SupabaseClient) {
  const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
  const workerSecret = Deno.env.get("WORKER_INTERNAL_SECRET") ?? "";

  if (
    cronSecret &&
    secureCompare(req.headers.get("x-cron-secret") ?? "", cronSecret)
  ) {
    return { source: "cron" as const };
  }

  if (
    workerSecret &&
    secureCompare(req.headers.get("x-worker-secret") ?? "", workerSecret)
  ) {
    return { source: "worker" as const };
  }

  const authorization = req.headers.get("authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  if (!token) throw new Error("UNAUTHORIZED: credentials required");

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error("UNAUTHORIZED: invalid user token");

  const user = data.user as User;
  const directRole = clean(user.app_metadata?.role).toLowerCase();
  if (ADMIN_ROLES.has(directRole)) {
    return { source: "admin" as const, userId: user.id, role: directRole };
  }

  for (const table of ["profiles", "admin_users"]) {
    const role = await roleFromTable(supabase, table, user.id);
    if (role && ADMIN_ROLES.has(role)) {
      return { source: "admin" as const, userId: user.id, role };
    }
  }

  throw new Error("FORBIDDEN: admin role required");
}

function displayName(location: LocationRow) {
  return clean(
    location.name || location.restaurant_name || location.activity_name,
  );
}

function searchText(location: LocationRow) {
  return [
    location.name,
    location.restaurant_name,
    location.activity_name,
    location.address,
    location.city,
    location.state,
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
    .map(normalize)
    .join(" ");
}

function validPhoto(value: unknown) {
  const raw = clean(value);
  if (!raw) return false;
  const lowered = raw.toLowerCase();
  if (
    lowered.includes("placeholder") ||
    lowered.includes("no-image") ||
    lowered.includes("no image") ||
    lowered.includes("missing-photo") ||
    lowered === "null" ||
    lowered === "undefined"
  ) {
    return false;
  }
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function hasPhoto(location: LocationRow) {
  return (
    location.has_photos === true ||
    clean(location.photo_status).toLowerCase() === "has_photo" ||
    validPhoto(location.main_image) ||
    validPhoto(location.image_url)
  );
}

function isTheater(location: LocationRow) {
  const text = searchText(location);
  return THEATER_TERMS.some((term) => text.includes(term));
}

function isLowPriority(location: LocationRow) {
  const text = searchText(location);
  return LOW_PRIORITY_TERMS.some((term) => text.includes(term));
}

function isPublishReady(location: LocationRow) {
  return [
    location.quality_status,
    location.public_visibility_tier,
    location.curation_tier,
  ].some((value) => normalize(value).includes("publish ready"));
}

function priority(location: LocationRow) {
  const searchable = location.is_searchable === true ? 1_000_000 : 0;
  const lowLevel = location.is_low_level === true ? -1_000_000 : 0;
  const rating = Number(location.rating || 0) * 100;
  const reviews = Math.min(Number(location.review_count || 0), 10000) / 10;
  const placeId = clean(location.google_place_id) ? 100 : 0;
  return searchable + lowLevel + rating + reviews + placeId;
}

function buildGoogleQuery(location: LocationRow) {
  return [
    displayName(location),
    location.address,
    location.city,
    location.state,
    location.zip_code,
  ]
    .map(clean)
    .filter(Boolean)
    .join(" ");
}

function tokens(value: unknown) {
  const ignored = new Set([
    "the",
    "and",
    "of",
    "restaurant",
    "kitchen",
    "cafe",
    "bar",
    "grill",
    "inc",
    "llc",
  ]);
  return new Set(
    normalize(value)
      .split(" ")
      .filter((token) => token.length > 2 && !ignored.has(token)),
  );
}

function overlapScore(left: unknown, right: unknown) {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const token of a) if (b.has(token)) overlap += 1;
  return overlap / Math.max(a.size, b.size);
}

function streetNumber(value: unknown) {
  return clean(value).match(/\d+/)?.[0] ?? null;
}

function matchGoogleLocation(
  location: LocationRow,
  googleName: string | null,
  googleAddress: string | null,
) {
  const score = overlapScore(displayName(location), googleName);
  const localNumber = streetNumber(location.address);
  const googleNumber = streetNumber(googleAddress);

  if (localNumber && googleNumber && localNumber !== googleNumber) {
    return score >= 0.9 && normalize(googleAddress).includes(normalize(location.city));
  }
  if (localNumber && googleNumber && localNumber === googleNumber) {
    return score >= 0.25;
  }
  return score >= 0.6;
}

async function findGooglePhoto(
  location: LocationRow,
  apiKey: string,
): Promise<GooglePhotoResult> {
  const query = buildGoogleQuery(location);
  if (!query) return { found: false, reason: "empty_google_query" };

  const response = await fetch(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.photos",
      },
      body: JSON.stringify({
        textQuery: query,
        pageSize: 10,
        regionCode: "US",
      }),
    },
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = clean(payload?.error?.message) || `HTTP ${response.status}`;
    if (response.status === 403) {
      throw new Error(`Google Places request denied: ${message}`);
    }
    if (response.status === 429) {
      return { found: false, reason: "over_query_limit" };
    }
    return { found: false, reason: `http_${response.status}` };
  }

  for (const place of Array.isArray(payload?.places) ? payload.places : []) {
    const placeId = clean(place?.id);
    const photoName = clean(place?.photos?.[0]?.name);
    if (!placeId || !photoName) continue;
    return {
      found: true,
      placeId,
      googleName: clean(place?.displayName?.text) || null,
      googleAddress: clean(place?.formattedAddress) || null,
    };
  }

  return {
    found: false,
    reason: Array.isArray(payload?.places) && payload.places.length
      ? "no_photo_reference"
      : "zero_results",
  };
}

function proxyPhotoUrl(placeId: string) {
  const url = new URL(
    "https://www.theouthaven.com/api/public/google-place-photo",
  );
  url.searchParams.set("placeId", placeId);
  url.searchParams.set("maxwidth", "1200");
  return url.toString();
}

async function updateLocationPhoto(
  supabase: SupabaseClient,
  location: LocationRow,
  placeId: string,
) {
  const photoUrl = proxyPhotoUrl(placeId);
  const now = new Date().toISOString();
  const preferred = await supabase
    .from("locations")
    .update({
      image_url: photoUrl,
      main_image: photoUrl,
      google_place_id: placeId,
      has_photos: true,
      photo_status: "has_photo",
      photo_source: "google_places_new",
      updated_at: now,
    })
    .eq("id", location.id);

  if (!preferred.error) return null;

  const text = [
    preferred.error.message,
    preferred.error.details,
    preferred.error.hint,
    preferred.error.code,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    !text.includes("column") &&
    !text.includes("schema cache") &&
    preferred.error.code !== "PGRST204"
  ) {
    return preferred.error;
  }

  const fallback = await supabase
    .from("locations")
    .update({
      image_url: photoUrl,
      has_photos: true,
      photo_status: "has_photo",
    })
    .eq("id", location.id);

  return fallback.error;
}

async function loadCandidates(supabase: SupabaseClient, batchSize: number) {
  const loadLimit = Math.min(Math.max(batchSize * 4, batchSize), 500);
  let result = await supabase
    .from("locations")
    .select(PREFERRED_SELECT)
    .or(MISSING_PHOTO_FILTER)
    .limit(loadLimit);

  if (result.error) {
    result = await supabase
      .from("locations")
      .select(FALLBACK_SELECT)
      .or(MISSING_PHOTO_FILTER)
      .limit(loadLimit);
  }

  if (result.error) throw result.error;
  return ((result.data || []) as LocationRow[]).sort(
    (a, b) => priority(b) - priority(a),
  );
}

async function logEdgeRun(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
) {
  try {
    await supabase.from("edge_function_logs").insert({
      function_name: "nightly-photo-backfill",
      status: payload.status || "success",
      source: payload.source || null,
      output_summary: payload.output_summary || null,
      error_message: payload.error_message || null,
      duration_ms: payload.duration_ms || null,
      metadata: payload.metadata || null,
    });
  } catch {
    // Observability must never break the worker.
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const startedAt = Date.now();
  const supabase = createAdminClient();
  let source: string | null = null;

  try {
    const auth = await requireAdminOrSecret(req, supabase);
    source = auth.source;

    const body = await req.json().catch(() => ({}));
    const batchSize = Math.min(Math.max(Number(body.batchSize ?? 25), 1), 100);
    const dryRun = Boolean(body.dryRun);
    const includeTheaters = Boolean(body.includeTheaters);
    const includeLowPriority = Boolean(
      body.includeLowPriority ?? body.includeChains,
    );
    const onlySearchable = Boolean(body.onlySearchable);
    const onlyPublishReady = Boolean(body.onlyPublishReady);

    const loaded = await loadCandidates(supabase, batchSize);
    const skippedByReason: Record<string, number> = {};
    const skippedPreview: Array<Record<string, unknown>> = [];
    const candidates: LocationRow[] = [];

    for (const location of loaded) {
      let reason: string | null = null;
      if (hasPhoto(location)) reason = "already_has_photo";
      else if (!includeTheaters && isTheater(location)) {
        reason = "theater_or_performance";
      } else if (!includeLowPriority && isLowPriority(location)) {
        reason = "chain_or_low_priority";
      } else if (onlySearchable && location.is_searchable !== true) {
        reason = "not_searchable";
      } else if (onlyPublishReady && !isPublishReady(location)) {
        reason = "not_publish_ready";
      }

      if (reason) {
        skippedByReason[reason] = (skippedByReason[reason] || 0) + 1;
        if (skippedPreview.length < 10) {
          skippedPreview.push({
            id: location.id,
            name: displayName(location),
            reason,
          });
        }
        continue;
      }

      candidates.push(location);
      if (candidates.length >= batchSize) break;
    }

    const locationsPreview = candidates.slice(0, 5).map((location) => ({
      ...location,
      eligibility_reasons: ["eligible_photo_backfill"],
    }));

    if (dryRun) {
      return json({
        success: true,
        checked: candidates.length + skippedPreview.length,
        eligible: candidates.length,
        googleChecked: 0,
        googleMatched: 0,
        googleNoPhoto: 0,
        googleRejected: 0,
        updated: 0,
        skipped: Object.values(skippedByReason).reduce((a, b) => a + b, 0),
        failed: 0,
        skippedByReason,
        locationsPreview,
        skippedPreview,
        updatedPreview: [],
        dryRun: true,
        googleApi: "places_api_new",
        message: "Dry run completed. No database updates were made.",
      });
    }

    const googleKey = clean(Deno.env.get("GOOGLE_PLACES_API_KEY"));
    if (!googleKey) {
      throw new Error("Missing GOOGLE_PLACES_API_KEY in Supabase Edge Function secrets");
    }

    let googleChecked = 0;
    let googleMatched = 0;
    let googleNoPhoto = 0;
    let googleRejected = 0;
    let updated = 0;
    let failed = 0;
    const updatedPreview: Array<Record<string, unknown>> = [];

    for (const location of candidates) {
      try {
        googleChecked += 1;
        const result = await findGooglePhoto(location, googleKey);
        if (!result.found) {
          googleNoPhoto += 1;
          skippedByReason[result.reason] =
            (skippedByReason[result.reason] || 0) + 1;
          continue;
        }

        if (
          !matchGoogleLocation(
            location,
            result.googleName,
            result.googleAddress,
          )
        ) {
          googleRejected += 1;
          skippedByReason.google_match_rejected =
            (skippedByReason.google_match_rejected || 0) + 1;
          continue;
        }

        const updateError = await updateLocationPhoto(
          supabase,
          location,
          result.placeId,
        );
        if (updateError) {
          failed += 1;
          skippedByReason.update_failed =
            (skippedByReason.update_failed || 0) + 1;
          continue;
        }

        updated += 1;
        googleMatched += 1;
        if (updatedPreview.length < 10) {
          updatedPreview.push({
            id: location.id,
            name: displayName(location),
            googleName: result.googleName,
            googleAddress: result.googleAddress,
          });
        }
      } catch (error) {
        const message = safeError(error);
        if (message.includes("Google Places request denied")) throw error;
        failed += 1;
        skippedByReason.google_request_failed =
          (skippedByReason.google_request_failed || 0) + 1;
      }
    }

    const skipped = Object.values(skippedByReason).reduce((a, b) => a + b, 0);
    const checked = candidates.length + skippedPreview.length;
    const durationMs = Date.now() - startedAt;

    await logCronJobRun(supabase, {
      job_name: "nightly-photo-backfill",
      function_name: "nightly-photo-backfill",
      route_path: "supabase/functions/nightly-photo-backfill",
      description: "Backfills location photos overnight.",
      schedule_hint: "Edge Function / nightly",
      source,
      status: failed ? "warning" : "success",
      started_at: new Date(startedAt).toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: durationMs,
      checked_count: checked,
      success_count: updated,
      skipped_count: skipped,
      failed_count: failed,
      success_rate: checked ? updated / checked : null,
      metadata: {
        googleApi: "places_api_new",
        googleChecked,
        googleMatched,
        googleNoPhoto,
        googleRejected,
        skippedByReason,
      },
    });

    await logEdgeRun(supabase, {
      source,
      status: failed ? "warning" : "success",
      duration_ms: durationMs,
      output_summary: {
        checked,
        eligible: candidates.length,
        googleChecked,
        googleMatched,
        googleNoPhoto,
        googleRejected,
        updated,
        skipped,
        failed,
      },
      metadata: { googleApi: "places_api_new" },
    });

    return json({
      success: true,
      checked,
      eligible: candidates.length,
      googleChecked,
      googleMatched,
      googleNoPhoto,
      googleRejected,
      updated,
      skipped,
      failed,
      skippedByReason,
      locationsPreview,
      skippedPreview,
      updatedPreview,
      googlePlacesAvailable: true,
      googleApi: "places_api_new",
      message: "Photo backfill completed.",
    });
  } catch (error) {
    const message = safeError(error);
    const durationMs = Date.now() - startedAt;

    try {
      await logCronJobRun(supabase, {
        job_name: "nightly-photo-backfill",
        function_name: "nightly-photo-backfill",
        route_path: "supabase/functions/nightly-photo-backfill",
        description: "Backfills location photos overnight.",
        schedule_hint: "Edge Function / nightly",
        source,
        status: "failed",
        started_at: new Date(startedAt).toISOString(),
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
        failed_count: 1,
        error_message: message,
        metadata: { googleApi: "places_api_new" },
      });
      await logEdgeRun(supabase, {
        source,
        status: "error",
        duration_ms: durationMs,
        error_message: message,
        metadata: { googleApi: "places_api_new" },
      });
    } catch {
      // Keep the original failure response.
    }

    const status = message.startsWith("UNAUTHORIZED")
      ? 401
      : message.startsWith("FORBIDDEN")
        ? 403
        : 500;
    return json(
      {
        success: false,
        error: "server_error",
        message,
        googleApi: "places_api_new",
      },
      status,
    );
  }
});
