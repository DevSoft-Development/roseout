import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const EAST_REF = "ftdsltatyqhtllyyefzp";
const SUPABASE_URL = String(
  process.env.SUPABASE_URL || `https://${EAST_REF}.supabase.co`,
).replace(/\/$/, "");
const SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const AZURE_AI_ENDPOINT = String(process.env.AZURE_AI_ENDPOINT || "").replace(/\/$/, "");
const AZURE_AI_API_KEY = String(process.env.AZURE_AI_API_KEY || "");
const AZURE_DEPLOYMENT = String(
  process.env.AZURE_AI_EMBEDDING_MODEL || "toh-embedding",
);
const VECTOR_MODEL = String(
  process.env.SEARCH_EMBEDDING_MODEL || "text-embedding-3-small",
);
const EMBEDDING_VERSION = String(
  process.env.SEARCH_FOOD_MENU_EMBEDDING_VERSION ||
    "azure-text-embedding-3-small:v1",
);
const VECTOR_DIMENSIONS = 1536;
const PAGE_SIZE = clamp(Number(process.env.SEARCH_EMBEDDING_PAGE_SIZE || 500), 100, 1000);
const BATCH_SIZE = clamp(Number(process.env.SEARCH_EMBEDDING_BATCH_SIZE || 64), 1, 128);
const MAX_RETRIES = clamp(Number(process.env.SEARCH_EMBEDDING_MAX_RETRIES || 5), 1, 8);

if (!SUPABASE_URL.includes(EAST_REF)) {
  throw new Error(
    `Azure food/menu backfill is East-primary only; refusing Supabase URL ${SUPABASE_URL}`,
  );
}
if (!SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required.");
if (!AZURE_AI_ENDPOINT) throw new Error("AZURE_AI_ENDPOINT is required.");
if (!AZURE_AI_API_KEY) throw new Error("AZURE_AI_API_KEY is required.");
if (VECTOR_MODEL !== "text-embedding-3-small") {
  throw new Error(
    `Unsupported vector model ${VECTOR_MODEL}; this index is fixed at text-embedding-3-small/1536 dimensions.`,
  );
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type LocationRow = {
  id: string;
  name: string | null;
  restaurant_name: string | null;
  business_name: string | null;
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
  cuisines: string[] | null;
  foods: string[] | null;
  meal_periods: string[] | null;
  features: string[] | null;
  canonical_terms: string[] | null;
};

type LegacyMenuTextRow = {
  id: string;
  location_id: string;
  item_name: string;
  normalized_item_name: string;
  source: string;
};

type MenuItemRow = {
  id: string;
  location_id: string;
  item_name: string;
  normalized_item_name: string;
  source: string;
  content_hash: string;
};

type Summary = {
  menuSourceUpserted: number;
  foodCandidates: number;
  foodSkippedReady: number;
  foodEmbedded: number;
  foodFailed: number;
  menuCandidates: number;
  menuSkippedReady: number;
  menuEmbedded: number;
  menuFailed: number;
};

const summary: Summary = {
  menuSourceUpserted: 0,
  foodCandidates: 0,
  foodSkippedReady: 0,
  foodEmbedded: 0,
  foodFailed: 0,
  menuCandidates: 0,
  menuSkippedReady: 0,
  menuEmbedded: 0,
  menuFailed: 0,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function hashText(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function unique(values: readonly unknown[] | null | undefined) {
  return [
    ...new Set(
      (values ?? [])
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    ),
  ];
}

function isEligibleLocation(row: LocationRow) {
  const status = String(row.status ?? "").toLowerCase();
  const duplicate = String(row.duplicate_status ?? "").toLowerCase();
  return (
    row.is_searchable !== false &&
    row.is_hidden !== true &&
    row.active !== false &&
    row.deleted_at == null &&
    !["closed", "permanently_closed", "archived", "deleted", "hidden"].includes(status) &&
    !["duplicate", "secondary", "merged"].includes(duplicate)
  );
}

async function readAll<T>(
  table: string,
  select: string,
  apply?: (query: any) => any,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from(table)
      .select(select)
      .range(from, from + PAGE_SIZE - 1);
    if (apply) query = apply(query);
    const { data, error } = await query;
    if (error) throw new Error(`${table} read failed: ${error.message}`);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function upsertInChunks(
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
  chunkSize = 250,
) {
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const { error } = await supabase
      .from(table)
      .upsert(chunk, { onConflict });
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
  }
}

async function fetchAzureEmbeddings(inputs: string[]): Promise<number[][]> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(
        `${AZURE_AI_ENDPOINT}/openai/v1/embeddings`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "api-key": AZURE_AI_API_KEY,
          },
          body: JSON.stringify({
            model: AZURE_DEPLOYMENT,
            input: inputs,
          }),
          signal: controller.signal,
        },
      );

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const retryable =
          response.status === 408 ||
          response.status === 429 ||
          response.status >= 500;
        const message =
          payload?.error?.message ||
          payload?.message ||
          `Azure embeddings failed with HTTP ${response.status}`;
        if (!retryable) throw new Error(message);
        throw Object.assign(new Error(message), { retryable: true });
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
          throw new Error(
            `Azure embedding must contain exactly ${VECTOR_DIMENSIONS} finite dimensions.`,
          );
        }
      }

      return vectors;
    } catch (error) {
      lastError = error;
      if (attempt >= MAX_RETRIES) break;
      const waitMs = Math.min(10_000, 500 * 2 ** (attempt - 1));
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Azure embedding request failed.");
}

async function migrateMenuSourceText(eligibleLocationIds: Set<string>) {
  const legacyRows = await readAll<LegacyMenuTextRow>(
    "location_menu_item_embeddings_hf",
    "id,location_id,item_name,normalized_item_name,source",
    (query) => query.eq("status", "ready"),
  );

  const rows = legacyRows.flatMap((row) => {
    if (!eligibleLocationIds.has(row.location_id)) return [];
    const itemName = String(row.item_name ?? "").trim();
    if (!itemName) return [];
    const normalized =
      normalizeText(row.normalized_item_name) || normalizeText(itemName);
    if (!normalized) return [];

    return [
      {
        location_id: row.location_id,
        item_name: itemName,
        normalized_item_name: normalized,
        source: String(row.source || "legacy_menu_text"),
        source_record_id: row.id,
        source_metadata: {
          migratedFrom: "location_menu_item_embeddings_hf",
          vectorReuse: false,
          providerNeutralSource: true,
        },
        content_hash: hashText(itemName),
        status: "active",
        updated_at: new Date().toISOString(),
      },
    ];
  });

  await upsertInChunks(
    "location_menu_items",
    rows,
    "location_id,normalized_item_name,source",
  );
  summary.menuSourceUpserted = rows.length;
}

function buildFoodDocument(profile: ProfileRow, location: LocationRow) {
  const cuisines = unique(profile.cuisines);
  const foods = unique(profile.foods);
  const categories = unique(profile.restaurant_categories);
  const meals = unique(profile.meal_periods);
  const features = unique(profile.features);
  const canonical = unique(profile.canonical_terms);

  if (
    foods.length === 0 &&
    cuisines.length === 0 &&
    categories.length === 0
  ) {
    return null;
  }

  const name =
    location.name ||
    location.restaurant_name ||
    location.business_name ||
    "Location";

  const lines = [
    `Name: ${name}`,
    cuisines.length ? `Cuisines: ${cuisines.join(", ")}` : "",
    foods.length ? `Foods: ${foods.join(", ")}` : "",
    categories.length
      ? `Restaurant categories: ${categories.join(", ")}`
      : "",
    meals.length ? `Meal periods: ${meals.join(", ")}` : "",
    features.length ? `Features: ${features.join(", ")}` : "",
    canonical.length
      ? `Canonical search terms: ${canonical.join(", ")}`
      : "",
  ].filter(Boolean);

  return lines.join("\n");
}

async function existingFoodState(locationIds: string[]) {
  const map = new Map<string, { document_hash: string; status: string }>();
  for (let index = 0; index < locationIds.length; index += 200) {
    const ids = locationIds.slice(index, index + 200);
    const { data, error } = await supabase
      .from("location_food_embeddings")
      .select("location_id,document_hash,status")
      .eq("embedding_version", EMBEDDING_VERSION)
      .in("location_id", ids);
    if (error) throw new Error(`Food state read failed: ${error.message}`);
    for (const row of data ?? []) {
      map.set(String(row.location_id), {
        document_hash: String(row.document_hash ?? ""),
        status: String(row.status ?? ""),
      });
    }
  }
  return map;
}

async function backfillFoodEmbeddings(
  profiles: ProfileRow[],
  locations: Map<string, LocationRow>,
) {
  const documents = profiles.flatMap((profile) => {
    const location = locations.get(profile.location_id);
    if (!location || !isEligibleLocation(location)) return [];
    const domains = new Set([
      profile.primary_domain,
      ...(profile.supported_domains ?? []),
    ]);
    if (!domains.has("restaurant")) return [];

    const document = buildFoodDocument(profile, location);
    if (!document) return [];
    return [
      {
        locationId: profile.location_id,
        document,
        hash: hashText(document),
      },
    ];
  });

  summary.foodCandidates = documents.length;
  const state = await existingFoodState(
    documents.map((item) => item.locationId),
  );
  const pending = documents.filter((item) => {
    const current = state.get(item.locationId);
    const skip =
      current?.status === "ready" && current.document_hash === item.hash;
    if (skip) summary.foodSkippedReady += 1;
    return !skip;
  });

  for (let index = 0; index < pending.length; index += BATCH_SIZE) {
    const batch = pending.slice(index, index + BATCH_SIZE);
    const now = new Date().toISOString();

    await upsertInChunks(
      "location_food_embeddings",
      batch.map((item) => ({
        location_id: item.locationId,
        embedding_version: EMBEDDING_VERSION,
        embedding_provider: "azure",
        embedding_model: VECTOR_MODEL,
        document_text: item.document,
        document_hash: item.hash,
        embedding: null,
        status: "pending",
        calculated_at: null,
        error_message: null,
        updated_at: now,
      })),
      "location_id,embedding_version",
      BATCH_SIZE,
    );

    try {
      const vectors = await fetchAzureEmbeddings(
        batch.map((item) => item.document),
      );

      await upsertInChunks(
        "location_food_embeddings",
        batch.map((item, batchIndex) => ({
          location_id: item.locationId,
          embedding_version: EMBEDDING_VERSION,
          embedding_provider: "azure",
          embedding_model: VECTOR_MODEL,
          document_text: item.document,
          document_hash: item.hash,
          embedding: vectors[batchIndex],
          status: "ready",
          calculated_at: now,
          error_message: null,
          updated_at: now,
        })),
        "location_id,embedding_version",
        BATCH_SIZE,
      );

      summary.foodEmbedded += batch.length;
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 1000) : "unknown_error";
      await upsertInChunks(
        "location_food_embeddings",
        batch.map((item) => ({
          location_id: item.locationId,
          embedding_version: EMBEDDING_VERSION,
          embedding_provider: "azure",
          embedding_model: VECTOR_MODEL,
          document_text: item.document,
          document_hash: item.hash,
          embedding: null,
          status: "failed",
          calculated_at: now,
          error_message: message,
          updated_at: now,
        })),
        "location_id,embedding_version",
        BATCH_SIZE,
      );
      summary.foodFailed += batch.length;
    }

    console.log(
      `food progress ${Math.min(index + BATCH_SIZE, pending.length)}/${pending.length}`,
    );
  }
}

async function existingMenuState(menuItemIds: string[]) {
  const map = new Map<string, { document_hash: string; status: string }>();
  for (let index = 0; index < menuItemIds.length; index += 200) {
    const ids = menuItemIds.slice(index, index + 200);
    const { data, error } = await supabase
      .from("location_menu_item_embeddings")
      .select("menu_item_id,document_hash,status")
      .eq("embedding_version", EMBEDDING_VERSION)
      .in("menu_item_id", ids);
    if (error) throw new Error(`Menu state read failed: ${error.message}`);
    for (const row of data ?? []) {
      map.set(String(row.menu_item_id), {
        document_hash: String(row.document_hash ?? ""),
        status: String(row.status ?? ""),
      });
    }
  }
  return map;
}

async function backfillMenuEmbeddings(eligibleLocationIds: Set<string>) {
  const menuItems = await readAll<MenuItemRow>(
    "location_menu_items",
    "id,location_id,item_name,normalized_item_name,source,content_hash",
    (query) => query.eq("status", "active"),
  );
  const eligible = menuItems.filter((row) =>
    eligibleLocationIds.has(row.location_id),
  );

  summary.menuCandidates = eligible.length;
  const state = await existingMenuState(eligible.map((row) => row.id));
  const pending = eligible.filter((row) => {
    const current = state.get(row.id);
    const skip =
      current?.status === "ready" &&
      current.document_hash === row.content_hash;
    if (skip) summary.menuSkippedReady += 1;
    return !skip;
  });

  for (let index = 0; index < pending.length; index += BATCH_SIZE) {
    const batch = pending.slice(index, index + BATCH_SIZE);
    const documents = batch.map((row) => row.item_name.trim());
    const now = new Date().toISOString();

    await upsertInChunks(
      "location_menu_item_embeddings",
      batch.map((row) => ({
        menu_item_id: row.id,
        location_id: row.location_id,
        embedding_version: EMBEDDING_VERSION,
        embedding_provider: "azure",
        embedding_model: VECTOR_MODEL,
        document_hash: row.content_hash,
        embedding: null,
        status: "pending",
        calculated_at: null,
        error_message: null,
        updated_at: now,
      })),
      "menu_item_id,embedding_version",
      BATCH_SIZE,
    );

    try {
      const vectors = await fetchAzureEmbeddings(documents);
      await upsertInChunks(
        "location_menu_item_embeddings",
        batch.map((row, batchIndex) => ({
          menu_item_id: row.id,
          location_id: row.location_id,
          embedding_version: EMBEDDING_VERSION,
          embedding_provider: "azure",
          embedding_model: VECTOR_MODEL,
          document_hash: row.content_hash,
          embedding: vectors[batchIndex],
          status: "ready",
          calculated_at: now,
          error_message: null,
          updated_at: now,
        })),
        "menu_item_id,embedding_version",
        BATCH_SIZE,
      );
      summary.menuEmbedded += batch.length;
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 1000) : "unknown_error";
      await upsertInChunks(
        "location_menu_item_embeddings",
        batch.map((row) => ({
          menu_item_id: row.id,
          location_id: row.location_id,
          embedding_version: EMBEDDING_VERSION,
          embedding_provider: "azure",
          embedding_model: VECTOR_MODEL,
          document_hash: row.content_hash,
          embedding: null,
          status: "failed",
          calculated_at: now,
          error_message: message,
          updated_at: now,
        })),
        "menu_item_id,embedding_version",
        BATCH_SIZE,
      );
      summary.menuFailed += batch.length;
    }

    console.log(
      `menu progress ${Math.min(index + BATCH_SIZE, pending.length)}/${pending.length}`,
    );
  }
}

async function main() {
  console.log(
    JSON.stringify({
      phase: "search-v3-azure-food-menu-backfill",
      eastRef: EAST_REF,
      deployment: AZURE_DEPLOYMENT,
      vectorModel: VECTOR_MODEL,
      embeddingVersion: EMBEDDING_VERSION,
      vectorDimensions: VECTOR_DIMENSIONS,
      batchSize: BATCH_SIZE,
    }),
  );

  const [locations, profiles] = await Promise.all([
    readAll<LocationRow>(
      "locations",
      "id,name,restaurant_name,business_name,is_searchable,is_hidden,active,deleted_at,status,duplicate_status",
    ),
    readAll<ProfileRow>(
      "location_search_profiles",
      "location_id,primary_domain,supported_domains,restaurant_categories,cuisines,foods,meal_periods,features,canonical_terms",
    ),
  ]);

  const locationMap = new Map(locations.map((row) => [row.id, row]));
  const eligibleLocationIds = new Set(
    locations.filter(isEligibleLocation).map((row) => row.id),
  );

  await migrateMenuSourceText(eligibleLocationIds);
  await backfillFoodEmbeddings(profiles, locationMap);
  await backfillMenuEmbeddings(eligibleLocationIds);

  console.log(JSON.stringify({ summary }, null, 2));

  if (summary.foodFailed > 0 || summary.menuFailed > 0) {
    throw new Error(
      `Azure embedding backfill completed with failures: food=${summary.foodFailed}, menu=${summary.menuFailed}. Rerun is safe and resumable.`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
