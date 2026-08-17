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
  "vibe_tags",
  "best_for_tags",
  "date_style_tags",
  "special_features",
  "semantic_tags",
  "google_primary_type",
  "google_types",
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
    ["special_features", row.special_features],
    ["vibe_tags", row.vibe_tags],
    ["best_for_tags", row.best_for_tags],
    ["date_style_tags", row.date_style_tags],
    ["google_types", row.google_types],
  ] as const) {
    const normalized = strings(value);
    if (normalized.length) facts[key] = normalized;
  }
  return facts;
}

function sufficientFacts(facts: Record<string, string | string[]>) {
  const substantiveKeys = [
    "category",
    "activity_type",
    "cuisine",
    "special_features",
    "vibe_tags",
    "best_for_tags",
    "date_style_tags",
    "google_primary_type",
    "google_types",
    "price_range",
    "reservation_provider",
  ];
  return substantiveKeys.filter((key) => key in facts).length >= 2;
}

const PROMOTIONAL_FILLER = [
  /hidden gem/i,
  /must[- ]visit/i,
  /unforgettable/i,
  /perfect (?:place|spot|destination|choice)/i,
  /something for everyone/i,
  /vibrant (?:atmosphere|scene|spot|destination)/i,
  /one[- ]of[- ]a[- ]kind/i,
  /world[- ]class/i,
  /best[- ]in[- ]class/i,
  /premier destination/i,
  /whether you(?:'re| are)/i,
  /look no further/i,
];

function validateDescription(value: unknown) {
  if (typeof value !== "string") return null;
  const description = value.replace(/\s+/g, " ").trim();
  if (description.length < 35 || description.length > 420) return null;
  if (PROMOTIONAL_FILLER.some((pattern) => pattern.test(description))) return null;
  return description;
}

async function generateFactualDescription(row: LocationRow) {
  const facts = verifiedFacts(row);
  if (!sufficientFacts(facts)) {
    return { description: null, reason: "insufficient_verified_facts" as const };
  }
  if (!process.env.OPENAI_API_KEY) {
    return { description: null, reason: "openai_not_configured" as const };
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const completion = await openai.chat.completions.create({
    model: LOCATION_DESCRIPTION_MODEL,
    temperature: 0,
    max_tokens: 160,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "Write a plain factual location description using ONLY the supplied verified facts.",
          "Do not market, praise, recommend, embellish, infer, or add atmosphere that is not explicitly present.",
          "Never invent amenities, menu items, awards, ratings, popularity, service quality, hours, history, audience, events, accessibility, parking, views, or reservation availability.",
          "Avoid promotional adjectives and filler such as hidden gem, must-visit, vibrant, unforgettable, perfect, premier, world-class, ideal, beloved, renowned, exciting, charming, or something for everyone.",
          "Use one or two short sentences, normally 25-60 words.",
          "If the verified facts are too sparse to write a useful factual description, return null instead of padding the copy.",
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
  const scanLimit = Math.min(500, Math.max(limit * 8, 100));
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select(LOCATION_FIELDS)
    .eq("active", true)
    .is("deleted_at", null)
    .is("description", null)
    .order("id", { ascending: true })
    .limit(scanLimit);
  if (error) throw error;

  const rows = (data || []) as LocationRow[];
  return rows
    .filter((row) => row.is_demo !== true)
    .filter((row) => (phase === "public" ? isStrongPublicLocation(row) : !isPublicLaunchLocation(row)))
    .slice(0, Math.max(1, Math.min(limit, 25)));
}

export async function runDescriptionBackfillBatch(input: {
  phase: DescriptionBackfillPhase;
  limit?: number;
}) {
  const limit = Math.max(1, Math.min(Number(input.limit || 10), 25));
  if (input.phase === "hidden") {
    const health = await getLaunchCatalogHealth();
    if (health.descriptions.publicStrongMissing > 0) {
      throw new Error("Public launch descriptions must be completed before hidden inventory can be backfilled.");
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
        continue;
      }
      const { error } = await supabaseAdmin
        .from("locations")
        .update({ description: result.description, updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .is("description", null);
      if (error) throw error;
      generated += 1;
    } catch (error) {
      failed += 1;
      const reason = error instanceof Error ? error.message : "unknown_error";
      reasons[reason] = (reasons[reason] || 0) + 1;
    }
  }

  return { phase: input.phase, selected: candidates.length, generated, skipped, failed, reasons };
}

async function countPublicBase() {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("id,active,deleted_at,is_demo,is_searchable,is_hidden,public_visibility_tier,market,data_status,duplicate_status,description,website,phone,address,formatted_address")
    .eq("active", true)
    .is("deleted_at", null);
  if (error) throw error;
  return (data || []) as LocationRow[];
}

export async function getLaunchCatalogHealth() {
  const rows = await countPublicBase();
  const publicRows = rows.filter(isPublicLaunchLocation);
  const strongRows = publicRows.filter(isStrongPublicLocation);
  const publicStrongMissing = strongRows.filter((row) => !text(row.description)).length;
  const hiddenMissing = rows.filter((row) => row.is_demo !== true && !isPublicLaunchLocation(row) && !text(row.description)).length;

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
      publicStrongMissing,
      publicStrongComplete: strongRows.length - publicStrongMissing,
      hiddenMissing,
      publicPhaseComplete: publicStrongMissing === 0,
    },
  };
}
