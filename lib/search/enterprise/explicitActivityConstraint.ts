import {
  canonicalTaxonomy,
  type CanonicalTaxonomyEntry,
} from "@/lib/search/v2/taxonomy";
import type { EnterpriseLocation } from "./types";

export type ExplicitActivityConstraint = Readonly<{
  applied: boolean;
  requestedIds: readonly string[];
  matchedAliases: readonly string[];
}>;

type AliasSpan = Readonly<{
  entry: CanonicalTaxonomyEntry;
  alias: string;
  start: number;
  end: number;
}>;

const ACTIVITY_DOMAINS = new Set(["activity", "nightlife"]);
const CANDIDATE_EVIDENCE_FIELDS = [
  "name",
  "restaurant_name",
  "activity_name",
  "activity_type",
  "primary_category",
  "category",
  "categories",
  "subcategories",
  "google_types",
  "osm_tags",
  "primary_tag",
  "source_category",
  "source_categories",
  "provider_category",
  "provider_categories",
  "provider_types",
  "canonical_category",
  "canonical_categories",
  "canonical_activity_type",
  "verified_category",
  "verified_categories",
  "place_types",
  "tags",
  "search_terms",
  "search_keywords",
  "amenities",
  "features",
  "vibe_tags",
  "best_for_tags",
  "date_style_tags",
  "semantic_tags",
  "intent_tags",
  "description",
  "search_document",
  "semantic_search_text",
] as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesPhrase(text: string, phrase: string): boolean {
  const normalizedText = normalizeText(text);
  const normalizedPhrase = normalizeText(phrase);
  if (!normalizedPhrase) return false;
  return new RegExp(
    `(^|[^a-z0-9])${escapeRegExp(normalizedPhrase)}(?=$|[^a-z0-9])`,
    "i",
  ).test(normalizedText);
}

function flattenEvidence(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap(flattenEvidence);
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => [
      key,
      ...flattenEvidence(item),
    ]);
  }
  return [String(value)];
}

function candidateEvidenceText(candidate: EnterpriseLocation): string {
  return CANDIDATE_EVIDENCE_FIELDS.flatMap((field) =>
    flattenEvidence((candidate as Record<string, unknown>)[field]),
  )
    .map(normalizeText)
    .filter(Boolean)
    .join(" ");
}

function activityEntries(): readonly CanonicalTaxonomyEntry[] {
  return canonicalTaxonomy.filter((entry) => ACTIVITY_DOMAINS.has(entry.domain));
}

function aliasSpans(query: string): AliasSpan[] {
  const spans: AliasSpan[] = [];
  for (const entry of activityEntries()) {
    for (const alias of entry.aliases) {
      const pattern = new RegExp(
        `(^|[^a-z0-9])(${escapeRegExp(alias)})(?=$|[^a-z0-9])`,
        "gi",
      );
      for (const match of query.matchAll(pattern)) {
        const prefix = match[1] ?? "";
        const matchedAlias = match[2] ?? alias;
        const start = (match.index ?? 0) + prefix.length;
        spans.push({
          entry,
          alias: matchedAlias.toLowerCase(),
          start,
          end: start + matchedAlias.length,
        });
      }
    }
  }
  return spans;
}

function nonOverlappingLongestMatches(query: string): AliasSpan[] {
  const selected: AliasSpan[] = [];
  const spans = aliasSpans(query).sort((left, right) => {
    const lengthDelta = right.end - right.start - (left.end - left.start);
    return lengthDelta || left.start - right.start;
  });

  for (const span of spans) {
    const overlaps = selected.some(
      (existing) => span.start < existing.end && existing.start < span.end,
    );
    if (!overlaps) selected.push(span);
  }

  return selected.sort((left, right) => left.start - right.start);
}

export function resolveExplicitActivityConstraint(
  query: string,
): ExplicitActivityConstraint {
  const selected = nonOverlappingLongestMatches(String(query || ""));
  const requestedIds = Array.from(new Set(selected.map((span) => span.entry.id)));
  const matchedAliases = Array.from(new Set(selected.map((span) => span.alias)));
  return {
    applied: requestedIds.length > 0,
    requestedIds,
    matchedAliases,
  };
}

export function candidateMatchesExplicitActivityConstraint(
  candidate: EnterpriseLocation,
  constraint: ExplicitActivityConstraint,
): boolean {
  if (!constraint.applied) return true;
  const evidence = candidateEvidenceText(candidate);
  if (!evidence) return false;

  const requested = new Set(constraint.requestedIds);
  return activityEntries().some((entry) => {
    if (!requested.has(entry.id)) return false;
    const terms = Array.from(
      new Set([
        entry.id.replaceAll("_", " "),
        ...entry.aliases,
        ...entry.retrievalTerms,
        ...entry.relatedCategories,
      ]),
    );
    return terms.some((term) => includesPhrase(evidence, term));
  });
}
