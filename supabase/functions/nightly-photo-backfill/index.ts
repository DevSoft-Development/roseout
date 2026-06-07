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
type SupabaseClient = ReturnType<typeof createClient>;
type PostgrestError = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
};
type User = {
  id: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
};
type SkippedPreviewItem = {
  id: unknown;
  name: string;
  reason: string;
  googleName?: string | null;
  googleAddress?: string | null;
  nameScore?: number;
  localStreetNumber?: string | null;
  googleStreetNumber?: string | null;
  matchReason?: string;
};
type LocationPreviewItem = LocationRow & { eligibility_reasons: string[] };
type GooglePhotoFoundResult = {
  found: true;
  placeId: string;
  photoReference: string;
  googleName: string | null;
  googleAddress: string | null;
};
type GooglePhotoNotFoundResult = { found: false; reason: string };
type GooglePhotoResult = GooglePhotoFoundResult | GooglePhotoNotFoundResult;
type UpdateLocationPhotoResult = {
  success: boolean;
  error?: PostgrestError | null;
  fallbackUsed?: boolean;
};
type GoogleMatchResult = {
  ok: boolean;
  reason: string;
  nameScore: number;
  localStreetNumber: string | null;
  googleStreetNumber: string | null;
};
type UpdatedPreviewItem = {
  id: unknown;
  name: string;
  googleName: string | null;
  googleAddress: string | null;
  nameScore: number;
  matchScore: number;
  localStreetNumber: string | null;
  googleStreetNumber: string | null;
};
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

function normalizeForMatch(value: unknown): string {
  const text = String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";

  const businessSuffixes = new Set([
    "inc",
    "incorporated",
    "llc",
    "corp",
    "corporation",
    "co",
    "company",
    "ltd",
    "limited",
  ]);
  return text
    .split(" ")
    .filter((word) => !businessSuffixes.has(word))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(value: unknown): Set<string> {
  const ignoredWords = new Set([
    "the",
    "and",
    "of",
    "restaurant",
    "kitchen",
    "cuisine",
    "cafe",
    "bar",
    "grill",
    "bakery",
    "deli",
    "pizza",
    "inc",
    "llc",
  ]);
  const normalized = normalizeForMatch(value);
  if (!normalized) return new Set();
  return new Set(
    normalized
      .split(" ")
      .map((word) => word.trim())
      .filter((word) => word.length > 2 && !ignoredWords.has(word)),
  );
}

function tokenOverlapScore(a: unknown, b: unknown): number {
  const aTokens = tokenSet(a);
  const bTokens = tokenSet(b);
  if (!aTokens.size || !bTokens.size) return 0;

  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1;
  }

  return overlap / Math.max(aTokens.size, bTokens.size);
}

function extractStreetNumber(address: unknown): string | null {
  const match = String(address ?? "").match(/\d+/);
  return match?.[0] ?? null;
}

function hasStrongCityOrBoroughMatch(
  location: LocationRow,
  googleAddress: string | null,
): boolean {
  const googleText = normalizeForMatch(googleAddress);
  if (!googleText) return false;

  const localCity = normalizeForMatch(location.city);
  if (localCity && googleText.includes(localCity)) return true;

  const localAddress = normalizeForMatch(location.address);
  const boroughs = [
    "brooklyn",
    "manhattan",
    "queens",
    "bronx",
    "staten island",
    "new york",
  ];
  return boroughs.some(
    (borough) =>
      (localCity === borough || localAddress.includes(borough)) &&
      googleText.includes(borough),
  );
}

function isLikelyGoogleMatch(
  location: LocationRow,
  googleResult: GooglePhotoFoundResult,
): GoogleMatchResult {
  const localName = locationDisplayName(location);
  const googleName = googleResult.googleName;
  const localAddress = location.address;
  const googleAddress = googleResult.googleAddress;
  const nameScore = tokenOverlapScore(localName, googleName);
  const localStreetNumber = extractStreetNumber(localAddress);
  const googleStreetNumber = extractStreetNumber(googleAddress);
  const streetNumberMatches = Boolean(
    localStreetNumber &&
      googleStreetNumber &&
      localStreetNumber === googleStreetNumber,
  );

  if (
    localStreetNumber &&
    googleStreetNumber &&
    localStreetNumber !== googleStreetNumber
  ) {
    if (
      nameScore >= 0.9 &&
      hasStrongCityOrBoroughMatch(location, googleAddress)
    ) {
      return {
        ok: true,
        reason: "street_number_mismatch_allowed_by_strong_name_city_match",
        nameScore,
        localStreetNumber,
        googleStreetNumber,
      };
    }

    return {
      ok: false,
      reason: "street_number_mismatch",
      nameScore,
      localStreetNumber,
      googleStreetNumber,
    };
  }

  if (nameScore < 0.35) {
    return {
      ok: false,
      reason: "name_score_below_minimum",
      nameScore,
      localStreetNumber,
      googleStreetNumber,
    };
  }

  if (streetNumberMatches) {
    return {
      ok: nameScore >= 0.25,
      reason: nameScore >= 0.25
        ? "street_number_and_name_match"
        : "street_number_match_name_score_too_low",
      nameScore,
      localStreetNumber,
      googleStreetNumber,
    };
  }

  return {
    ok: nameScore >= 0.6,
    reason: nameScore >= 0.6
      ? "name_match_without_street_numbers"
      : "missing_street_number_name_score_too_low",
    nameScore,
    localStreetNumber,
    googleStreetNumber,
  };
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildGoogleSearchQuery(location: LocationRow): string {
  return [
    location.name || location.restaurant_name || location.activity_name,
    location.address,
    location.city,
    location.state,
    location.zip_code,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

async function findGooglePlacePhoto(
  location: LocationRow,
  googleKey: string,
): Promise<GooglePhotoResult> {
  const query = buildGoogleSearchQuery(location);
  if (!query) return { found: false, reason: "empty_google_query" };

  const url = new URL(
    "https://maps.googleapis.com/maps/api/place/textsearch/json",
  );
  url.searchParams.set("query", query);
  url.searchParams.set("key", googleKey);

  const response = await fetch(url);
  if (!response.ok) return { found: false, reason: `http_${response.status}` };

  const payload = await response.json();
  const status = String(payload?.status ?? "UNKNOWN");

  if (status === "ZERO_RESULTS") {
    return { found: false, reason: "zero_results" };
  }
  if (status === "REQUEST_DENIED") {
    throw new Error(
      `Google Places request denied: ${String(
        payload?.error_message ?? "No error message returned",
      )}`,
    );
  }
  if (status === "OVER_QUERY_LIMIT") {
    return { found: false, reason: "over_query_limit" };
  }
  if (status !== "OK") {
    return { found: false, reason: `google_status_${status}` };
  }

  const results = Array.isArray(payload?.results) ? payload.results : [];
  for (const result of results) {
    const placeId = String(result?.place_id ?? "").trim();
    const photoReference = String(
      result?.photos?.[0]?.photo_reference ?? "",
    ).trim();
    if (placeId && photoReference) {
      return {
        found: true,
        placeId,
        photoReference,
        googleName: result?.name ? String(result.name) : null,
        googleAddress: result?.formatted_address
          ? String(result.formatted_address)
          : null,
      };
    }
  }

  return { found: false, reason: "no_photo_reference" };
}

function buildGooglePhotoUrl(photoReference: string, googleKey: string): string {
  const url = new URL("https://maps.googleapis.com/maps/api/place/photo");
  url.searchParams.set("maxwidth", "1200");
  url.searchParams.set("photo_reference", photoReference);
  url.searchParams.set("key", googleKey);
  return url.toString();
}

function isMissingColumnError(error: PostgrestError | null): boolean {
  if (!error) return false;
  const text = [error.message, error.details, error.hint, error.code]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    error.code === "PGRST204" ||
    text.includes("column") ||
    text.includes("schema cache") ||
    text.includes("could not find")
  );
}

async function updateLocationPhoto(
  supabase: SupabaseClient,
  location: LocationRow,
  photoUrl: string,
  placeId: string,
): Promise<UpdateLocationPhotoResult> {
  const preferredUpdate = {
    image_url: photoUrl,
    photo_url: photoUrl,
    google_place_id: placeId,
    has_photos: true,
    photo_status: "has_photo",
    updated_at: new Date().toISOString(),
  };

  const preferredResult = await supabase
    .from("locations")
    .update(preferredUpdate)
    .eq("id", location.id);

  if (!preferredResult.error) return { success: true, fallbackUsed: false };
  if (!isMissingColumnError(preferredResult.error)) {
    return { success: false, error: preferredResult.error, fallbackUsed: false };
  }

  const minimalResult = await supabase
    .from("locations")
    .update({
      image_url: photoUrl,
      has_photos: true,
      photo_status: "has_photo",
    })
    .eq("id", location.id);

  if (minimalResult.error) {
    return { success: false, error: minimalResult.error, fallbackUsed: true };
  }

  return { success: true, fallbackUsed: true };
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
      await logCronJobRun(supabase, {
        job_name: "nightly-photo-backfill",
        function_name: "nightly-photo-backfill",
        source,
        status: "failed",
        started_at: new Date(startedAt).toISOString(),
        finished_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
        failed_count: 1,
        error_message: locationsError.message,
        metadata: { stage: "load_locations" },
      });
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
        await logCronJobRun(supabase, {
          job_name: "nightly-photo-backfill",
          function_name: "nightly-photo-backfill",
          source,
          status: "success",
          started_at: new Date(startedAt).toISOString(),
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
            googleChecked: 0,
            googleMatched: 0,
            googleNoPhoto: 0,
            googleRejected: 0,
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
        message: dryRun
          ? "Dry run completed. No database updates were made."
          : "Photo backfill completed.",
        googleChecked: 0,
        googleMatched: 0,
        googleNoPhoto: 0,
        googleRejected: 0,
        locationsPreview,
        skippedPreview,
        updatedPreview: [],
        debug: { locationsPreview, skippedPreview, updatedPreview: [] },
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
        googleChecked: 0,
        googleMatched: 0,
        googleNoPhoto: 0,
        googleRejected: 0,
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
        debug: {
          ...debugDetails,
          locationsPreview,
          skippedPreview,
          updatedPreview: [],
        },
        message: "Dry run completed. No database updates were made.",
      });
    }

    const googleKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
    if (!googleKey) {
      const missingKeySkippedByReason = { ...selection.skippedByReason };
      for (const location of locations) {
        incrementReason(missingKeySkippedByReason, "missing_google_places_key");
        if (skippedPreview.length < 10) {
          skippedPreview.push(
            makeSkippedPreview(location, "missing_google_places_key"),
          );
        }
      }

      const skipped = preLookupSkipped + locations.length;
      const eligible = locations.length;
      await logCronJobRun(supabase, {
        job_name: "nightly-photo-backfill",
        function_name: "nightly-photo-backfill",
        source,
        status: "success",
        started_at: new Date(startedAt).toISOString(),
        finished_at: new Date().toISOString(),
        duration_ms: timer(),
        checked_count: checked,
        success_count: 0,
        skipped_count: skipped,
        failed_count: 0,
        success_rate: checked ? 0 : null,
        metadata: {
          ...optionMetadata,
          skippedByReason: missingKeySkippedByReason,
          googlePlacesAvailable: false,
        },
      });
      await logEdgeFunctionRun(supabase, {
        function_name: "nightly-photo-backfill",
        status: "success",
        source,
        duration_ms: timer(),
        output_summary: {
          checked,
          eligible,
          googleChecked: 0,
          googleMatched: 0,
          googleNoPhoto: eligible,
          googleRejected: 0,
          updated: 0,
          skipped,
          failed: 0,
        },
      });

      return ok({
        success: true,
        checked,
        eligible,
        googleChecked: 0,
        googleMatched: 0,
        googleNoPhoto: eligible,
        googleRejected: 0,
        updated: 0,
        skipped,
        failed: 0,
        skippedByReason: missingKeySkippedByReason,
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
        updatedPreview: [],
        debug: { locationsPreview, skippedPreview, updatedPreview: [] },
        googlePlacesAvailable: false,
        message: "Photo backfill completed.",
      });
    }

    let updated = 0;
    let skipped = preLookupSkipped;
    let failed = 0;
    let googleChecked = 0;
    let googleMatched = 0;
    let googleNoPhoto = 0;
    let googleRejected = 0;
    const skippedByReason = { ...selection.skippedByReason };
    const updatedPreview: UpdatedPreviewItem[] = [];

    for (let index = 0; index < locations.length; index++) {
      const location = locations[index];
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

        googleChecked += 1;
        const photo = await findGooglePlacePhoto(location, googleKey);
        if (index < locations.length - 1) await sleep(150);

        if (!photo.found) {
          skipped += 1;
          googleNoPhoto += 1;
          incrementReason(skippedByReason, photo.reason);
          if (skippedPreview.length < 10)
            skippedPreview.push(makeSkippedPreview(location, photo.reason));
          continue;
        }

        const match = isLikelyGoogleMatch(location, photo);
        if (!match.ok) {
          skipped += 1;
          googleRejected += 1;
          incrementReason(skippedByReason, "google_match_rejected");
          if (skippedPreview.length < 10) {
            skippedPreview.push({
              ...makeSkippedPreview(location, "google_match_rejected"),
              googleName: photo.googleName,
              googleAddress: photo.googleAddress,
              nameScore: match.nameScore,
              localStreetNumber: match.localStreetNumber,
              googleStreetNumber: match.googleStreetNumber,
              matchReason: match.reason,
            });
          }
          continue;
        }

        const photoUrl = buildGooglePhotoUrl(photo.photoReference, googleKey);
        const updateResult = await updateLocationPhoto(
          supabase,
          location,
          photoUrl,
          photo.placeId,
        );

        if (updateResult.success) {
          updated += 1;
          googleMatched += 1;
          if (updatedPreview.length < 10) {
            updatedPreview.push({
              id: location.id ?? null,
              name: locationDisplayName(location),
              googleName: photo.googleName,
              googleAddress: photo.googleAddress,
              nameScore: match.nameScore,
              matchScore: match.nameScore,
              localStreetNumber: match.localStreetNumber,
              googleStreetNumber: match.googleStreetNumber,
            });
          }
        } else {
          failed += 1;
          incrementReason(skippedByReason, "update_failed");
          console.warn(
            "[nightly-photo-backfill] update failed",
            location.id,
            updateResult.error?.message,
          );
        }
      } catch (error) {
        const errorMessage = safeError(error);
        if (errorMessage.includes("Google Places request denied")) throw error;
        failed += 1;
        incrementReason(skippedByReason, "google_request_failed");
        console.warn(
          "[nightly-photo-backfill] google request failed",
          location.id,
          errorMessage,
        );
      }
    }

    const eligible = locations.length;
    await logCronJobRun(supabase, {
      job_name: "nightly-photo-backfill",
      function_name: "nightly-photo-backfill",
      source,
      status: failed ? "warning" : "success",
      started_at: new Date(startedAt).toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: timer(),
      checked_count: checked,
      success_count: updated,
      skipped_count: skipped,
      failed_count: failed,
      success_rate: checked ? updated / checked : null,
      metadata: {
        ...optionMetadata,
        googleChecked,
        googleMatched,
        googleNoPhoto,
        googleRejected,
        skippedByReason,
      },
    });
    await logEdgeFunctionRun(supabase, {
      function_name: "nightly-photo-backfill",
      status: "success",
      source,
      duration_ms: timer(),
      output_summary: {
        checked,
        eligible,
        googleChecked,
        googleMatched,
        googleNoPhoto,
        googleRejected,
        updated,
        skipped,
        failed,
      },
    });
    return ok({
      success: true,
      checked,
      eligible,
      googleChecked,
      googleMatched,
      googleNoPhoto,
      googleRejected,
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
      updatedPreview,
      debug: { locationsPreview, skippedPreview, updatedPreview },
      googlePlacesAvailable: Boolean(Deno.env.get("GOOGLE_PLACES_API_KEY")),
      message: "Photo backfill completed.",
    });
  } catch (error) {
    await logCronJobRun(supabase, {
      job_name: "nightly-photo-backfill",
      function_name: "nightly-photo-backfill",
      source,
      status: "failed",
      started_at: new Date(startedAt).toISOString(),
      finished_at: new Date().toISOString(),
      duration_ms: timer(),
      failed_count: 1,
      error_message: safeError(error),
    });
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
