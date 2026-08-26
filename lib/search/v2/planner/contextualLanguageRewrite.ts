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

const BROAD_DATE_PATTERN =
  /\b(?:date night|first date|romantic date|anniversary date|couples night|double date)\b/i;

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

export function contextualRewrite(
  query: string,
  relationship: RelationshipLike,
  negatives: NegativeConstraintsLike,
  preferences: SubjectivePreferencesLike,
) {
  let effective = rewriteSpecificTaxonomyPhrases(query);

  // Hard exclusions are carried separately into SearchPlan. Removing the
  // negative clause must not add a synthetic positive domain signal such as
  // "another activity" or "other food", because that can change the mode.
  effective = stripExplicitNegativeClauses(effective, negatives.restaurant);
  effective = stripExplicitNegativeClauses(effective, negatives.activity);
  effective = normalizeNaturalLanguageForPlanner(effective);

  const hasRestaurantSignal =
    /\b(?:restaurant|restaurants|dinner|food|brunch|lunch|breakfast|cuisine|eat|dining|steakhouse|seafood|sushi|italian|mexican|halal|vegan)\b/i.test(
      effective,
    );
  const hasActivitySignal =
    /\b(?:activity|activities|bowling|karaoke|arcade|museum|hookah|comedy|lounge|nightclub|live music|jazz|mini golf|something fun|things to do|drinks?|cocktails?|bar)\b/i.test(
      effective,
    );
  const broadDateRequest = BROAD_DATE_PATTERN.test(effective);
  const preferenceOnlyRequest =
    !hasRestaurantSignal &&
    !hasActivitySignal &&
    !broadDateRequest &&
    Boolean(
      preferences.budget ||
        preferences.noise ||
        preferences.vibes.length ||
        preferences.subjectiveTerms.length,
    );

  if (preferenceOnlyRequest) effective = `${effective} restaurant`.trim();
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
