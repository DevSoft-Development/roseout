import { createHash } from "node:crypto";
import type { EnterpriseLocation, SearchDomain, SearchIntent } from "./types";
import { normalizeIntentTerm, uniq } from "./normalize-intent";

export const SEMANTIC_DOCUMENT_VERSION = "location-semantic-document:v1";
export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_VERSION = "search-embedding:v1";
export const FUSION_VERSION = "rrf:v1:k60";

export type SemanticDocumentResult = {
  semanticDocument: string;
  semanticDocumentHash: string;
  semanticDocumentVersion: string;
  semanticDocumentUpdatedAt: string;
  eligibleForPublicEmbedding: boolean;
  rejectionReasons: string[];
};

type FieldValue = string | string[] | number | boolean | null | undefined | unknown;

function cleanText(value: FieldValue): string {
  if (value == null) return "";
  const raw = Array.isArray(value) ? value.join(", ") : String(value);
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function list(value: FieldValue): string[] {
  if (Array.isArray(value)) return uniq(value.map(cleanText).filter(Boolean));
  const text = cleanText(value);
  if (!text) return [];
  return uniq(text.split(/[,|;]/).map((part) => part.trim()).filter(Boolean));
}

function domainOf(location: EnterpriseLocation): SearchDomain {
  const text = cleanText([
    location.location_type,
    location.primary_category,
    location.cuisine,
    location.cuisine_type,
    location.activity_type,
  ] as unknown as FieldValue).toLowerCase();
  if (/\b(activity|arcade|bowling|museum|gallery|karaoke|hookah|lounge|bar|club|theater|theatre|experience)\b/.test(text) && !/\brestaurant\b/.test(text)) return "activity";
  if (/\b(restaurant|food|cuisine|dining|steakhouse|cafe|café|bakery)\b/.test(text) || location.cuisine || location.cuisine_type) return "restaurant";
  return "any";
}

export function isEligibleForPublicEmbedding(location: EnterpriseLocation): { eligible: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (location.id == null) reasons.push("missing_id");
  if (location.is_searchable === false) reasons.push("not_searchable");
  if (location.is_hidden === true) reasons.push("hidden");
  if (location.active === false) reasons.push("inactive");
  if (location.deleted_at) reasons.push("deleted");
  const status = cleanText(location.status ?? location.data_status).toLowerCase();
  if (/closed|permanent|unsupported|draft|rejected/.test(status)) reasons.push("unsupported_status");
  if (cleanText(location.duplicate_status).toLowerCase().match(/duplicate|secondary|merged/)) reasons.push("duplicate");
  return { eligible: reasons.length === 0, reasons };
}

function addLine(lines: string[], label: string, value: FieldValue) {
  const text = Array.isArray(value) ? list(value).join(", ") : cleanText(value);
  if (text) lines.push(`${label}: ${text}`);
}

export function buildLocationSemanticDocument(location: EnterpriseLocation, now = new Date()): SemanticDocumentResult {
  const eligibility = isEligibleForPublicEmbedding(location);
  const canonicalType = domainOf(location);
  const lines: string[] = [];
  addLine(lines, "Name", location.name ?? location.restaurant_name ?? location.activity_name);
  addLine(lines, "Canonical type", canonicalType);
  addLine(lines, "Primary category", location.primary_category);
  addLine(lines, "Cuisine", location.cuisine ?? location.cuisine_type);
  addLine(lines, "Activity type", location.activity_type);
  addLine(lines, "Location", [location.neighborhood, location.borough, location.city, location.state].filter(Boolean).join(", "));
  addLine(lines, "Vibes", location.vibe_tags ?? location.semantic_tags);
  addLine(lines, "Best for", location.best_for_tags ?? location.date_style_tags ?? location.intent_tags);
  addLine(lines, "Features", location["special_features"] ?? location.tags);
  addLine(lines, "Accessibility", location["accessibility_features"]);
  addLine(lines, "Indoor outdoor", location["indoor_outdoor"] ?? location["setting"]);
  addLine(lines, "Price", location["price_level"] ?? location["price_range"]);
  addLine(lines, "Review themes", location["review_themes"] ?? location["review_keywords"]);
  addLine(lines, "Description", location["approved_description"] ?? location.description);
  addLine(lines, "Search keywords", location.search_keywords);
  const semanticDocument = lines.join("\n");
  const semanticDocumentHash = createHash("sha256").update(`${SEMANTIC_DOCUMENT_VERSION}\n${semanticDocument}`).digest("hex");
  return {
    semanticDocument,
    semanticDocumentHash,
    semanticDocumentVersion: SEMANTIC_DOCUMENT_VERSION,
    semanticDocumentUpdatedAt: now.toISOString(),
    eligibleForPublicEmbedding: eligibility.eligible,
    rejectionReasons: eligibility.reasons,
  };
}

export type NegativeConstraints = { categories: string[]; vibes: string[]; features: string[]; terms: string[] };

export function extractNegativeConstraints(input: string | SearchIntent): NegativeConstraints {
  const raw = typeof input === "string" ? input : input.rawQuery;
  const q = normalizeIntentTerm(raw);
  const categories: string[] = [];
  const vibes: string[] = [];
  const features: string[] = [];
  const terms: string[] = [];
  if (/\b(no|not a|without|nothing)\s+(clubs?|nightclubs?|adult nightlife|bars?)\b/.test(q)) categories.push("club", "nightclub");
  if (/\b(no|without|not too|not)\s+(loud|loud music|dj|dancing)\b/.test(q)) vibes.push("loud", "party", "dance");
  if (/\b(family friendly|teenage|teenagers?|kids?)\b/.test(q)) categories.push("adult-only");
  if (/\b(no alcohol|without alcohol|nothing adult)\b/.test(q)) features.push("alcohol", "adult");
  terms.push(...categories, ...vibes, ...features);
  return { categories: uniq(categories), vibes: uniq(vibes), features: uniq(features), terms: uniq(terms) };
}

export function buildSearchQueryEmbeddingInput(intent: SearchIntent): string {
  const negative = extractNegativeConstraints(intent);
  const lines = [
    intent.rawQuery,
    intent.occasion ? `Occasion: ${intent.occasion}.` : "",
    intent.vibe?.length ? `Desired vibe: ${uniq(intent.vibe).join(", ")}.` : "",
    intent.restaurantIntent?.cuisineTerms?.length ? `Requested cuisine: ${uniq(intent.restaurantIntent.cuisineTerms).join(", ")}.` : "",
    intent.restaurantIntent?.foodTerms?.length ? `Restaurant food intent: ${uniq(intent.restaurantIntent.foodTerms).join(", ")}.` : "",
    intent.activityIntent?.activityTerms?.length ? `Requested activity: ${uniq(intent.activityIntent.activityTerms).join(", ")}.` : "",
    intent.budget ? `Price preference: ${intent.budget}.` : "",
    negative.terms.length ? `Avoid: ${negative.terms.join(", ")}.` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

export function queryEmbeddingCacheKey(intent: SearchIntent, model = EMBEDDING_MODEL, version = EMBEDDING_VERSION): string {
  const normalized = buildSearchQueryEmbeddingInput(intent).toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("sha256").update(`${model}:${version}:${intent.normalizedIntent ?? intent.searchType}:${normalized}`).digest("hex");
}

export type RetrievalCandidate = { locationId: string; score?: number; similarity?: number; embeddingVersion?: string };
export type FusedSearchCandidate = { locationId: string; structuredRank?: number; lexicalRank?: number; semanticRank?: number; structuredScore?: number; lexicalScore?: number; semanticSimilarity?: number; fusionScore: number; retrievalSources: string[]; fusionVersion: string };

export function fuseSearchCandidates({ structuredCandidates = [], lexicalCandidates = [], semanticCandidates = [], k = 60 }: { structuredCandidates?: RetrievalCandidate[]; lexicalCandidates?: RetrievalCandidate[]; semanticCandidates?: RetrievalCandidate[]; k?: number }): FusedSearchCandidate[] {
  const map = new Map<string, FusedSearchCandidate>();
  const merge = (candidate: RetrievalCandidate, source: "structured" | "lexical" | "semantic", rank: number) => {
    const current = map.get(candidate.locationId) ?? { locationId: candidate.locationId, fusionScore: 0, retrievalSources: [], fusionVersion: FUSION_VERSION };
    current.fusionScore += 1 / (k + rank);
    if (!current.retrievalSources.includes(source)) current.retrievalSources.push(source);
    if (source === "structured") { current.structuredRank = rank; current.structuredScore = candidate.score; }
    if (source === "lexical") { current.lexicalRank = rank; current.lexicalScore = candidate.score; }
    if (source === "semantic") { current.semanticRank = rank; current.semanticSimilarity = candidate.similarity ?? candidate.score; }
    map.set(candidate.locationId, current);
  };
  structuredCandidates.forEach((c, i) => merge(c, "structured", i + 1));
  lexicalCandidates.forEach((c, i) => merge(c, "lexical", i + 1));
  semanticCandidates.forEach((c, i) => merge(c, "semantic", i + 1));
  return [...map.values()].sort((a, b) => b.fusionScore - a.fusionScore || (a.lexicalRank ?? 9999) - (b.lexicalRank ?? 9999));
}

export function calculateSemanticRelevance({ semanticSimilarity = 0, structuredEvidence = 0, lexicalEvidence = 0, negativeViolation = false }: { semanticSimilarity?: number; structuredEvidence?: number; lexicalEvidence?: number; negativeViolation?: boolean }): { boost: number; penalties: string[] } {
  const penalties: string[] = [];
  if (negativeViolation) return { boost: 0, penalties: ["negative_constraint_violation"] };
  if (semanticSimilarity < 0.55) return { boost: 0, penalties };
  let boost = Math.min(15, Math.max(0, (semanticSimilarity - 0.55) / 0.45 * 15));
  if (structuredEvidence < 0.25 && lexicalEvidence < 0.25) { boost = Math.min(boost, 6); penalties.push("weak_structured_evidence_cap"); }
  return { boost: Math.round(boost * 100) / 100, penalties };
}

export function searchSemanticCandidates(params: { records: EnterpriseLocation[]; expectedDomain: Exclude<SearchDomain, "mixed" | "any">; resolvedMarket?: string | null; limit?: number }): Array<{ locationId: string; semanticSimilarity: number; embeddingVersion: string }> {
  return params.records
    .filter((record) => isEligibleForPublicEmbedding(record).eligible)
    .filter((record) => domainOf(record) === params.expectedDomain)
    .filter((record) => !params.resolvedMarket || String(record.market ?? "").toLowerCase() === params.resolvedMarket?.toLowerCase())
    .filter((record) => record["embedding_status"] !== "failed" && record["embedding_status"] !== "disabled")
    .sort((a, b) => Number(b["semanticSimilarity"] ?? b.search_score ?? 0) - Number(a["semanticSimilarity"] ?? a.search_score ?? 0))
    .slice(0, params.limit ?? 100)
    .map((record) => ({ locationId: String(record.id), semanticSimilarity: Number(record["semanticSimilarity"] ?? record.search_score ?? 0), embeddingVersion: String(record["embedding_version"] ?? EMBEDDING_VERSION) }));
}
