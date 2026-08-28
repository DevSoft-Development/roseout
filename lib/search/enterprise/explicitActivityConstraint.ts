import {
  canonicalTaxonomy,
  type CanonicalTaxonomyEntry,
} from "../v2/taxonomy";
import { extractNegativeConstraints } from "../v2/planner/languageUnderstanding";
import type { EnterpriseLocation } from "./types";
import { qualifyExplicitActivityIntent } from "./taxonomy";

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
const AMBIGUOUS_QUERY_ALIASES = new Set(["show"]);
const NEGATIVE_MODIFIER_PATTERN = /\b(?:loud|noisy|rowdy|clubby|party)\s*$/i;
const NEGATION_CONTEXT_PATTERN = /\b(?:no|not|without|nothing|anything\s+but|except|isn't|is\s+not|aren't|are\s+not)\b[^.;!?]*$/i;
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

function requestedEntryTerms(entry: CanonicalTaxonomyEntry) {
  return Array.from(
    new Set([
      entry.id.replaceAll("_", " "),
      ...entry.aliases,
      ...entry.retrievalTerms,
      ...entry.relatedCategories,
    ]),
  );
}

function aliasSpans(query: string): AliasSpan[] {
  const spans: AliasSpan[] = [];
  for (const entry of activityEntries()) {
    for (const alias of entry.aliases) {
      if (AMBIGUOUS_QUERY_ALIASES.has(normalizeText(alias))) continue;
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

function isModifierScopedNegativeSpan(query: string, span: AliasSpan) {
  const clauseStart = Math.max(
    query.lastIndexOf(".", span.start - 1),
    query.lastIndexOf(";", span.start - 1),
    query.lastIndexOf("!", span.start - 1),
    query.lastIndexOf("?", span.start - 1),
  );
  const before = query.slice(clauseStart + 1, span.start);
  return NEGATIVE_MODIFIER_PATTERN.test(before) && NEGATION_CONTEXT_PATTERN.test(before);
}

export function resolveExplicitActivityConstraint(
  query: string,
): ExplicitActivityConstraint {
  const rawQuery = String(query || "");
  const excludedIds = new Set(
    extractNegativeConstraints(rawQuery).activity.map((value) => normalizeText(value).replaceAll(" ", "_")),
  );
  const selected = nonOverlappingLongestMatches(rawQuery).filter(
    (span) => !excludedIds.has(span.entry.id) && !isModifierScopedNegativeSpan(rawQuery, span),
  );
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

  const requested = new Set(constraint.requestedIds);
  const requestedEntries = activityEntries().filter((entry) => requested.has(entry.id));
  const evidence = candidateEvidenceText(candidate);
  if (!evidence || !requestedEntries.length) return false;

  const hasRequestedEvidence = requestedEntries.some((entry) =>
    requestedEntryTerms(entry).some((term) => includesPhrase(evidence, term)),
  );
  if (!hasRequestedEvidence) return false;

  const structuredTerms = constraint.requestedIds.map((id) => id.replaceAll("_", " "));
  const qualification = qualifyExplicitActivityIntent(candidate, structuredTerms);
  if (qualification.matches) return true;

  // Some categories (for example park/playground) are intentionally treated as
  // conflicts when a different explicit activity is requested. They must not,
  // however, reject themselves when that exact category is the user's request.
  if (qualification.reason !== "conflicting_authoritative_category") return false;
  const conflicts = qualification.conflictingTrustedEvidence ?? [];
  if (!conflicts.length) return false;

  return conflicts.every((conflict) =>
    requestedEntries.some((entry) =>
      requestedEntryTerms(entry).some((term) => includesPhrase(conflict, term)),
    ),
  );
}
