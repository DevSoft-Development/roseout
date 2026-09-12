export type HomepagePlanType = "outing" | "restaurant" | "activity";

const RESTAURANT_INTENT = /\b(?:restaurant|restaurants|dinner|lunch|brunch|breakfast|eat|eating|food|meal|cuisine|steak|steakhouse|lobster|seafood|sushi|ramen|japanese|korean|thai|vietnamese|chinese|indian|italian|mexican|peruvian|dominican|puerto\s+rican|cuban|jamaican|haitian|caribbean|latin|soul\s+food|bbq|barbecue|burger|burgers|wings|chicken|vegan|vegetarian|halal|kosher|cafe|bakery|dessert|pizza|tacos?|cocktails?|drinks?|rooftop\s+drinks?)\b/i;

const ACTIVITY_INTENT = /\b(?:activity|activities|something\s+(?:fun\s+)?to\s+do|bowling|arcade|museum|karaoke|escape\s+room|mini\s+golf|axe\s+throwing|comedy|cinema|movie|movies|spa|billiards|pool\s+hall|jazz|live\s+music|nightclub|hookah\s+lounge|cigar\s+lounge|park|art\s+gallery|theater|theatre|show|concert|game|games|kayak|sailing|cruise|pitch\s*&?\s*putt)\b/i;

/**
 * Homepage search starts from free-form language, so do not force a paired outing
 * unless the customer actually asks for both domains (or stays ambiguous).
 * The server-side planner remains the source of truth after this lane hint.
 */
export function inferHomepagePlanType(query: string): HomepagePlanType {
  const normalized = query.trim();
  const wantsRestaurant = RESTAURANT_INTENT.test(normalized);
  const wantsActivity = ACTIVITY_INTENT.test(normalized);

  if (wantsRestaurant && !wantsActivity) return "restaurant";
  if (wantsActivity && !wantsRestaurant) return "activity";
  return "outing";
}
