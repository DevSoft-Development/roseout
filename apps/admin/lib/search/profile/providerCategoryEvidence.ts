type ProviderCategoryEvidenceInput = {
  name?: unknown;
  activityName?: unknown;
  locationType?: unknown;
  activityType?: unknown;
  primaryCategory?: unknown;
  category?: unknown;
  primaryTag?: unknown;
  googlePrimaryType?: unknown;
  googleTypes?: unknown;
};

const text = (value: unknown) => (typeof value === "string" ? value.trim().toLowerCase() : "");

const textArray = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean)
    : [];

const COMPETING_SPORTS_TYPES = new Set([
  "fitness_center",
  "gym",
  "sports_activity_location",
  "sports_complex",
  "sports_school",
]);

/**
 * Google Places types are supporting provider evidence, not canonical identity.
 * Some sports venues receive a secondary `yoga_studio` type even when their
 * canonical identity is unrelated (for example, a climbing gym). Do not let
 * that secondary provider label become a canonical yoga classification unless
 * the location itself contains explicit yoga identity.
 */
export function filterProviderCategoryTypes(input: ProviderCategoryEvidenceInput): string[] {
  const googleTypes = textArray(input.googleTypes);
  if (!googleTypes.includes("yoga_studio")) return googleTypes;

  const identityText = [
    input.name,
    input.activityName,
    input.locationType,
    input.activityType,
    input.primaryCategory,
    input.category,
    input.primaryTag,
    input.googlePrimaryType,
  ]
    .map(text)
    .filter(Boolean)
    .join(" ");

  const hasExplicitYogaIdentity = /(^|\W)yoga(\W|$)/i.test(identityText);
  const hasCompetingSportsIdentity = googleTypes.some((value) => COMPETING_SPORTS_TYPES.has(value));

  if (hasCompetingSportsIdentity && !hasExplicitYogaIdentity) {
    return googleTypes.filter((value) => value !== "yoga_studio");
  }

  return googleTypes;
}
