import {
  createClient,
  type PostgrestError,
  type SupabaseClient,
  type User,
} from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": [
    "authorization",
    "x-client-info",
    "apikey",
    "content-type",
    "x-cron-secret",
  ].join(", "),
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const PREFERRED_LOCATION_SELECT =
  "id,name,restaurant_name,activity_name,address,city,state,zip_code,image_url,photo_url,has_photos,photo_status,google_place_id,place_id,rating,review_count,is_low_level,is_searchable,quality_status,public_visibility_tier,curation_tier,primary_category,category,location_type,activity_type,cuisine,cuisine_type,description,google_types,search_document";
const MINIMAL_LOCATION_SELECT =
  "id,name,address,city,state,zip_code,image_url,has_photos,photo_status";
const MISSING_PHOTO_FILTER =
  "has_photos.is.false,has_photos.is.null,photo_status.eq.missing_photo,image_url.is.null";
const ADMIN_ROLES = new Set([
  "superadmin",
  "admin",
  "experience_team",
  "sales_ambassador",
  "support",
]);
const BAD_PHOTO_VALUES = new Set([
  "",
  "null",
  "undefined",
  "none",
  "n/a",
  "na",
  "#",
  "?",
]);
const PLACEHOLDER_PHOTO_PATTERNS = [
  /placeholder/i,
  /no[-_ ]?image/i,
  /missing[-_ ]?photo/i,
  /default[-_ ]?image/i,
  /blank\.(png|jpg|jpeg|webp)$/i,
];
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
  "gas station",
  "pharmacy",
  "convenience",
  "bodega",
  "deli grocery",
  "smoke shop",
  "liquor store",
  "carvel",
  "cold stone",
  "baskin",
  "auntie anne",
  "pretzel",
  "mall kiosk",
  "food court",
  "movie theater",
  "cinema",
  "theatre",
  "theater",
  "broadway",
  "playhouse",
  "performing arts",
  "performance venue",
];
const THEATER_OR_PERFORMANCE_TERMS = [
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

type LocationRow = Record<string, unknown>;
type SkippedPreviewItem = { id: unknown; name: string; reason: string };
type LocationPreviewItem = LocationRow & { eligibility_reasons: string[] };
type PhotoResult = { photoUrl?: string; skipped?: boolean; reason?: string };
type LoadLocationsResult = {
  data: LocationRow[] | null;
  error: PostgrestError | null;
  fallbackSelectUsed?: boolean;
  fallbackReason?: string;
  fallbackOrderUsed?: boolean;
  fallbackOrderReason?: string;
};
type SelectionResult = {
  selected: LocationRow[];
  skipped: number;
  skippedPreview: SkippedPreviewItem[];
  skippedByReason: Record<string, number>;
};

function handleOptions(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response("ok", { status: 200, headers: corsHeaders });
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const ok = (data: unknown) => jsonResponse(data, 200);
const serverError = (message: string, details?: unknown) =>
  jsonResponse(
    { success: false, error: "server_error", message, details },
    500,
  );

function createSupabaseAdminClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl)
    throw new Error("SUPABASE_URL is required for Edge Functions");
  if (!serviceRoleKey)
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for Edge Functions");
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function readBearerToken(req: Request): string | null {
  const header =
    req.headers.get("Authorization") || req.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

async function getUserFromRequest(
  req: Request,
  supabase: SupabaseClient,
): Promise<User | null> {
  const token = readBearerToken(req);
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error) return null;
  return data.user ?? null;
}

function roleFromUser(user: User | null): string | null {
  const appRole = (user?.app_metadata as Record<string, unknown> | undefined)
    ?.role;
  const userRole = (user?.user_metadata as Record<string, unknown> | undefined)
    ?.role;
  return String(appRole ?? userRole ?? "").toLowerCase() || null;
}

async function roleFromTable(
  supabase: SupabaseClient,
  table: string,
  userId: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from(table)
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data?.role) return null;
    return String(data.role).toLowerCase();
  } catch {
    return null;
  }
}

async function requireAdminOrCron(
  req: Request,
  supabase: SupabaseClient,
): Promise<{ source: "admin" | "cron"; user?: User; role?: string }> {
  const expected = Deno.env.get("CRON_SECRET");
  const received = req.headers.get("x-cron-secret") || "";
  if (expected && received === expected) return { source: "cron" };

  const user = await getUserFromRequest(req, supabase);
  if (!user)
    throw new Error("UNAUTHORIZED: valid user JWT or cron secret required");
  const directRole = roleFromUser(user);
  if (directRole && ADMIN_ROLES.has(directRole))
    return { source: "admin", user, role: directRole };
  for (const table of ["profiles", "admin_users"]) {
    const tableRole = await roleFromTable(supabase, table, user.id);
    if (tableRole && ADMIN_ROLES.has(tableRole))
      return { source: "admin", user, role: tableRole };
  }
  throw new Error("FORBIDDEN: admin role required");
}

function startTimer(): () => number {
  const started = Date.now();
  return () => Date.now() - started;
}

function safeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

async function logEdgeFunctionRun(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const { error } = await supabase.from("edge_function_logs").insert({
      function_name: payload.function_name,
      status: payload.status ?? "success",
      source: payload.source ?? null,
      request_id: payload.request_id ?? null,
      user_id: payload.user_id ?? null,
      input_summary: payload.input_summary ?? null,
      output_summary: payload.output_summary ?? null,
      error_message: payload.error_message ?? null,
      duration_ms: payload.duration_ms ?? null,
      metadata: payload.metadata ?? null,
    });
    if (error) console.warn("[edge-log] skipped", error.message);
  } catch (error) {
    console.warn("[edge-log] unavailable", safeError(error));
  }
}

function validPhotoUrl(value: unknown): boolean {
  const text = String(value ?? "").trim();
  if (BAD_PHOTO_VALUES.has(text.toLowerCase())) return false;
  if (PLACEHOLDER_PHOTO_PATTERNS.some((pattern) => pattern.test(text)))
    return false;
  if (text.startsWith("/placeholder")) return false;
  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function hasValidPhoto(item: LocationRow): boolean {
  if (item?.has_photos === true) return true;
  if (String(item?.photo_status ?? "").toLowerCase() === "has_photo")
    return true;
  return (
    validPhotoUrl(item?.image_url) ||
    validPhotoUrl(item?.photo_url) ||
    validPhotoUrl(item?.main_image)
  );
}

function normalizeText(value: unknown): string {
  if (Array.isArray(value)) return value.map(normalizeText).join(" ");
  if (value && typeof value === "object") {
    try {
      return JSON.stringify(value).toLowerCase();
    } catch {
      return "";
    }
  }
  return String(value ?? "").toLowerCase();
}

function locationSearchText(location: LocationRow, keys: string[]): string {
  return keys.map((key) => normalizeText(location[key])).join(" ");
}

function locationDisplayName(location: LocationRow): string {
  return String(
    location.name || location.restaurant_name || location.activity_name || "",
  );
}

function isLikelyTheaterOrPerformance(location: LocationRow): boolean {
  const text = locationSearchText(location, [
    "name",
    "restaurant_name",
    "activity_name",
    "category",
    "primary_category",
    "location_type",
    "activity_type",
    "description",
    "google_types",
    "search_document",
  ]);
  return THEATER_OR_PERFORMANCE_TERMS.some((term) => text.includes(term));
}

function isLikelyChainOrLowPriority(location: LocationRow): boolean {
  const text = locationSearchText(location, [
    "name",
    "restaurant_name",
    "activity_name",
    "address",
    "category",
    "primary_category",
    "location_type",
    "activity_type",
    "description",
    "google_types",
    "search_document",
  ]);

  return LOW_PRIORITY_NAMES.some((term) => text.includes(term));
}

function numericValue(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function truthyPriority(value: unknown): number {
  return value ? 1 : 0;
}

function textPriority(value: unknown, preferred: string[]): number {
  const text = normalizeText(value).replace(/[_-]+/g, " ").trim();
  if (!text) return 0;
  const index = preferred.findIndex((term) => text.includes(term));
  return index === -1 ? 0 : preferred.length - index;
}

function locationPriorityScore(location: LocationRow): number {
  const rating = numericValue(location.rating) ?? 0;
  const reviewCount = numericValue(location.review_count) ?? 0;
  const isLowLevel = location.is_low_level === true ? -1_000_000 : 0;
  const searchable = location.is_searchable === true ? 750_000 : 0;
  const quality = textPriority(location.quality_status, [
    "publish ready",
    "standard",
    "approved",
    "good",
  ]);
  const visibility = textPriority(location.public_visibility_tier, [
    "publish ready",
    "standard",
    "public",
  ]);
  const curation = textPriority(location.curation_tier, [
    "publish ready",
    "standard",
    "curated",
  ]);
  const hasPlaceId =
    truthyPriority(location.google_place_id || location.place_id) * 100;

  return (
    searchable +
    isLowLevel +
    quality * 10_000 +
    visibility * 5_000 +
    curation * 5_000 +
    rating * 100 +
    Math.min(reviewCount, 10_000) / 100 +
    hasPlaceId
  );
}

function sortLocationsForBackfill(locations: LocationRow[]): LocationRow[] {
  return [...locations].sort((a, b) => {
    const theaterDelta =
      Number(isLikelyTheaterOrPerformance(a)) -
      Number(isLikelyTheaterOrPerformance(b));
    if (theaterDelta !== 0) return theaterDelta;

    const chainDelta =
      Number(isLikelyChainOrLowPriority(a)) -
      Number(isLikelyChainOrLowPriority(b));
    if (chainDelta !== 0) return chainDelta;

    return locationPriorityScore(b) - locationPriorityScore(a);
  });
}

function makeSkippedPreview(
  location: LocationRow,
  reason: string,
): SkippedPreviewItem {
  return {
    id: location.id ?? null,
    name: locationDisplayName(location),
    reason,
  };
}

function incrementReason(
  skippedByReason: Record<string, number>,
  reason: string,
): void {
  skippedByReason[reason] = (skippedByReason[reason] ?? 0) + 1;
}

function isLikelyActivity(location: LocationRow): boolean {
  const typeText = locationSearchText(location, [
    "activity_name",
    "location_type",
    "activity_type",
    "category",
    "primary_category",
  ]);
  return (
    Boolean(location.activity_name) ||
    [
      "activity",
      "attraction",
      "experience",
      "museum",
      "gallery",
      "park",
      "tour",
    ].some((term) => typeText.includes(term))
  );
}

function isLikelyRestaurant(location: LocationRow): boolean {
  const typeText = locationSearchText(location, [
    "restaurant_name",
    "location_type",
    "category",
    "primary_category",
    "cuisine",
    "cuisine_type",
  ]);
  return (
    Boolean(location.restaurant_name) ||
    ["restaurant", "food", "cafe", "bar", "bakery", "cuisine"].some((term) =>
      typeText.includes(term),
    )
  );
}

function isCurated(location: LocationRow): boolean {
  return (
    textPriority(location.quality_status, [
      "publish ready",
      "standard",
      "approved",
      "good",
    ]) > 0 ||
    textPriority(location.public_visibility_tier, [
      "publish ready",
      "standard",
      "public",
    ]) > 0 ||
    textPriority(location.curation_tier, [
      "publish ready",
      "standard",
      "curated",
    ]) > 0
  );
}

function isPublishReady(location: LocationRow): boolean {
  return [
    location.quality_status,
    location.public_visibility_tier,
    location.curation_tier,
  ].some((value) =>
    normalizeText(value).replace(/[_-]+/g, " ").includes("publish ready"),
  );
}

function eligibilityReasons(location: LocationRow, dryRun: boolean): string[] {
  const reasons = dryRun ? ["eligible_dry_run"] : [];
  if (isLikelyRestaurant(location) && !isLikelyChainOrLowPriority(location))
    reasons.push("eligible_non_chain_restaurant");
  if (isLikelyActivity(location)) reasons.push("eligible_activity");
  if (isCurated(location)) reasons.push("eligible_curated");
  return reasons;
}

function makeLocationPreview(
  location: LocationRow,
  dryRun: boolean,
): LocationPreviewItem {
  return {
    ...location,
    eligibility_reasons: eligibilityReasons(location, dryRun),
  };
}

function selectLocationsForRun(
  locations: LocationRow[],
  batchSize: number,
  options: {
    includeTheaters: boolean;
    includeLowPriority: boolean;
    onlySearchable: boolean;
    onlyPublishReady: boolean;
  },
): SelectionResult {
  const selected: LocationRow[] = [];
  const skippedPreview: SkippedPreviewItem[] = [];
  const skippedByReason: Record<string, number> = {};
  let skipped = 0;

  for (const location of locations) {
    let reason: string | null = null;

    if (!options.includeTheaters && isLikelyTheaterOrPerformance(location))
      reason = "theater_or_performance";
    else if (
      !options.includeLowPriority &&
      isLikelyChainOrLowPriority(location)
    )
      reason = "chain_or_low_priority";
    else if (options.onlySearchable && location.is_searchable !== true)
      reason = "not_searchable";
    else if (options.onlyPublishReady && !isPublishReady(location))
      reason = "not_publish_ready";

    if (reason) {
      skipped += 1;
      incrementReason(skippedByReason, reason);
      if (skippedPreview.length < 10)
        skippedPreview.push(makeSkippedPreview(location, reason));
      continue;
    }

    if (selected.length < batchSize) selected.push(location);
    if (selected.length >= batchSize) break;
  }

  return { selected, skipped, skippedPreview, skippedByReason };
}

async function findPhoto(location: LocationRow): Promise<PhotoResult> {
  const key = Deno.env.get("GOOGLE_PLACES_API_KEY");
  if (!key) return { skipped: true, reason: "GOOGLE_PLACES_API_KEY missing" };
  let placeId = String(location.place_id || location.google_place_id || "");
  if (!placeId) {
    const q = encodeURIComponent(
      [
        location.name || location.restaurant_name || location.activity_name,
        location.address,
        location.city,
      ]
        .filter(Boolean)
        .join(" "),
    );
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${q}&inputtype=textquery&fields=place_id&key=${key}`,
    );
    placeId = (await res.json()).candidates?.[0]?.place_id;
  }
  if (!placeId) return { skipped: true, reason: "place_id not found" };
  const details = await fetch(
    `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos&key=${key}`,
  );
  const ref = (await details.json()).result?.photos?.[0]?.photo_reference;
  if (!ref) return { skipped: true, reason: "photo reference not found" };
  return {
    photoUrl: `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${encodeURIComponent(ref)}&key=${key}`,
  };
}

async function loadMissingPhotoLocations(
  supabase: SupabaseClient,
  batchSize: number,
): Promise<LoadLocationsResult> {
  const loadLimit = Math.min(Math.max(batchSize * 4, batchSize), 500);
  let fallbackOrderUsed = false;
  let fallbackOrderReason: string | undefined;

  let fullResult = await supabase
    .from("locations")
    .select(PREFERRED_LOCATION_SELECT)
    .or(MISSING_PHOTO_FILTER)
    .order("is_searchable", { ascending: false, nullsFirst: false })
    .order("is_low_level", { ascending: true, nullsFirst: false })
    .order("rating", { ascending: false, nullsFirst: false })
    .order("review_count", { ascending: false, nullsFirst: false })
    .limit(loadLimit);

  if (fullResult.error) {
    fallbackOrderUsed = true;
    fallbackOrderReason = fullResult.error.message;
    fullResult = await supabase
      .from("locations")
      .select(PREFERRED_LOCATION_SELECT)
      .or(MISSING_PHOTO_FILTER)
      .limit(loadLimit);
  }

  if (!fullResult.error) {
    return {
      ...fullResult,
      data: sortLocationsForBackfill(
        Array.isArray(fullResult.data) ? fullResult.data : [],
      ),
      fallbackOrderUsed,
      fallbackOrderReason,
    };
  }

  const minimalResult = await supabase
    .from("locations")
    .select(MINIMAL_LOCATION_SELECT)
    .or(MISSING_PHOTO_FILTER)
    .limit(loadLimit);

  if (minimalResult.error) return minimalResult;

  return {
    ...minimalResult,
    data: sortLocationsForBackfill(
      Array.isArray(minimalResult.data) ? minimalResult.data : [],
    ),
    fallbackSelectUsed: true,
    fallbackReason: fullResult.error.message,
    fallbackOrderUsed,
    fallbackOrderReason,
  };
}

Deno.serve(async (req) => {
  const optionsResponse = handleOptions(req);
  if (optionsResponse) return optionsResponse;

  const startedAt = Date.now();
  const timer = startTimer();
  const supabase = createSupabaseAdminClient();
  let source: string | null = null;

  try {
    const auth = await requireAdminOrCron(req, supabase);
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
    const skipChains =
      body.skipChains === undefined ? true : Boolean(body.skipChains);
    const includeChains = Boolean(body.includeChains);
    const {
      data: locationRows,
      error: locationsError,
      fallbackSelectUsed,
      fallbackReason,
      fallbackOrderUsed,
      fallbackOrderReason,
    } = await loadMissingPhotoLocations(supabase, batchSize);

    if (locationsError) {
      await logEdgeFunctionRun(supabase, {
        function_name: "nightly-photo-backfill",
        status: "error",
        source,
        error_message: locationsError.message,
        duration_ms: Date.now() - startedAt,
        metadata: { stage: "load_locations" },
      });

      return serverError("Failed to load locations for photo backfill", {
        message: locationsError.message,
        details: locationsError,
      });
    }

    const loadedLocations = Array.isArray(locationRows) ? locationRows : [];
    const selection = selectLocationsForRun(loadedLocations, batchSize, {
      includeTheaters,
      includeLowPriority,
      onlySearchable,
      onlyPublishReady,
    });
    const locations = Array.isArray(selection.selected)
      ? selection.selected
      : [];
    const locationsPreview = locations
      .slice(0, 5)
      .map((location) => makeLocationPreview(location, dryRun));
    const skippedPreview = [...selection.skippedPreview];
    const debugDetails = dryRun
      ? {
          queryReturnedArray: Array.isArray(locationRows),
          rawCount: Array.isArray(locationRows) ? locationRows.length : 0,
          fallbackSelectUsed: Boolean(fallbackSelectUsed),
          fallbackReason: fallbackReason ?? null,
          fallbackOrderUsed: Boolean(fallbackOrderUsed),
          fallbackOrderReason: fallbackOrderReason ?? null,
        }
      : undefined;
    const optionMetadata = {
      dryRun,
      source,
      skipChains,
      includeChains,
      includeTheaters,
      includeLowPriority,
      onlySearchable,
      onlyPublishReady,
    };

    if (loadedLocations.length === 0) {
      if (!dryRun) {
        await supabase.from("cron_job_runs").insert({
          job_name: "nightly-photo-backfill",
          status: "success",
          finished_at: new Date().toISOString(),
          duration_ms: timer(),
          checked_count: 0,
          success_count: 0,
          skipped_count: 0,
          failed_count: 0,
          success_rate: null,
          metadata: optionMetadata,
        });
        await logEdgeFunctionRun(supabase, {
          function_name: "nightly-photo-backfill",
          status: "success",
          source,
          duration_ms: timer(),
          output_summary: {
            checked: 0,
            eligible: 0,
            updated: 0,
            skipped: 0,
            failed: 0,
          },
        });
      }
      return ok({
        success: true,
        checked: 0,
        eligible: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        skippedByReason: {},
        eligiblePreviewCount: 0,
        skippedPreviewCount: 0,
        message: "No missing-photo locations found.",
        ...(dryRun
          ? {
              dryRun,
              skipChains,
              includeChains,
              includeTheaters,
              includeLowPriority,
              onlySearchable,
              onlyPublishReady,
              locationsPreview,
              skippedPreview,
              debug: debugDetails,
            }
          : {}),
      });
    }

    const preLookupSkipped = selection.skipped;
    const checked = locations.length + preLookupSkipped;

    if (dryRun) {
      return ok({
        success: true,
        checked,
        eligible: locations.length,
        updated: 0,
        skipped: preLookupSkipped,
        failed: 0,
        skippedByReason: selection.skippedByReason,
        eligiblePreviewCount: locationsPreview.length,
        skippedPreviewCount: skippedPreview.length,
        dryRun,
        skipChains,
        includeChains,
        includeTheaters,
        includeLowPriority,
        onlySearchable,
        onlyPublishReady,
        locationsPreview,
        skippedPreview,
        wouldCheck: locations,
        debug: debugDetails,
      });
    }

    let updated = 0;
    let skipped = preLookupSkipped;
    let failed = 0;
    const skippedByReason = { ...selection.skippedByReason };

    for (const location of locations) {
      try {
        if (hasValidPhoto(location)) {
          skipped++;
          incrementReason(skippedByReason, "already_has_photo");
          if (skippedPreview.length < 10)
            skippedPreview.push(
              makeSkippedPreview(location, "already_has_photo"),
            );
          continue;
        }

        const photo = await findPhoto(location);
        if (photo.photoUrl) {
          const { error: updateError } = await supabase
            .from("locations")
            .update({
              image_url: photo.photoUrl,
              photo_url: photo.photoUrl,
              has_photos: true,
              photo_status: "has_photo",
              updated_at: new Date().toISOString(),
            })
            .eq("id", location.id);
          if (updateError) {
            failed++;
          } else {
            updated++;
          }
        } else {
          skipped++;
          incrementReason(
            skippedByReason,
            photo.reason ?? "photo_lookup_skipped",
          );
          if (skippedPreview.length < 10)
            skippedPreview.push(
              makeSkippedPreview(
                location,
                photo.reason ?? "photo_lookup_skipped",
              ),
            );
        }
      } catch {
        failed++;
      }
    }

    const eligible = locations.length;
    await supabase.from("cron_job_runs").insert({
      job_name: "nightly-photo-backfill",
      status: failed ? "partial" : "success",
      finished_at: new Date().toISOString(),
      duration_ms: timer(),
      checked_count: checked,
      success_count: updated,
      skipped_count: skipped,
      failed_count: failed,
      success_rate: checked ? updated / checked : null,
      metadata: optionMetadata,
    });
    await logEdgeFunctionRun(supabase, {
      function_name: "nightly-photo-backfill",
      status: "success",
      source,
      duration_ms: timer(),
      output_summary: { checked, eligible, updated, skipped, failed },
    });
    return ok({
      success: true,
      checked,
      eligible,
      updated,
      skipped,
      failed,
      skippedByReason,
      eligiblePreviewCount: locationsPreview.length,
      skippedPreviewCount: skippedPreview.length,
      dryRun,
      skipChains,
      includeChains,
      includeTheaters,
      includeLowPriority,
      onlySearchable,
      onlyPublishReady,
      locationsPreview,
      skippedPreview,
      googlePlacesAvailable: Boolean(Deno.env.get("GOOGLE_PLACES_API_KEY")),
    });
  } catch (error) {
    await logEdgeFunctionRun(supabase, {
      function_name: "nightly-photo-backfill",
      status: "error",
      source,
      error_message: safeError(error),
      duration_ms: timer(),
    });
    return serverError("nightly-photo-backfill failed", safeError(error));
  }
});
