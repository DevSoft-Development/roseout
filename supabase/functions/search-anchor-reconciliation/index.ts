import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

type JsonObject = Record<string, Json>;

type ReconciliationQueueRow = {
  id: string;
  location_id: string;
  event_type: string;
  reason_code: string;
  attempts: number;
  max_attempts: number;
  payload: JsonObject | null;
};

type ReconciliationSummary = {
  claimed: number;
  completed: number;
  failed: number;
  created: number;
  updated: number;
  unchanged: number;
  disabled: number;
  skipped: number;
  missing_locations: number;
  errors: Array<{
    queue_id: string;
    location_id: string;
    error: string;
  }>;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": [
    "authorization",
    "apikey",
    "content-type",
    "x-client-info",
    "x-worker-secret",
    "x-worker-job-id",
    "x-worker-job-type",
  ].join(", "),
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const WORKER_INTERNAL_SECRET = requireEnv("WORKER_INTERNAL_SECRET");

const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 250;
const DEFAULT_RETRY_MINUTES = 15;

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
);

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      {
        success: false,
        error: "Method not allowed",
      },
      405,
    );
  }

  if (!isAuthorized(request)) {
    return jsonResponse(
      {
        success: false,
        error: "Unauthorized",
      },
      401,
    );
  }

  const body = await readJsonBody(request);
  const batchSize = normalizeInteger(
    body.batchSize ?? body.batch_size ?? body.limit,
    DEFAULT_BATCH_SIZE,
    1,
    MAX_BATCH_SIZE,
  );

  const workerJobId = cleanString(
    body.worker_job_id ??
      request.headers.get("x-worker-job-id"),
  );

  const workerName = workerJobId
    ? `search-anchor-reconciliation:${workerJobId}`
    : `search-anchor-reconciliation:${crypto.randomUUID()}`;

  try {
    await releaseStaleLocks();

    const queueRows = await claimReconciliationBatch(
      batchSize,
      workerName,
    );

    const summary: ReconciliationSummary = {
      claimed: queueRows.length,
      completed: 0,
      failed: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      disabled: 0,
      skipped: 0,
      missing_locations: 0,
      errors: [],
    };

    for (const queueRow of queueRows) {
      try {
        const result = await reconcileQueueRow(queueRow);

        summary.created += result.created;
        summary.updated += result.updated;
        summary.unchanged += result.unchanged;
        summary.disabled += result.disabled;
        summary.skipped += result.skipped;
        summary.missing_locations += result.missing_locations;

        await completeQueueRow(queueRow.id, {
          worker_job_id: workerJobId || null,
          reconciliation_result: result,
          completed_at: new Date().toISOString(),
        });

        summary.completed += 1;
      } catch (error) {
        const message = errorMessage(error);

        await failQueueRow(
          queueRow.id,
          message,
          retryDelayMinutes(queueRow.attempts),
        );

        summary.failed += 1;
        summary.errors.push({
          queue_id: queueRow.id,
          location_id: queueRow.location_id,
          error: message,
        });
      }
    }

    return jsonResponse({
      success: true,
      worker: workerName,
      worker_job_id: workerJobId || null,
      ...summary,
    });
  } catch (error) {
    const message = errorMessage(error);

    console.error("search-anchor-reconciliation failed", {
      worker: workerName,
      worker_job_id: workerJobId || null,
      error: message,
    });

    return jsonResponse(
      {
        success: false,
        worker: workerName,
        worker_job_id: workerJobId || null,
        error: message,
      },
      500,
    );
  }
});

async function claimReconciliationBatch(
  limit: number,
  workerName: string,
): Promise<ReconciliationQueueRow[]> {
  const { data, error } = await supabase.rpc(
    "claim_search_anchor_reconciliation_batch",
    {
      p_limit: limit,
      p_worker: workerName,
    },
  );

  if (error) {
    throw new Error(
      `Unable to claim search-anchor reconciliation rows: ${error.message}`,
    );
  }

  return Array.isArray(data)
    ? data as ReconciliationQueueRow[]
    : [];
}

async function releaseStaleLocks(): Promise<void> {
  const { error } = await supabase.rpc(
    "release_stale_search_anchor_reconciliation_locks",
    {
      p_stale_minutes: 15,
    },
  );

  if (error) {
    throw new Error(
      `Unable to release stale reconciliation locks: ${error.message}`,
    );
  }
}

async function completeQueueRow(
  queueId: string,
  payload: JsonObject,
): Promise<void> {
  const { data, error } = await supabase.rpc(
    "complete_search_anchor_reconciliation",
    {
      p_queue_id: queueId,
      p_payload: payload,
    },
  );

  if (error) {
    throw new Error(
      `Unable to complete reconciliation row ${queueId}: ${error.message}`,
    );
  }

  if (data !== true) {
    throw new Error(
      `Reconciliation row ${queueId} was not completed`,
    );
  }
}

async function failQueueRow(
  queueId: string,
  message: string,
  retryMinutes: number,
): Promise<void> {
  const { error } = await supabase.rpc(
    "fail_search_anchor_reconciliation",
    {
      p_queue_id: queueId,
      p_error: message,
      p_retry_minutes: retryMinutes,
    },
  );

  if (error) {
    console.error("Unable to mark reconciliation row failed", {
      queue_id: queueId,
      original_error: message,
      failure_rpc_error: error.message,
    });
  }
}

async function reconcileQueueRow(
  queueRow: ReconciliationQueueRow,
): Promise<{
  created: number;
  updated: number;
  unchanged: number;
  disabled: number;
  skipped: number;
  missing_locations: number;
}> {
  const result = {
    created: 0,
    updated: 0,
    unchanged: 0,
    disabled: 0,
    skipped: 0,
    missing_locations: 0,
  };

  const { data: location, error: locationError } = await supabase
    .from("locations")
    .select("*")
    .eq("id", queueRow.location_id)
    .maybeSingle();

  if (locationError) {
    throw new Error(
      `Unable to load location ${queueRow.location_id}: ${locationError.message}`,
    );
  }

  const existing = await findExistingAnchor(
    queueRow.location_id,
  );

  if (!location || queueRow.event_type === "delete") {
    result.missing_locations += 1;

    if (existing) {
      await disableAnchor(
        existing.id,
        "linked_location_missing",
      );
      result.disabled += 1;
    } else {
      result.skipped += 1;
    }

    return result;
  }

  if (!isEligibleApprovedAnchorLocation(location)) {
    result.skipped += 1;

    if (
      existing &&
      (
        existing.is_active === true ||
        existing.is_searchable === true ||
        existing.review_status !== "disabled" ||
        existing.sync_status !== "disabled_source"
      )
    ) {
      await disableAnchor(
        existing.id,
        "linked_location_not_publishable",
      );
      result.disabled += 1;
    }

    return result;
  }

  const name = locationDisplayName(location);
  const anchorType = inferAnchorTypeFromLocation(location);
  const radiusPolicy = inferRadiusPolicyFromLocation(
    location,
    anchorType,
  );
  const metadata = metadataWithAliases(
    existing,
    existing &&
        normalizeAnchorText(existing.canonical_name) !==
          normalizeAnchorText(name)
      ? cleanString(existing.canonical_name)
      : "",
    name,
  );

  const manualOverrideFields = new Set<string>(
    normalizeStringArray(
      existing?.manual_override_fields ??
        existing?.metadata?.manual_override_fields,
    ),
  );

  const anchorRow: Record<string, unknown> = {
    canonical_name: name,
    normalized_name: normalizeAnchorText(name),
    aliases: aliasesFromMetadata(metadata, name),
    anchor_type: anchorType,
    source_type: "linked_location",
    linked_location_id: location.id,
    city: nullableString(location.city),
    state: nullableString(location.state),
    borough: nullableString(location.borough),
    neighborhood: nullableString(location.neighborhood),
    county: nullableString(location.county),
    market: nullableString(location.market),
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
    default_radius_miles: manualOverrideFields.has("radius") &&
        existing
      ? existing.default_radius_miles
      : radiusPolicy.defaultRadiusMiles,
    max_radius_miles: manualOverrideFields.has("radius") &&
        existing
      ? existing.max_radius_miles
      : radiusPolicy.maxRadiusMiles,
    radius_strategy: manualOverrideFields.has("radius") &&
        existing
      ? existing.radius_strategy
      : radiusPolicy.radiusStrategy,
    is_active: true,
    is_searchable: true,
    review_status: "approved",
    sync_status: "current",
    last_synced_at: new Date().toISOString(),
    source_updated_at: location.updated_at ?? null,
    metadata,
  };

  if (existing) {
    if (!hasMeaningfulChanges(existing, anchorRow)) {
      result.unchanged += 1;
      return result;
    }

    const { error } = await supabase
      .from("search_anchors")
      .update(anchorRow)
      .eq("id", existing.id);

    if (error) {
      throw new Error(
        `Unable to update search anchor ${existing.id}: ${error.message}`,
      );
    }

    result.updated += 1;
    return result;
  }

  const { error } = await supabase
    .from("search_anchors")
    .insert(anchorRow);

  if (error) {
    throw new Error(
      `Unable to create search anchor for location ${location.id}: ${error.message}`,
    );
  }

  result.created += 1;
  return result;
}

async function findExistingAnchor(
  locationId: string,
): Promise<Record<string, any> | null> {
  const { data, error } = await supabase
    .from("search_anchors")
    .select("*")
    .eq("linked_location_id", locationId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Unable to load linked search anchor for ${locationId}: ${error.message}`,
    );
  }

  return data ?? null;
}

async function disableAnchor(
  anchorId: string,
  reason: string,
): Promise<void> {
  const now = new Date().toISOString();

  const { data: anchor, error: readError } = await supabase
    .from("search_anchors")
    .select("metadata")
    .eq("id", anchorId)
    .maybeSingle();

  if (readError) {
    throw new Error(
      `Unable to read search anchor ${anchorId}: ${readError.message}`,
    );
  }

  const metadata = isPlainObject(anchor?.metadata)
    ? { ...anchor.metadata }
    : {};

  const { error } = await supabase
    .from("search_anchors")
    .update({
      is_active: false,
      is_searchable: false,
      review_status: "disabled",
      sync_status: "disabled_source",
      last_synced_at: now,
      metadata: {
        ...metadata,
        disabled_reason: reason,
        disabled_at: now,
      },
    })
    .eq("id", anchorId);

  if (error) {
    throw new Error(
      `Unable to disable search anchor ${anchorId}: ${error.message}`,
    );
  }
}

function locationDisplayName(location: Record<string, any>): string {
  return cleanString(
    location.name ??
      location.restaurant_name ??
      location.activity_name,
  );
}

function isEligibleApprovedAnchorLocation(
  location: Record<string, any>,
): boolean {
  const name = locationDisplayName(location);
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  const status = cleanString(
    location.status ??
      location.data_status ??
      location.quality_status,
  ).toLowerCase();
  const visibility = cleanString(
    location.public_visibility_tier,
  ).toLowerCase();
  const sourceQuality = cleanString(
    location.source_quality_status ??
      location.quality_status,
  ).toLowerCase();

  return Boolean(
    name &&
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      location.is_searchable === true &&
      location.is_hidden !== true &&
      location.deleted_at == null &&
      location.is_deleted !== true &&
      location.demo_only !== true &&
      location.is_demo_only !== true &&
      location.training_only !== true &&
      location.is_training_only !== true &&
      location.is_suppressed !== true &&
      location.suppressed !== true &&
      location.is_low_level !== true &&
      visibility !== "hidden" &&
      ![
        "closed",
        "archived",
        "deleted",
        "duplicate",
        "rejected",
      ].includes(status) &&
      ![
        "low_level_review",
        "suppressed",
        "generic_restaurant",
      ].includes(sourceQuality)
  );
}

function inferAnchorTypeFromLocation(
  location: Record<string, any>,
): string {
  const haystack = normalizeAnchorText(
    [
      location.location_type,
      location.primary_category,
      location.category,
      location.activity_type,
      location.cuisine_type,
      ...normalizeStringArray(location.tags),
    ]
      .flat()
      .filter(Boolean)
      .join(" "),
  );

  if (/transit|station|terminal|train|bus/.test(haystack)) {
    return "transit_hub";
  }
  if (/beach/.test(haystack)) return "beach";
  if (/hotel/.test(haystack)) return "hotel";
  if (/universit|college/.test(haystack)) return "university";
  if (/theater|theatre|cinema|perform/.test(haystack)) {
    return "theater";
  }
  if (/stadium|ballpark|field/.test(haystack)) return "stadium";
  if (/arena/.test(haystack)) return "arena";
  if (/mall|shopping/.test(haystack)) return "mall";
  if (/museum|gallery/.test(haystack)) return "museum";
  if (/park/.test(haystack)) return "park";
  if (
    /arcade|bowling|escape room|nightclub|lounge|karaoke|activity|entertainment|game/
      .test(haystack)
  ) {
    return "activity";
  }
  if (
    /restaurant|cafe|coffee|bakery|dessert|dining|food|bar|seafood|sushi/
      .test(haystack) ||
    Boolean(location.restaurant_name)
  ) {
    return "restaurant";
  }
  if (location.activity_name) return "activity";
  return "attraction";
}

function inferRadiusPolicyFromLocation(
  location: Record<string, any>,
  anchorType: string,
): {
  defaultRadiusMiles: number;
  maxRadiusMiles: number;
  radiusStrategy: string;
} {
  const market = cleanString(location.market).toUpperCase();

  if (anchorType === "beach") {
    return {
      defaultRadiusMiles: 4,
      maxRadiusMiles: 10,
      radiusStrategy: "beach",
    };
  }
  if (market.includes("LONG_ISLAND")) {
    return {
      defaultRadiusMiles: 3,
      maxRadiusMiles: 8,
      radiusStrategy: "long_island",
    };
  }
  if (anchorType === "mall") {
    return {
      defaultRadiusMiles: 2.5,
      maxRadiusMiles: 6,
      radiusStrategy: "mall",
    };
  }
  if (anchorType === "stadium" || anchorType === "arena") {
    return {
      defaultRadiusMiles: 2,
      maxRadiusMiles: 5,
      radiusStrategy: "stadium",
    };
  }
  if (anchorType === "park") {
    return {
      defaultRadiusMiles: 2,
      maxRadiusMiles: 5,
      radiusStrategy: "large_park",
    };
  }
  if (anchorType === "transit_hub") {
    return {
      defaultRadiusMiles: 1,
      maxRadiusMiles: 2,
      radiusStrategy: "transit",
    };
  }

  return {
    defaultRadiusMiles: 1.5,
    maxRadiusMiles: 3,
    radiusStrategy: "dense_urban",
  };
}

function metadataWithAliases(
  existing: Record<string, any> | null,
  previousName: string,
  currentName: string,
): JsonObject {
  const existingMetadata = isPlainObject(existing?.metadata)
    ? existing.metadata
    : {};

  const manualAliases = normalizeAliasList(
    existingMetadata.manual_aliases ??
      existing?.aliases ??
      [],
  );
  const generatedAliases = normalizeAliasList(
    existingMetadata.generated_aliases ?? [],
  );

  if (previousName) {
    const normalizedPrevious = normalizeAnchorText(previousName);
    const normalizedCurrent = normalizeAnchorText(currentName);

    if (
      normalizedPrevious &&
      normalizedPrevious !== normalizedCurrent &&
      !generatedAliases.includes(normalizedPrevious)
    ) {
      generatedAliases.push(normalizedPrevious);
    }
  }

  return {
    ...toJsonObject(existingMetadata),
    manual_aliases: manualAliases,
    generated_aliases: generatedAliases,
    last_synced_at: new Date().toISOString(),
  };
}

function aliasesFromMetadata(
  metadata: JsonObject,
  canonicalName: string,
): string[] {
  const canonical = normalizeAnchorText(canonicalName);
  const seen = new Set<string>();

  return [
    ...normalizeStringArray(metadata.manual_aliases),
    ...normalizeStringArray(metadata.generated_aliases),
  ].filter((alias) => {
    const normalized = normalizeAnchorText(alias);

    if (
      !normalized ||
      normalized === canonical ||
      seen.has(normalized) ||
      /^(restaurant|arcade|bar|activity|museum|lounge)$/i.test(alias)
    ) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}

function normalizeAliasList(value: unknown): string[] {
  const seen = new Set<string>();

  return normalizeStringArray(value).filter((alias) => {
    const normalized = normalizeAnchorText(alias);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function normalizeAnchorText(value: unknown): string {
  return cleanString(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function hasMeaningfulChanges(
  existing: Record<string, any>,
  next: Record<string, unknown>,
): boolean {
  return Object.entries(next).some(([key, value]) =>
    stableStringify(existing[key]) !== stableStringify(value)
  );
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }

  if (isPlainObject(value)) {
    const sorted = Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nestedValue]) => [
          key,
          isPlainObject(nestedValue)
            ? JSON.parse(stableStringify(nestedValue))
            : nestedValue,
        ]),
    );

    return JSON.stringify(sorted);
  }

  return JSON.stringify(value);
}

function retryDelayMinutes(attempts: number): number {
  const safeAttempts = Number.isFinite(attempts)
    ? Math.max(1, Math.trunc(attempts))
    : 1;

  return Math.min(
    1440,
    DEFAULT_RETRY_MINUTES * Math.pow(2, safeAttempts - 1),
  );
}

function isAuthorized(request: Request): boolean {
  const suppliedSecret = request.headers
    .get("x-worker-secret")
    ?.trim();

  return Boolean(
    suppliedSecret &&
      timingSafeEqual(
        suppliedSecret,
        WORKER_INTERNAL_SECRET,
      ),
  );
}

function timingSafeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);

  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }

  return difference === 0;
}

async function readJsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  try {
    const parsed = await request.json();
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(
    minimum,
    Math.min(maximum, Math.trunc(numeric)),
  );
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => cleanString(item))
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function nullableString(value: unknown): string | null {
  const cleaned = cleanString(value);
  return cleaned || null;
}

function cleanString(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : value == null
    ? ""
    : String(value).trim();
}

function isPlainObject(
  value: unknown,
): value is Record<string, any> {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value),
  );
}

function toJsonObject(
  value: Record<string, unknown>,
): JsonObject {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      toJson(item),
    ]),
  );
}

function toJson(value: unknown): Json {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(toJson);
  }

  if (isPlainObject(value)) {
    return toJsonObject(value);
  }

  return String(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : typeof error === "string"
    ? error
    : "Unknown error";
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function jsonResponse(
  payload: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(
    JSON.stringify(payload),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    },
  );
}
