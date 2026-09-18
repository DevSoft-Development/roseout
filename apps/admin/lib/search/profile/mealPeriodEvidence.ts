const MEAL_PERIOD_IDS = new Set(["breakfast", "brunch", "lunch", "dinner"]);

const normalize = (value: string) => value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");

export function filterWeakMealPeriodFeatures(
  values: string[],
  googleMealPeriods: string[],
  googleMealServiceCheckedAt: unknown,
) {
  const checked = typeof googleMealServiceCheckedAt === "string" && googleMealServiceCheckedAt.trim().length > 0;
  if (!checked) return values;

  const confirmed = new Set(googleMealPeriods.map(normalize));
  return values.filter((value) => {
    const normalized = normalize(value);
    return !MEAL_PERIOD_IDS.has(normalized) || confirmed.has(normalized);
  });
}
