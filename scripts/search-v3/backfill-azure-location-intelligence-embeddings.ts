import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const EAST_REF = "ftdsltatyqhtllyyefzp";
const SUPABASE_URL = String(
  process.env.SUPABASE_URL || `https://${EAST_REF}.supabase.co`,
).replace(/\/$/, "");
const SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const AZURE_AI_ENDPOINT = String(process.env.AZURE_AI_ENDPOINT || "").replace(/\/$/, "");
const AZURE_AI_API_KEY = String(process.env.AZURE_AI_API_KEY || "");
const AZURE_DEPLOYMENT = String(process.env.AZURE_AI_EMBEDDING_MODEL || "toh-embedding");
const VECTOR_MODEL = String(process.env.SEARCH_EMBEDDING_MODEL || "text-embedding-3-small");
const EMBEDDING_VERSION = String(
  process.env.SEARCH_LOCATION_INTELLIGENCE_EMBEDDING_VERSION ||
    "azure-location-intelligence:v1",
);
const DOCUMENT_VERSION = "location-intelligence-document:v1";
const VECTOR_DIMENSIONS = 1536;
const PAGE_SIZE = clamp(Number(process.env.SEARCH_EMBEDDING_PAGE_SIZE || 500), 100, 1000);
const BATCH_SIZE = clamp(Number(process.env.SEARCH_EMBEDDING_BATCH_SIZE || 64), 1, 64);
const RESUME_TAIL_BATCH_SIZE = clamp(
  Number(process.env.SEARCH_EMBEDDING_RESUME_TAIL_BATCH_SIZE || 8),
  1,
  64,
);
const RESUME_TAIL_THRESHOLD = clamp(
  Number(process.env.SEARCH_EMBEDDING_RESUME_TAIL_THRESHOLD || 128),
  1,
  1000,
);
const MAX_RETRIES = clamp(Number(process.env.SEARCH_EMBEDDING_MAX_RETRIES || 6), 1, 8);
const MIN_REQUEST_INTERVAL_MS = clamp(
  Number(process.env.SEARCH_EMBEDDING_MIN_REQUEST_INTERVAL_MS || 65_000),
  0,
  120_000,
);
const RETRY_SAFETY_BUFFER_MS = clamp(
  Number(process.env.SEARCH_EMBEDDING_RETRY_SAFETY_BUFFER_MS || 5_000),
  0,
  30_000,
);
let lastAzureRequestStartedAt = 0;

if (!SUPABASE_URL.includes(EAST_REF)) {
  throw new Error(`Location-intelligence backfill is East-primary only; refusing ${SUPABASE_URL}`);
}
if (!SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required.");
if (!AZURE_AI_ENDPOINT) throw new Error("AZURE_AI_ENDPOINT is required.");
if (!AZURE_AI_API_KEY) throw new Error("AZURE_AI_API_KEY is required.");
if (VECTOR_MODEL !== "text-embedding-3-small") {
  throw new Error(`Unsupported vector model ${VECTOR_MODEL}; expected text-embedding-3-small.`);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type LocationRow = {
  id: string;
  name: string | null;
  restaurant_name: string | null;
  activity_name: string | null;
  business_name: string | null;
  description: string | null;
  neighborhood: string | null;
  borough: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  market: string | null;
  rating: number | null;
  review_count: number | null;
  is_searchable: boolean | null;
  is_hidden: boolean | null;
  active: boolean | null;
  deleted_at: string | null;
  status: string | null;
  duplicate_status: string | null;
};

type ProfileRow = {
  location_id: string;
  primary_domain: string | null;
  supported_domains: string[] | null;
  restaurant_categories: string[] | null;
  activity_categories: string[] | null;
  nightlife_categories: string[] | null;
  cuisines: string[] | null;
  foods: string[] | null;
  meal_periods: string[] | null;
  features: string[] | null;
  vibes: string[] | null;
  occasions: string[] | null;
  audiences: string[] | null;
  canonical_terms: string[] | null;
  market: string | null;
  neighborhood: string | null;
  borough: string | null;
  city: string | null;
  state: string | null;
};

type ExistingEmbedding = {
  location_id: string;
  embedding_version: string | null;
  semantic_document_hash: string | null;
  status: string | null;
};

type DocumentRow = {
  locationId: string;
  canonicalType: "restaurant" | "activity" | "hybrid";
  marketKey: string | null;
  document: string;
  hash: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function clean(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function uniq(values: readonly unknown[] | null | undefined) {
  return [...new Set((values ?? []).map(clean).filter(Boolean))];
}

function add(lines: string[], label: string, value: unknown) {
  const text = Array.isArray(value) ? uniq(value).join(", ") : clean(value);
  if (text) lines.push(`${label}: ${text}`);
}

function eligible(location: LocationRow) {
  const status = clean(location.status).toLowerCase();
  const duplicate = clean(location.duplicate_status).toLowerCase();
  return (
    location.is_searchable !== false &&
    location.is_hidden !== true &&
    location.active !== false &&
    location.deleted_at == null &&
    !["closed", "permanently_closed", "archived", "deleted", "hidden"].includes(status) &&
    !["duplicate", "secondary", "merged"].includes(duplicate)
  );
}

function canonicalType(profile: ProfileRow): "restaurant" | "activity" | "hybrid" {
  const domains = new Set(
    [profile.primary_domain, ...(profile.supported_domains ?? [])]
      .map((value) => clean(value).toLowerCase())
      .filter(Boolean),
  );
  const restaurant = domains.has("restaurant");
  const activity =
    domains.has("activity") ||
    domains.has("nightlife") ||
    domains.has("venue");
  if (restaurant && activity) return "hybrid";
  return restaurant ? "restaurant" : "activity";
}

function buildDocument(location: LocationRow, profile: ProfileRow): DocumentRow {
  const lines: string[] = [];
  add(
    lines,
    "Name",
    location.name ||
      location.restaurant_name ||
      location.activity_name ||
      location.business_name,
  );
  add(lines, "Primary domain", profile.primary_domain);
  add(lines, "Supported domains", profile.supported_domains);
  add(lines, "Restaurant categories", profile.restaurant_categories);
  add(lines, "Activity categories", profile.activity_categories);
  add(lines, "Nightlife categories", profile.nightlife_categories);
  add(lines, "Cuisines", profile.cuisines);
  add(lines, "Foods", profile.foods);
  add(lines, "Meal periods", profile.meal_periods);
  add(lines, "Features and offerings", profile.features);
  add(lines, "Vibes", profile.vibes);
  add(lines, "Occasions", profile.occasions);
  add(lines, "Audiences", profile.audiences);
  add(lines, "Canonical search terms", profile.canonical_terms);
  add(
    lines,
    "Location",
    [
      profile.neighborhood || location.neighborhood,
      profile.borough || location.borough,
      profile.city || location.city,
      profile.state || location.state,
      location.zip_code,
    ].filter(Boolean).join(", "),
  );
  add(lines, "Rating", location.rating);
  add(lines, "Review count", location.review_count);
  add(lines, "Description", location.description);

  const document = lines.join("\n");
  const hash = crypto
    .createHash("sha256")
    .update(`${DOCUMENT_VERSION}\n${document}`, "utf8")
    .digest("hex");

  return {
    locationId: location.id,
    canonicalType: canonicalType(profile),
    marketKey: profile.market || location.market,
    document,
    hash,
  };
}

async function readAll<T>(table: string, select: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table} read failed: ${error.message}`);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function upsertRows(rows: Record<string, unknown>[]) {
  for (let index = 0; index < rows.length; index += 100) {
    const { error } = await supabase
      .from("location_search_embeddings")
      .upsert(rows.slice(index, index + 100), { onConflict: "location_id" });
    if (error) throw new Error(`location_search_embeddings upsert failed: ${error.message}`);
  }
}

async function fetchAzureEmbeddings(inputs: string[]): Promise<number[][]> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const sinceLastRequest = Date.now() - lastAzureRequestStartedAt;
    if (sinceLastRequest < MIN_REQUEST_INTERVAL_MS) {
      await sleep(MIN_REQUEST_INTERVAL_MS - sinceLastRequest);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);

    try {
      lastAzureRequestStartedAt = Date.now();
      const response = await fetch(
        `${AZURE_AI_ENDPOINT}/openai/v1/embeddings`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "api-key": AZURE_AI_API_KEY,
          },
          body: JSON.stringify({ model: AZURE_DEPLOYMENT, input: inputs }),
          signal: controller.signal,
        },
      );

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          payload?.error?.message ||
          payload?.message ||
          `Azure embeddings failed with HTTP ${response.status}`;
        const retryable =
          response.status === 408 ||
          response.status === 429 ||
          response.status >= 500;
        if (!retryable) throw new Error(message);
        throw Object.assign(new Error(message), {
          retryAfterMs: resolveRetryAfterMs(response, message),
        });
      }

      const ordered = Array.isArray(payload?.data)
        ? [...payload.data].sort(
            (a: any, b: any) => Number(a?.index ?? 0) - Number(b?.index ?? 0),
          )
        : [];
      if (ordered.length !== inputs.length) {
        throw new Error(
          `Azure embedding count mismatch: expected ${inputs.length}, got ${ordered.length}`,
        );
      }

      const vectors = ordered.map((row: any) =>
        Array.isArray(row?.embedding) ? row.embedding.map(Number) : [],
      );
      for (const vector of vectors) {
        if (
          vector.length !== VECTOR_DIMENSIONS ||
          !vector.every(Number.isFinite)
        ) {
          throw new Error("Azure embedding vector is invalid.");
        }
      }
      return vectors;
    } catch (error) {
      lastError = error;
      if (attempt >= MAX_RETRIES) break;

      const retryAfterMs =
        typeof error === "object" &&
        error !== null &&
        "retryAfterMs" in error &&
        Number.isFinite(Number((error as any).retryAfterMs))
          ? Number((error as any).retryAfterMs)
          : null;
      const waitMs =
        retryAfterMs != null
          ? Math.max(
              MIN_REQUEST_INTERVAL_MS,
              retryAfterMs + RETRY_SAFETY_BUFFER_MS,
            )
          : MIN_REQUEST_INTERVAL_MS;
      console.warn(
        `Azure location-intelligence attempt ${attempt}/${MAX_RETRIES} failed; retrying in ${Math.ceil(waitMs / 1000)}s.`,
      );
      await sleep(waitMs);
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Azure location-intelligence embedding request failed.");
}

function resolveRetryAfterMs(response: Response, message: string): number {
  const milliseconds = Number(response.headers.get("retry-after-ms"));
  if (Number.isFinite(milliseconds) && milliseconds > 0) return milliseconds;

  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  }

  const match = message.match(/retry after\s+(\d+(?:\.\d+)?)\s*seconds?/i);
  return match ? Math.ceil(Number(match[1]) * 1000) : 60_000;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(
    JSON.stringify({
      phase: "search-v3-location-intelligence-backfill",
      provider: "azure",
      deployment: AZURE_DEPLOYMENT,
      vectorModel: VECTOR_MODEL,
      embeddingVersion: EMBEDDING_VERSION,
      documentVersion: DOCUMENT_VERSION,
      batchSize: BATCH_SIZE,
      resumeTailBatchSize: RESUME_TAIL_BATCH_SIZE,
      resumeTailThreshold: RESUME_TAIL_THRESHOLD,
      minRequestIntervalMs: MIN_REQUEST_INTERVAL_MS,
    }),
  );

  const [locations, profiles, existing] = await Promise.all([
    readAll<LocationRow>(
      "locations",
      "id,name,restaurant_name,activity_name,business_name,description,neighborhood,borough,city,state,zip_code,market,rating,review_count,is_searchable,is_hidden,active,deleted_at,status,duplicate_status",
    ),
    readAll<ProfileRow>(
      "location_search_profiles",
      "location_id,primary_domain,supported_domains,restaurant_categories,activity_categories,nightlife_categories,cuisines,foods,meal_periods,features,vibes,occasions,audiences,canonical_terms,market,neighborhood,borough,city,state",
    ),
    readAll<ExistingEmbedding>(
      "location_search_embeddings",
      "location_id,embedding_version,semantic_document_hash,status",
    ),
  ]);

  const locationById = new Map(locations.map((row) => [row.id, row]));
  const existingById = new Map(existing.map((row) => [row.location_id, row]));
  const documents = profiles.flatMap((profile) => {
    const location = locationById.get(profile.location_id);
    if (!location || !eligible(location)) return [];
    const document = buildDocument(location, profile);
    return document.document ? [document] : [];
  });

  const pending = documents.filter((document) => {
    const current = existingById.get(document.locationId);
    return !(
      current?.status === "ready" &&
      current.embedding_version === EMBEDDING_VERSION &&
      current.semantic_document_hash === document.hash
    );
  });

  let embedded = 0;
  let failed = 0;
  const effectiveBatchSize =
    pending.length > 0 && pending.length <= RESUME_TAIL_THRESHOLD
      ? Math.min(BATCH_SIZE, RESUME_TAIL_BATCH_SIZE)
      : BATCH_SIZE;

  if (effectiveBatchSize !== BATCH_SIZE) {
    console.log(
      `location-intelligence resume tail detected: ${pending.length} rows; using batch size ${effectiveBatchSize}.`,
    );
  }

  for (let index = 0; index < pending.length; index += effectiveBatchSize) {
    const batch = pending.slice(index, index + effectiveBatchSize);

    try {
      const vectors = await fetchAzureEmbeddings(
        batch.map((item) => item.document),
      );
      const calculatedAt = new Date().toISOString();
      await upsertRows(
        batch.map((item, batchIndex) => ({
          location_id: item.locationId,
          embedding: vectors[batchIndex],
          canonical_search_type: item.canonicalType,
          market_key: item.marketKey,
          embedding_model: VECTOR_MODEL,
          embedding_version: EMBEDDING_VERSION,
          semantic_document_hash: item.hash,
          semantic_document_version: DOCUMENT_VERSION,
          status: "ready",
          calculated_at: calculatedAt,
          error_message: null,
        })),
      );
      embedded += batch.length;
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 1000) : "unknown_error";
      failed += batch.length;
      console.error(
        `location-intelligence batch failed for ${batch.length} rows: ${message}`,
      );
    }

    console.log(
      `location-intelligence progress ${Math.min(index + effectiveBatchSize, pending.length)}/${pending.length}`,
    );
  }

  console.log(
    JSON.stringify({
      summary: {
        candidates: documents.length,
        skippedReady: documents.length - pending.length,
        embedded,
        failed,
      },
    }),
  );

  if (failed > 0) {
    throw new Error(
      `Azure location-intelligence backfill completed with failures: ${failed}. Rerun is safe and resumable.`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
