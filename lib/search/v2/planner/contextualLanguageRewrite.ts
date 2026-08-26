import { normalizeNaturalLanguageForPlanner } from "./naturalLanguageNormalization";
import { rewriteSpecificTaxonomyPhrases } from "./taxonomySpecificity";

type RelationshipLike = Readonly<{ type: string }>;
type NegativeConstraintsLike = Readonly<{
  restaurant: readonly string[];
  activity: readonly string[];
}>;
type SubjectivePreferencesLike = Readonly<{
  budget: unknown;
  noise: unknown;
  vibes: readonly string[];
  subjectiveTerms: readonly string[];
}>;

const uniq = (items: string[]) => [
  ...new Set(items.map((item) => String(item).trim()).filter(Boolean)),
];

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function negativeTermPattern(rawTerm: string) {
  const words = String(rawTerm)
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/g)
    .filter(Boolean);
  if (!words.length) return "";
  const last = words.pop()!;
  const prefix = words.map(escapeRegex).join("\\s+");
  const finalWord = `${escapeRegex(last)}(?:s|es)?`;
  return prefix ? `${prefix}\\s+${finalWord}` : finalWord;
}

function stripExplicitNegativeClauses(
  query: string,
  terms: readonly string[],
) {
  const patterns = uniq(terms.map(negativeTermPattern).filter(Boolean));
  if (!patterns.length) return query;
  const term = `(?:${patterns.join("|")})`;
  const item = `(?:a\\s+|an\\s+|the\\s+)?${term}`;
  const list = `${item}(?:\\s*(?:,|or|and)\\s*${item})*`;
  return query
    .replace(
      new RegExp(
        `\\b(?:no|not|without|anything\\s+but|except)\\s+${list}\\b`,
        "gi",
      ),
      "",
    )
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;!?])/g, "$1")
    .trim();
}

export function inferPreferenceDefaultLane(
  preferences: SubjectivePreferencesLike,
): "restaurant" | null {
  return preferences.budget ||
    preferences.noise ||
    preferences.vibes.length ||
    preferences.subjectiveTerms.length
    ? "restaurant"
    : null;
}

export function contextualRewrite(
  query: string,
  relationship: RelationshipLike,
  negatives: NegativeConstraintsLike,
) {
  let effective = rewriteSpecificTaxonomyPhrases(query);

  // Search-wide invariant: preprocessing may remove a hard negative clause,
  // but it must never replace that clause with a positive domain token. The
  // exclusion travels separately into SearchPlan and final response guards.
  effective = stripExplicitNegativeClauses(effective, negatives.restaurant);
  effective = stripExplicitNegativeClauses(effective, negatives.activity);
  effective = normalizeNaturalLanguageForPlanner(effective);

  // Relationship normalization may make an already-detected relationship
  // explicit, but domain selection is never inferred by mutating the query.
  if (
    relationship.type === "same_venue_required" &&
    !/\b(?:same (?:venue|place)|one (?:venue|place)|under one roof|all in one place)\b/i.test(
      effective,
    )
  ) {
    effective = `${effective} same venue`.trim();
  }
  return effective;
}
