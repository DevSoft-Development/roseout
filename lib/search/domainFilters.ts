import type { EnterpriseLocation, EnterprisePair, SearchIntent } from "./enterprise/types";

function textFrom(record: EnterpriseLocation, fields: string[]) {
  return fields
    .map((field) => {
      const value = (record as any)[field];
      return Array.isArray(value) ? value.join(" ") : String(value ?? "");
    })
    .join(" ")
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");
}

function explicitType(record: EnterpriseLocation) {
  return textFrom(record, ["location_type", "source_table", "type"]);
}

const ACTIVITY_ONLY_RE =
  /\b(activity|activities|nightlife|night club|nightclub|dance club|club|lounge|hookah|cigar|karaoke|bowling|arcade|escape room|mini golf|museum|gallery|theater|theatre|cinema|movie theater|park|garden|zoo|aquarium|spa|wellness|gym|fitness|concert|venue)\b/;
const RESTAURANT_RE =
  /\b(restaurant|restaurants|dining|eatery|bistro|brasserie|steakhouse|seafood|sushi|pizzeria|pizza|taqueria|tacos|mexican|italian|chinese|thai|indian|korean|japanese|caribbean|cuisine|food|grill|bar and grill|gastropub|pub|tavern|cafe|bakery|brunch|lunch|dinner)\b/;
const BAR_ACTIVITY_RE = /\b(bar|pub|tavern|cocktail|lounge|nightlife|rooftop|speakeasy|hookah|sports bar)\b/;

function queryAllowsBarAsActivity(intent: SearchIntent) {
  const text = [
    intent.rawQuery,
    ...(intent.activityIntent?.activityTerms ?? []),
    ...(intent.activityIntent?.categoryTerms ?? []),
    ...(intent.activityIntent?.featureTerms ?? []),
  ].join(" ").toLowerCase();
  return /\b(bar|drinks|cocktails|lounge|nightlife|rooftop drinks|hookah|sports bar|watch (?:the )?game|game watch)\b/.test(
    text,
  );
}

export function isRestaurantDomainResult(
  record: EnterpriseLocation,
  intent?: SearchIntent,
) {
  const type = explicitType(record);
  const activityType = String((record as any).activity_type ?? "").trim();
  const category = textFrom(record, [
    "primary_category",
    "category",
    "cuisine",
    "cuisine_type",
    "food_type",
    "restaurant_name",
    "name",
    "tags",
    "semantic_tags",
    "intent_tags",
    "search_keywords",
    "search_document",
    "semantic_search_text",
    "description",
  ]);

  const queryText = [
    intent?.rawQuery,
    ...(intent?.restaurantIntent?.mealTerms ?? []),
    ...(intent?.restaurantIntent?.foodTerms ?? []),
    ...(intent?.restaurantIntent?.cuisineTerms ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const restaurantOnlySearch =
    intent?.primaryDomain === "restaurant" &&
    intent?.needsRestaurant === true &&
    intent?.needsActivity !== true &&
    intent?.wantsPairing !== true;

  const mealRestaurantSearch =
    restaurantOnlySearch &&
    /\b(lunch|dinner|brunch|breakfast|food|restaurant|dining|eat|chicken|wings|fried chicken|hot chicken)\b/.test(
      queryText,
    );

  const hasStrongRestaurantSignal =
    Boolean(
      record.restaurant_name ||
        (record as any).cuisine ||
        (record as any).cuisine_type,
    ) ||
    RESTAURANT_RE.test(type) ||
    RESTAURANT_RE.test(category);

  const barFoodRestaurantSignal =
    /\b(bar and grill|bar & grill|gastropub|pub|tavern|grill|restaurant|food|menu|dining|brunch|lunch|dinner|kitchen|cuisine)\b/.test(
      category,
    );

  const loungeMealRestaurantSignal =
    mealRestaurantSearch &&
    /\b(lounge|nightlife|bar|pub|tavern|grill)\b/.test(category) &&
    !/\b(nightclub|dance club|strip club|gentlemen'?s club|hookah only|cigar only)\b/.test(
      category,
    );

  const clearlyActivityTyped = /\bactivity\b/.test(type) || Boolean(activityType);
  const activityOnly = ACTIVITY_ONLY_RE.test(type) || ACTIVITY_ONLY_RE.test(category);

  if (hasStrongRestaurantSignal) {
    return !(/\b(activity|activities)\b/.test(type) && activityOnly && !barFoodRestaurantSignal);
  }

  if ((loungeMealRestaurantSignal || barFoodRestaurantSignal) && !clearlyActivityTyped) {
    return true;
  }

  if (clearlyActivityTyped && activityOnly) return false;

  return false;
}

export function isActivityDomainResult(record: EnterpriseLocation, intent?: SearchIntent) {
  const type = explicitType(record);
  const category = textFrom(record, [
    "primary_category",
    "category",
    "activity_type",
    "activity_name",
    "name",
    "google_types",
    "tags",
    "semantic_tags",
    "intent_tags",
  ]);
  const hasActivitySignal =
    Boolean(record.activity_name || (record as any).activity_type) ||
    /\bactivity\b/.test(type) ||
    ACTIVITY_ONLY_RE.test(category);
  const restaurantOnly = isRestaurantDomainResult(record, intent) && !hasActivitySignal;
  if (restaurantOnly) return false;
  if (isRestaurantDomainResult(record, intent) && BAR_ACTIVITY_RE.test(category)) {
    return queryAllowsBarAsActivity(intent as SearchIntent);
  }
  return hasActivitySignal;
}

export function filterResultsBySearchDomain(args: {
  restaurants: EnterpriseLocation[];
  activities: EnterpriseLocation[];
  pairs?: EnterprisePair[];
  intent: SearchIntent;
}) {
  const restaurants = args.restaurants.filter((item) =>
    isRestaurantDomainResult(item, args.intent),
  );
  const activities = args.activities.filter((item) =>
    isActivityDomainResult(item, args.intent),
  );
  const pairs = (args.pairs ?? []).filter((pair) => {
    if (!isRestaurantDomainResult(pair.restaurant, args.intent)) return false;
    if (!isActivityDomainResult(pair.activity, args.intent)) return false;
    if (
      String(pair.restaurant.id ?? "") &&
      String(pair.restaurant.id ?? "") === String(pair.activity.id ?? "") &&
      !(args.intent as any).sameLocationRequired
    ) {
      return false;
    }
    return true;
  });
  return { restaurants, activities, pairs };
}
