import "server-only";
import OpenAI from "openai";
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
  llmRewriteApplied: boolean;
};

function contextualRewrite(query: string, relationship: ReturnType<typeof detectVenueRelationship>) {
  let effective = query.trim();
  if (relationship.sameVenueFeature && /\b(?:hookah|shisha)\b/i.test(query)) {
    effective = `${effective} no activity pairing`;
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
  const relationship = detectVenueRelationship(query);
  const negatives = extractNegativeConstraints(query);
  const preferences = extractSubjectivePreferences(query);
  const baseAmbiguity = ambiguityReasons(query, relationship, /\b(?:restaurant|dinner|food|brunch|lunch|breakfast|cuisine|eat)\b/i.test(query), /\b(?:activity|bowling|karaoke|arcade|museum|hookah|comedy|lounge|nightclub|something fun)\b/i.test(query));
  let effectiveQuery = contextualRewrite(query, relationship);
  let llmUsed = false;
  let llmModel: string | null = null;
  let llmConfidence: number | null = null;
  let llmRewriteApplied = false;

  const clarified = await llmClarify(query, baseAmbiguity);
  if (clarified) {
    llmUsed = true;
    llmModel = clarified.model;
    llmConfidence = Number(clarified.parsed?.confidence ?? 0);
    if (clarified.parsed?.relationship === "same_venue_required" && /\b(?:restaurant|dinner|food|dining)\b/i.test(query)) {
      if (!/\bno activity pairing\b/i.test(effectiveQuery)) effectiveQuery = `${effectiveQuery} no activity pairing`;
      llmRewriteApplied = effectiveQuery !== query;
    }
  }

  return { originalQuery: query, effectiveQuery, relationship, negatives, preferences, ambiguityReasons: baseAmbiguity, llmUsed, llmModel, llmConfidence, llmRewriteApplied };
}

function textOf(location: any) {
  return [location?.name, location?.restaurant_name, location?.activity_name, location?.location_type, location?.primary_category, location?.activity_type, location?.cuisine, location?.cuisine_type, ...(Array.isArray(location?.tags) ? location.tags : []), ...(Array.isArray(location?.features) ? location.features : [])]
    .filter(Boolean).join(" ").toLowerCase().replace(/[_-]+/g, " ");
}

function violates(location: any, terms: readonly string[]) {
  const text = textOf(location);
  return terms.some((term) => text.includes(String(term).toLowerCase().replace(/[_-]+/g, " ")));
}

export function applyLanguageConstraintsToResponse(response: any, diagnostics: LanguageRuntimeDiagnostics) {
  const out = response as any;
  const neg = diagnostics.negatives;
  if (Array.isArray(out.restaurants) && neg.restaurant.length) out.restaurants = out.restaurants.filter((row: any) => !violates(row, neg.restaurant));
  if (Array.isArray(out.activities) && neg.activity.length) out.activities = out.activities.filter((row: any) => !violates(row, neg.activity));
  if (Array.isArray(out.sameVenueResults) && [...neg.restaurant, ...neg.activity].length) out.sameVenueResults = out.sameVenueResults.filter((row: any) => !violates(row, [...neg.restaurant, ...neg.activity]));
  if (Array.isArray(out.pairs) && [...neg.restaurant, ...neg.activity].length) out.pairs = out.pairs.filter((pair: any) => !violates(pair.restaurant, neg.restaurant) && !violates(pair.activity, neg.activity));

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
  if (debug?.pairingDiagnostics?.primaryFailure || response?.requestedMode === "paired_outing" && Number(response?.counts?.pairs ?? 0) === 0) return "PAIRING_ERROR";
  if (diagnostics.ambiguityReasons.length && diagnostics.llmUsed && (diagnostics.llmConfidence ?? 1) < 0.65) return "INTENT_ERROR";
  if (diagnostics.relationship.type === "unknown") return "RELATIONSHIP_ERROR";
  if (debug?.inventoryAudit?.status === "confirmed_gap") return "INVENTORY_GAP";
  if (Number(response?.counts?.displayedResults ?? 0) === 0) return "HARD_CONSTRAINT_FAILURE";
  return "RANKING_ERROR";
}
