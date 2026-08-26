import "server-only";
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { detectVenueRelationship, extractNegativeConstraints, extractSubjectivePreferences, ambiguityReasons } from "./planner/languageUnderstanding";

export type LanguageRuntimeDiagnostics = {
  originalQuery: string;
  effectiveQuery: string;
  relationship: ReturnType<typeof detectVenueRelationship>;
  negatives: ReturnType<typeof extractNegativeConstraints>;
  preferences: ReturnType<typeof extractSubjectivePreferences>;
  ambiguityReasons: string[];
  llmUsed: boolean;
  llmModel: string | null;
  llmConfidence: number | null;
  llmRelationship: string | null;
  llmSoftVibes: string[];
  llmAvoidTerms: string[];
  llmRewriteApplied: boolean;
};

const uniq = (items: string[]) => [...new Set(items.map((item) => String(item).trim()).filter(Boolean))];
const normalizePhrase = (value: string) => value.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9'\s-]+/g, " ").replace(/\s+/g, " ").trim();
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function stripExplicitNegativePhrases(query: string, terms: readonly string[], replacement: string) {
  return terms.reduce((current, rawTerm) => {
    const term = String(rawTerm).toLowerCase().replace(/[_-]+/g, " ").trim();
    if (!term) return current;
    const escaped = escapeRegex(term).replace(/\s+/g, "\\s+");
    return current.replace(new RegExp(`\\b(?:no|not|without|anything\\s+but|except)\\s+(?:a\\s+|an\\s+)?${escaped}\\b`, "gi"), replacement);
  }, query).replace(/\s+/g, " ").replace(/\s+([,.;!?])/g, "$1").trim();
}

function contextualRewrite(
  query: string,
  relationship: ReturnType<typeof detectVenueRelationship>,
  negatives: ReturnType<typeof extractNegativeConstraints>,
  preferences: ReturnType<typeof extractSubjectivePreferences>,
) {
  let effective = stripExplicitNegativePhrases(query, negatives.restaurant, "other food");
  effective = stripExplicitNegativePhrases(effective, negatives.activity, "another activity");
  const hasRestaurantSignal = /\b(?:restaurant|restaurants|dinner|food|brunch|lunch|breakfast|cuisine|eat|dining|steakhouse|seafood|sushi|italian|mexican|halal|vegan)\b/i.test(effective);
  const hasActivitySignal = /\b(?:activity|activities|bowling|karaoke|arcade|museum|hookah|comedy|lounge|nightclub|live music|jazz|mini golf|something fun|things to do|drinks?|cocktails?|bar)\b/i.test(effective);
  const preferenceOnlyRequest = !hasRestaurantSignal && !hasActivitySignal && Boolean(preferences.budget || preferences.noise || preferences.vibes.length || preferences.subjectiveTerms.length);

  if (preferenceOnlyRequest) effective = `${effective} restaurant`.trim();
  if (relationship.type === "same_venue_required" && !/\b(?:same (?:venue|place)|one (?:venue|place)|under one roof|all in one place)\b/i.test(effective)) {
    effective = `${effective} same venue`.trim();
  }
  return effective;
}

async function llmClarify(query: string, reasons: string[]) {
  if (!process.env.OPENAI_API_KEY || reasons.length === 0) return null;
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.SEARCH_NLP_MODEL || "gpt-5.4-nano";
    const response = await client.responses.create({
      model,
      store: false,
      input: [
        {
          role: "system",
          content: [
            "You are TheOutHaven search intent disambiguation layer.",
            "Return only structured intent. Never recommend, invent, or name a venue.",
            "Never change an explicit place, cuisine, food, activity, date, time, exclusion, distance, or party size.",
            "Only clarify whether words describe the same venue, a second stop, a soft preference, or a negative constraint.",
            "A phrase like 'restaurant with hookah' or 'hookah restaurant' means one restaurant with hookah, not a separate activity.",
            "A phrase like 'dinner then hookah' means separate sequential stops.",
          ].join(" "),
        },
        { role: "user", content: `Query: ${query}\nAmbiguity signals: ${reasons.join(", ")}` },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "theouthaven_search_disambiguation",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              relationship: { type: "string", enum: ["same_venue_required", "same_venue_preferred", "sequential", "proximity", "separate_venues", "any", "unknown"] },
              same_venue_feature_terms: { type: "array", items: { type: "string" }, maxItems: 8 },
              soft_vibes: { type: "array", items: { type: "string" }, maxItems: 8 },
              avoid_terms: { type: "array", items: { type: "string" }, maxItems: 8 },
              confidence: { type: "number", minimum: 0, maximum: 1 },
            },
            required: ["relationship", "same_venue_feature_terms", "soft_vibes", "avoid_terms", "confidence"],
          },
        },
      },
    });
    const parsed = JSON.parse(response.output_text || "{}");
    return { model, parsed };
  } catch (error) {
    console.warn("Search NLP clarification failed", error);
    return null;
  }
}

export async function understandSearchQuery(query: string): Promise<LanguageRuntimeDiagnostics> {
  let relationship = detectVenueRelationship(query);
  const negatives = extractNegativeConstraints(query);
  const preferences = extractSubjectivePreferences(query);
  const baseAmbiguity = ambiguityReasons(query, relationship, /\b(?:restaurant|dinner|food|brunch|lunch|breakfast|cuisine|eat)\b/i.test(query), /\b(?:activity|bowling|karaoke|arcade|museum|hookah|comedy|lounge|nightclub|something fun)\b/i.test(query));
  let llmUsed = false;
  let llmModel: string | null = null;
  let llmConfidence: number | null = null;
  let llmRelationship: string | null = null;
  let llmSoftVibes: string[] = [];
  let llmAvoidTerms: string[] = [];

  const clarified = await llmClarify(query, baseAmbiguity);
  if (clarified) {
    llmUsed = true;
    llmModel = clarified.model;
    llmConfidence = Number(clarified.parsed?.confidence ?? 0);
    llmRelationship = typeof clarified.parsed?.relationship === "string" ? clarified.parsed.relationship : null;
    llmSoftVibes = uniq(Array.isArray(clarified.parsed?.soft_vibes) ? clarified.parsed.soft_vibes.map(String) : []);
    llmAvoidTerms = uniq(Array.isArray(clarified.parsed?.avoid_terms) ? clarified.parsed.avoid_terms.map(String) : []);

    if (
      llmConfidence >= 0.75 &&
      relationship.type === "any" &&
      ["same_venue_required", "same_venue_preferred", "sequential", "proximity", "separate_venues"].includes(String(llmRelationship))
    ) {
      relationship = {
        ...relationship,
        type: llmRelationship as Exclude<ReturnType<typeof detectVenueRelationship>["type"], "any">,
        evidence: uniq([...relationship.evidence, "llm_disambiguated_relationship"]),
      };
    }
  }

  preferences.vibes = uniq([...preferences.vibes, ...llmSoftVibes]);
  preferences.subjectiveTerms = uniq([...preferences.subjectiveTerms, ...llmSoftVibes]);
  negatives.vibes = uniq([...negatives.vibes, ...llmAvoidTerms]);

  const effectiveQuery = contextualRewrite(query, relationship, negatives, preferences);
  const llmRewriteApplied = effectiveQuery !== query;

  return {
    originalQuery: query,
    effectiveQuery,
    relationship,
    negatives,
    preferences,
    ambiguityReasons: baseAmbiguity,
    llmUsed,
    llmModel,
    llmConfidence,
    llmRelationship,
    llmSoftVibes,
    llmAvoidTerms,
    llmRewriteApplied,
  };
}

export async function recordLanguageLearningSuggestion(supabase: SupabaseClient, diagnostics: LanguageRuntimeDiagnostics) {
  if (!diagnostics.llmUsed || !diagnostics.ambiguityReasons.length || (diagnostics.llmConfidence ?? 0) < 0.75) return;
  const phraseKey = normalizePhrase(diagnostics.originalQuery).slice(0, 180);
  if (!phraseKey) return;

  try {
    const { data: existing } = await supabase
      .from("search_phrase_learning_suggestions")
      .select("id,query_count,example_queries")
      .eq("phrase_key", phraseKey)
      .eq("status", "pending")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const suggestedIntent = {
      relationship: diagnostics.relationship.type,
      ambiguity_reasons: diagnostics.ambiguityReasons,
      parser: "hybrid",
      llm_model: diagnostics.llmModel,
    };
    const examples = uniq([...(Array.isArray(existing?.example_queries) ? existing.example_queries.map(String) : []), diagnostics.originalQuery]).slice(0, 5);
    const patch = {
      display_phrase: diagnostics.originalQuery.slice(0, 180),
      example_queries: examples,
      query_count: Number(existing?.query_count ?? 0) + 1,
      suggested_intent: suggestedIntent,
      suggested_vibes: diagnostics.preferences.vibes,
      suggested_exclusions: uniq([...diagnostics.negatives.restaurant, ...diagnostics.negatives.activity, ...diagnostics.negatives.vibes]),
      confidence_score: Number(diagnostics.llmConfidence ?? 0),
      support_score: Math.max(1, Number(existing?.query_count ?? 0) + 1),
      source: "search_nlp_llm_disambiguation",
      updated_at: new Date().toISOString(),
    };

    if (existing?.id) {
      await supabase.from("search_phrase_learning_suggestions").update(patch).eq("id", existing.id);
    } else {
      await supabase.from("search_phrase_learning_suggestions").insert({
        phrase_key: phraseKey,
        status: "pending",
        created_at: new Date().toISOString(),
        ...patch,
      });
    }
  } catch (error) {
    console.warn("Search NLP learning suggestion write failed", error);
  }
}

function textOf(location: any) {
  return [location?.name, location?.restaurant_name, location?.activity_name, location?.location_type, location?.primary_category, location?.activity_type, location?.cuisine, location?.cuisine_type, ...(Array.isArray(location?.tags) ? location.tags : []), ...(Array.isArray(location?.features) ? location.features : [])]
    .filter(Boolean).join(" ").toLowerCase().replace(/[_-]+/g, " ");
}

function violates(location: any, terms: readonly string[]) {
  const text = textOf(location);
  return terms.some((term) => text.includes(String(term).toLowerCase().replace(/[_-]+/g, " ")));
}

function sameLocation(left: any, right: any) {
  const leftId = String(left?.id ?? left?.location_id ?? "");
  const rightId = String(right?.id ?? right?.location_id ?? "");
  return Boolean(leftId && rightId && leftId === rightId);
}

export function applyLanguageConstraintsToResponse(response: any, diagnostics: LanguageRuntimeDiagnostics) {
  const out = response as any;
  const neg = diagnostics.negatives;
  if (Array.isArray(out.restaurants) && neg.restaurant.length) out.restaurants = out.restaurants.filter((row: any) => !violates(row, neg.restaurant));
  if (Array.isArray(out.activities) && neg.activity.length) out.activities = out.activities.filter((row: any) => !violates(row, neg.activity));
  if (Array.isArray(out.sameVenueResults) && [...neg.restaurant, ...neg.activity].length) out.sameVenueResults = out.sameVenueResults.filter((row: any) => !violates(row, [...neg.restaurant, ...neg.activity]));
  if (Array.isArray(out.pairs) && [...neg.restaurant, ...neg.activity].length) out.pairs = out.pairs.filter((pair: any) => !violates(pair.restaurant, neg.restaurant) && !violates(pair.activity, neg.activity));
  if (diagnostics.relationship.type === "same_venue_required" && Array.isArray(out.pairs)) {
    out.pairs = out.pairs.filter((pair: any) => sameLocation(pair.restaurant, pair.activity));
  }

  if (out.counts) {
    out.counts = {
      ...out.counts,
      restaurantCards: Array.isArray(out.restaurants) ? out.restaurants.length : out.counts.restaurantCards,
      activityCards: Array.isArray(out.activities) ? out.activities.length : out.counts.activityCards,
      sameVenueCards: Array.isArray(out.sameVenueResults) ? out.sameVenueResults.length : out.counts.sameVenueCards,
      pairs: Array.isArray(out.pairs) ? out.pairs.length : out.counts.pairs,
    };
  }
  out.debug = {
    ...(out.debug ?? {}),
    nlp: diagnostics,
    failureCategory: out.success ? null : classifyFailure(out, diagnostics),
  };
  return out;
}

export function classifyFailure(response: any, diagnostics: LanguageRuntimeDiagnostics) {
  const debug = response?.debug ?? {};
  if (debug?.anchorResolution?.status === "not_found" || response?.outcome === "anchor_not_found") return "GEO_ERROR";
  if (diagnostics.relationship.type === "same_venue_required" && Number(response?.counts?.pairs ?? 0) === 0 && Number(response?.counts?.sameVenueCards ?? 0) === 0) return "RELATIONSHIP_ERROR";
  if (debug?.pairingDiagnostics?.primaryFailure || response?.requestedMode === "paired_outing" && Number(response?.counts?.pairs ?? 0) === 0) return "PAIRING_ERROR";
  if (diagnostics.ambiguityReasons.length && diagnostics.llmUsed && (diagnostics.llmConfidence ?? 1) < 0.65) return "INTENT_ERROR";
  if (debug?.inventoryAudit?.status === "confirmed_gap") return "INVENTORY_GAP";
  if (Number(response?.counts?.displayedResults ?? 0) === 0) return "HARD_CONSTRAINT_FAILURE";
  return "RANKING_ERROR";
}
