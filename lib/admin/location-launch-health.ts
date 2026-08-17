import OpenAI from "openai";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const LAUNCH_MARKETS = [
  "NYC_CORE",
  "NORTHERN_NJ",
  "LONG_ISLAND",
  "WESTCHESTER",
  "CONNECTICUT",
] as const;

export const LOCATION_DESCRIPTION_MODEL =
  process.env.LOCATION_DESCRIPTION_AI_MODEL || process.env.WEBSITE_AI_MODEL || "gpt-4o-mini";

export const LOCATION_DESCRIPTION_SOURCE = "ai_google_structured_facts_v1";

const LOCATION_FIELDS = [
  "id",
  "name",
  "description",
  "short_description",
  "category",
  "primary_category",
  "activity_type",
  "cuisine",
  "cuisine_type",
  "city",
  "state",
  "neighborhood",
  "price_range",
  "google_primary_type",
  "google_types",
  "google_meal_periods",
  "reservation_provider",
  "market",
  "data_status",
  "duplicate_status",
  "is_searchable",
  "is_hidden",
  "public_visibility_tier",
  "active",
  "deleted_at",
  "is_demo",
  "description_backfill_status",
  "description_backfill_source",
  "description_backfill_checked_at",
  "description_backfill_error",
].join(",");

export type DescriptionBackfillPhase = "public" | "hidden";

type LocationRow = Record<string, unknown> & { id: string; name?: string | null };

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function strings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 12);
}

function isPublicLaunchLocation(row: LocationRow) {
  return (
    row.active === true &&
    row.deleted_at == null &&
    row.is_demo !== true &&
    row.is_searchable === true &&
    row.is_hidden !== true &&
    row.public_visibility_tier !== "hidden" &&
    LAUNCH_MARKETS.includes(String(row.market || "") as (typeof LAUNCH_MARKETS)[number])
  );
}

function isStrongPublicLocation(row: LocationRow) {
  const duplicateStatus = String(row.duplicate_status || "");
  return (
    isPublicLaunchLocation(row) &&
    row.data_status === "clean" &&
    duplicateStatus !== "duplicate" &&
    duplicateStatus !== "possible_duplicate"
  );
}

function verifiedFacts(row: LocationRow) {
  const facts: Record<string, string | string[]> = {};

  // Canonical classification + Google structured fields only. Do not use review prose,
  // ratings, vibe tags, best-for tags, or AI-generated marketing attributes here.
  const direct: Array<[string, unknown]> = [
    ["category", row.primary_category || row.category],
    ["activity_type", row.activity_type],
    ["cuisine", row.cuisine_type || row.cuisine],
    ["neighborhood", row.neighborhood],
    ["city", row.city],
    ["state", row.state],
    ["price_range", row.price_range],
    ["google_primary_type", row.google_primary_type],
    ["reservation_provider", row.reservation_provider],
  ];
  for (const [key, value] of direct) {
    const normalized = text(value);
    if (normalized) facts[key] = normalized;
  }

  for (const [key, value] of [
    ["google_types", row.google_types],
    ["google_meal_periods", row.google_meal_periods],
  ] as const) {
    const normalized = strings(value);
    if (normalized.length) facts[key] = normalized;
  }

  return facts;
}

function sufficientFacts(facts: Record<string, string | string[]>) {
  const identitySignals = [
    "category",
    "activity_type",
    "cuisine",
    "google_primary_type",
    "google_types",
  ].filter((key) => key in facts).length;
  const contextSignals = [
    "neighborhood",
    "city",
    "price_range",
    "google_meal_periods",
    "reservation_provider",
  ].filter((key) => key in facts).length;
  return identitySignals >= 1 && identitySignals + contextSignals >= 2;
}

const PROMOTIONAL_FILLER = [
  /hidden gem/i,
  /must[- ]visit/i,
  /unforgettable/i,
  /perfect (?:place|spot|destination|choice)/i,
  /ideal (?:place|spot|destination|choice)/i,
  /something for everyone/i,
  /vibrant (?:atmosphere|scene|spot|destination)/i,
  /one[- ]of[- ]a[- ]kind/i,
  /world[- ]class/i,
  /best[- ]in[- ]class/i,
  /premier destination/i,
  /beloved/i,
  /renowned/i,
  /charming/i,
  /exciting/i,
  /whether you(?:'re| are)/i,
  /look no further/i,
];

function validateDescription(value: unknown) {
  if (typeof value !== "string") return null;
  const description = value.replace(/\s+/g, " ").trim();
  if (description.length < 30 || description.length > 320) return null;
  if (PROMOTIONAL_FILLER.some((pattern) => pattern.test(description))) return null;
  return description;
}

async function generateFactualDescription(row: LocationRow) {
  const facts = verifiedFacts(row);
  if (!sufficientFacts(facts)) {
    return { description: null, reason: "insufficient_verified_facts" as const };
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("openai_not_configured");
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await openai.chat.completions.create({
    model: LOCATION_DESCRIPTION_MODEL,
    temperature: 0,
    max_tokens: 140,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "Write a plain factual location description using ONLY the supplied structured facts.",
          "These facts come from TheOutHaven canonical classification and stored Google structured fields.",
          "Do not copy, reconstruct, paraphrase, or imitate Google editorial summaries, reviews, review snippets, or AI summaries.",
          "Do not market, praise, recommend, embellish, infer, or add atmosphere that is not explicitly supplied.",
          "Never invent amenities, menu items, awards, ratings, popularity, service quality, hours, history, audience, events, accessibility, parking, views, or reservation availability.",
          "Avoid promotional adjectives and filler such as hidden gem, must-visit, vibrant, unforgettable, perfect, ideal, premier, world-class, beloved, renowned, exciting, charming, or something for everyone.",
          "Prefer concrete wording such as 'Italian restaurant in Astoria' or 'indoor go-karting venue in Jersey City'.",
          "Use one or two short sentences, normally 18-45 words.",
          "If the facts are too sparse to write a useful factual description, return null instead of padding the copy.",
          "Return JSON only: {\"description\": string|null}.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({ name: text(row.name) || "Location", verified_facts: facts }),
      },
    ],
  });

  let parsed: { description?: unknown } = {};
  try {
    parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
  } catch {
    return { description: null, reason: "invalid_model_output" as const };
  }
  const description = validateDescription(parsed.description);
  if (!description) return { description: null, reason: "rejected_model_output" as const };
  return { description, reason: null };
}

async function loadMissingCandidates(phase: DescriptionBackfillPhase, limit: number) {
  const scanLimit = Math.min(600, Math.max(limit * 10, 150));
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select(LOCATION_FIELDS)
    .eq("active", true)
    .is("deleted_at", null)
    .is("description", null)
    .or("description_backfill_status.is.null,description_backfill_status.eq.failed")
    .order("id", { ascending: true })
    .limit(scanLimit);
  if (error) throw error;

  const rows = (data || []) as LocationRow[];
  return rows
    .filter((row) => row.is_demo !== true)
    .filter((row) => (phase === "public" ? isStrongPublicLocation(row) : !isPublicLaunchLocation(row)))
    .slice(0, Math.max(1, Math.min(limit, 25)));
}

async function markSkipped(row: LocationRow, reason: string) {
  const { error } = await supabaseAdmin
    .from("locations")
    .update({
      description_backfill_status: "skipped",
      description_backfill_source: LOCATION_DESCRIPTION_SOURCE,
      description_backfill_checked_at: new Date().toISOString(),
      description_backfill_error: reason,
    })
    .eq("id", row.id)
    .is("description", null);
  if (error) throw error;
}

async function markFailed(row: LocationRow, reason: string) {
  const { error } = await supabaseAdmin
    .from("locations")
    .update({
      description_backfill_status: "failed",
      description_backfill_source: LOCATION_DESCRIPTION_SOURCE,
      description_backfill_checked_at: new Date().toISOString(),
      description_backfill_error: reason.slice(0, 500),
    })
    .eq("id", row.id)
    .is("description", null);
  if (error) throw error;
}

export async function runDescriptionBackfillBatch(input: {
  phase: DescriptionBackfillPhase;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(Number(input.limit || 10), 25));
  if (input.phase === "hidden") {
    const health = await getLaunchCatalogHealth();
    if (!health.descriptions.publicPhaseComplete) {
      throw new Error("Public launch descriptions must be processed before hidden inventory can be backfilled.");
    }
  }

  const candidates = await loadMissingCandidates(input.phase, limit);
  let generated = 0;
  let skipped = 0;
  let failed = 0;
  const reasons: Record<string, number> = {};

  for (const row of candidates) {
    try {
      const result = await generateFactualDescription(row);
      if (!result.description) {
        skipped += 1;
        const reason = result.reason || "skipped";
        reasons[reason] = (reasons[reason] || 0) + 1;
        await markSkipped(row, reason);
        continue;
      }

      const { error } = await supabaseAdmin
        .from("locations")
        .update({
          description: result.description,
          description_backfill_status: "generated",
          description_backfill_source: LOCATION_DESCRIPTION_SOURCE,
          description_backfill_checked_at: new Date().toISOString(),
          description_backfill_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .is("description", null);
      if (error) throw error;
      generated += 1;
    } catch (error) {
      failed += 1;
      const reason = error instanceof Error ? error.message : "unknown_error";
      reasons[reason] = (reasons[reason] || 0) + 1;
      try {
        await markFailed(row, reason);
      } catch {
        // Keep the original failure visible in the batch result.
      }
    }
  }

  return { phase: input.phase, selected: candidates.length, generated, skipped, failed, reasons };
}

async function countPublicBase() {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("id,active,deleted_at,is_demo,is_searchable,is_hidden,public_visibility_tier,market,data_status,duplicate_status,description,website,phone,address,formatted_address,description_backfill_status,description_backfill_source")
    .eq("active", true)
    .is("deleted_at", null);
  if (error) throw error;
  return (data || []) as LocationRow[];
}

export async function getLaunchCatalogHealth() {
  const rows = await countPublicBase();
  const publicRows = rows.filter(isPublicLaunchLocation);
  const strongRows = publicRows.filter(isStrongPublicLocation);
  const publicStrongMissingRows = strongRows.filter((row) => !text(row.description));
  const publicStrongSkipped = publicStrongMissingRows.filter((row) => row.description_backfill_status === "skipped").length;
  const publicStrongFailed = publicStrongMissingRows.filter((row) => row.description_backfill_status === "failed").length;
  const publicStrongPending = publicStrongMissingRows.filter((row) => row.description_backfill_status !== "skipped").length;
  const hiddenRows = rows.filter((row) => row.is_demo !== true && !isPublicLaunchLocation(row));
  const hiddenMissing = hiddenRows.filter((row) => !text(row.description)).length;

  return {
    publicLocations: publicRows.length,
    blockers: {
      confirmedDuplicates: publicRows.filter((row) => row.duplicate_status === "duplicate").length,
      unsupportedMarkets: publicRows.filter((row) => !LAUNCH_MARKETS.includes(String(row.market || "") as (typeof LAUNCH_MARKETS)[number])).length,
      missingBothContact: publicRows.filter((row) => !text(row.website) && !text(row.phone)).length,
      addresslessWithoutFallback: publicRows.filter((row) => !text(row.address) && !text(row.formatted_address)).length,
    },
    descriptions: {
      publicStrongTotal: strongRows.length,
      publicStrongDescribed: strongRows.length - publicStrongMissingRows.length,
      publicStrongMissing: publicStrongMissingRows.length,
      publicStrongPending,
      publicStrongSkipped,
      publicStrongFailed,
      generatedByCurrentPipeline: strongRows.filter((row) => row.description_backfill_source === LOCATION_DESCRIPTION_SOURCE && text(row.description)).length,
      hiddenMissing,
      publicPhaseComplete: publicStrongPending === 0,
    },
  };
}
