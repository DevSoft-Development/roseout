import type { EnterpriseLocation, SearchIntent, SearchDomain } from "./types";
import { scoreGeoMatch, shouldExcludeByGeo } from "./geo-taxonomy";
import { getLocationDistanceMiles, scoreDistance } from "./distance";
import {
  activityTermMatches,
  isGenericMealIntent,
  isSpecificActivityIntent,
  termMatchesRecord,
  textForRecord,
  detectSingleVenueWithIntent,
  PLACE_OF_WORSHIP_TERMS,
  userAskedForPlaceOfWorship,
} from "./taxonomy";
import { isWellnessActivity } from "../lowLevel";
import { calculateMlBoost } from "../../ml/locationRanking";
import { calculateAdvancedMlRankingAdjustments } from "../../ml/advanced/loadAdvancedMlFeatures";
import {
  hasRelaxedActivityIntent,
  isSportsWatchFoodSameVenueIntent,
  hasSportsWatchIntent,
} from "./normalize-intent";

function compactRecordText(r: EnterpriseLocation) {
  return textForRecord(r).replaceAll("_", " ").replaceAll("-", " ");
}

function fieldText(r: EnterpriseLocation, fields: string[]) {
  return fields
    .map((field) => {
      const value = (r as any)[field];
      if (Array.isArray(value)) return value.join(" ");
      return value == null ? "" : String(value);
    })
    .join(" ")
    .toLowerCase()
    .replaceAll("_", " ")
    .replaceAll("-", " ");
}

export function isDateNightDinnerIntent(intent: SearchIntent): boolean {
  const text = [
    intent.rawQuery,
    intent.occasion,
    intent.timeContext,
    intent.restaurantIntent?.mealTerms,
    intent.restaurantIntent?.vibeTerms,
    intent.restaurantIntent?.categoryTerms,
  ]
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    /\b(date night|dinner date|romantic date|romantic dinner|anniversary|couples night|night out)\b/.test(
      text,
    ) ||
    (/\bdate\b/.test(text) && /\b(night|dinner|romantic)\b/.test(text))
  );
}

export function hasExplicitCafeDessertIntent(intent: SearchIntent): boolean {
  const text = [
    intent.rawQuery,
    intent.restaurantIntent?.foodTerms,
    intent.restaurantIntent?.cuisineTerms,
    intent.restaurantIntent?.categoryTerms,
    intent.restaurantIntent?.mealTerms,
  ]
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /\b(coffee|cafe|café|bakery|bake shop|pastry|dessert|ice cream|yogurt|frozen yogurt|bagel|donut|doughnut|cake|cupcake|cookies|sweets|bubble tea|tea|smoothie|juice|milkshake)\b/.test(
    text,
  );
}

export function isCafeBakeryDessertQuickBiteOnly(
  r: EnterpriseLocation,
): boolean {
  const text = fieldText(r, [
    "name",
    "restaurant_name",
    "primary_category",
    "cuisine",
    "cuisine_type",
    "food_type",
    "google_types",
    "tags",
    "semantic_tags",
    "intent_tags",
    "description",
    "search_document",
    "semantic_search_text",
    "search_keywords",
  ]);

  const cafeDessertSignal =
    /\b(cafe|café|coffee|coffee shop|bakery|bake shop|pastry|patisserie|dessert|ice cream|yogurt|frozen yogurt|bagel|bagels|donut|doughnut|cake|cupcake|cookies|sweets|bubble tea|tea shop|smoothie|juice bar|milkshake)\b/.test(
      text,
    );

  const fullDinnerSignal =
    /\b(full service|table service|dining room|dinner service|restaurant|steakhouse|seafood|italian restaurant|sushi|mediterranean|american restaurant|new american|thai restaurant|mexican restaurant|caribbean restaurant|latin restaurant|french restaurant|greek restaurant|tapas|wine bar|cocktail bar|lounge|bistro|brasserie|supper club|reservation|reservations|resy|open table)\b/.test(
      text,
    );

  return cafeDessertSignal && !fullDinnerSignal;
}

export function isSportsWatchIntent(intent: SearchIntent): boolean {
  const text = String(intent.rawQuery ?? "")
    .toLowerCase()
    .replaceAll("_", " ")
    .replaceAll("-", " ");

  return hasSportsWatchIntent(text);
}

function userAskedToWatchSportsGame(intent: SearchIntent): boolean {
  return isSportsWatchIntent(intent);
}

function sportsWatchRecordSignal(r: EnterpriseLocation): number {
  const text = fieldText(r, [
    "name",
    "activity_name",
    "primary_category",
    "activity_type",
    "google_types",
    "tags",
    "semantic_tags",
    "intent_tags",
    "description",
    "search_document",
    "semantic_search_text",
    "search_keywords",
  ]);

  let score = 0;
  if (/\bsports bar\b|\bsports lounge\b|\bsport lounge\b/.test(text)) {
    score += 55;
  }
  if (
    /\btv\b|\btvs\b|\btelevision\b|\bscreen\b|\bscreens\b|\bbig screen\b|\bbig screens\b|\bprojector\b|\btv bar\b/.test(
      text,
    )
  ) {
    score += 35;
  }
  if (
    /\bwatch party\b|\bgame day\b|\bgame night\b|\bshowing the game\b|\bwatch the game\b|\blive sports\b|\bsports viewing\b|\bplayoffs?\b/.test(
      text,
    )
  ) {
    score += 45;
  }
  if (
    /\bnba\b|\bnfl\b|\bmlb\b|\bnhl\b|\bwnba\b|\bmarch madness\b|\bfinal four\b|\blakers\b|\bwarriors\b|\bceltics\b|\bcowboys\b|\beagles\b|\bchiefs\b|\bdodgers\b|\bred sox\b|\bduke\b|\buconn\b|\bknicks\b|\bnets\b|\byankees\b|\bmets\b|\bgiants\b|\bjets\b|\brangers\b|\bislanders\b|\bdevils\b|\bfootball\b|\bbasketball\b|\bbaseball\b|\bhockey\b|\bsoccer\b|\bufc\b|\bboxing\b/.test(
      text,
    )
  ) {
    score += 25;
  }
  if (/\bgame bar\b/.test(text)) {
    score += 10;
  }
  return score;
}

function userAskedForRelaxedNoClub(intent: SearchIntent): boolean {
  const q = String(intent.rawQuery ?? "").toLowerCase();
  return /\b(relaxed activity|relaxing activity|chill activity|easy activity|low key|low-key|laid back|laid-back|casual activity|casual|relaxed|chill|quiet|not too loud|no club|no clubs|not a club|no dancing|no live dj|no dj|cozy)\b/.test(
    q,
  );
}

function relaxedActivityRecordSignal(r: EnterpriseLocation): number {
  const text = fieldText(r, [
    "name",
    "activity_name",
    "primary_category",
    "activity_type",
    "google_types",
    "tags",
    "semantic_tags",
    "intent_tags",
    "description",
    "search_document",
    "semantic_search_text",
    "search_keywords",
  ]);

  let score = 0;

  if (
    /\bboard games?\b|\barcade\b|\bmini golf\b|\bbowling\b|\bgallery\b|\bmuseum\b|\bbilliards\b|\bpool hall\b|\bpaint and sip\b|\bcafe\b|\bdessert\b/.test(
      text,
    )
  ) {
    score += 35;
  }

  if (
    /\brelaxed\b|\bchill\b|\blow key\b|\blow-key\b|\blaid back\b|\blaid-back\b|\bcasual\b|\bquiet\b|\bcozy\b/.test(
      text,
    )
  ) {
    score += 20;
  }

  return score;
}

function isNightlifeOnlyForSportsWatch(r: EnterpriseLocation): boolean {
  const text = fieldText(r, [
    "name",
    "activity_name",
    "primary_category",
    "activity_type",
    "google_types",
    "tags",
    "semantic_tags",
    "intent_tags",
    "description",
    "search_document",
    "semantic_search_text",
    "search_keywords",
  ]);
  const nightlifeOnly =
    /\bclub\b|\bdance club\b|\bnightclub\b|\blive dj\b|\bdj\b|\bspeakeasy\b|\brooftop lounge\b|\brooftop\b|\broof top\b|\bskyline\b/.test(
      text,
    );
  const hasSportsWatch = sportsWatchRecordSignal(r) > 0;
  return nightlifeOnly && !hasSportsWatch;
}

function isBarPubForSportsWatch(r: EnterpriseLocation): boolean {
  const text = fieldText(r, [
    "name",
    "activity_name",
    "primary_category",
    "activity_type",
    "google_types",
    "tags",
    "semantic_tags",
    "intent_tags",
    "description",
    "search_document",
    "semantic_search_text",
    "search_keywords",
  ]);
  return /\bbar\b|\bpub\b|\btavern\b|\bgrill\b/.test(text);
}

function userExplicitlyAskedForTheater(intent: SearchIntent) {
  const text = [
    intent.rawQuery,
    ...intent.activityIntent.activityTerms,
    ...intent.activityIntent.categoryTerms,
    ...intent.activityIntent.featureTerms,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /\b(theater|theatre|broadway|off-broadway|show|play|musical|cinema|movie|movies)\b/.test(
    text,
  );
}

function userAskedForHookah(intent: SearchIntent): boolean {
  return /\b(hookah|shisha|hookah lounge|hookah bar)\b/i.test(intent.rawQuery);
}

function isHookahRecord(record: EnterpriseLocation): boolean {
  return /\b(hookah|shisha)\b/i.test(textForRecord(record));
}

function userAskedForHardNightlife(rawQuery: string): boolean {
  return /\b(nightlife|bar|club|dance club|dancing|live dj|dj|speakeasy|cocktails|drinks|rooftop lounge)\b/i.test(
    rawQuery,
  );
}

function isHardNightlifeRecord(record: EnterpriseLocation): boolean {
  const text = textForRecord(record).toLowerCase();

  return /\bnightclub\b|\bdance club\b|\bclub\b|\bdancing\b|\bdance\b|\blive dj\b|\bdj\b|\bspeakeasy\b|\brooftop lounge\b|\brooftop\b|\broof top\b/i.test(
    text,
  );
}

function isTheaterRecord(r: EnterpriseLocation) {
  const text = fieldText(r, [
    "name",
    "activity_name",
    "primary_category",
    "activity_type",
    "google_types",
    "tags",
    "semantic_tags",
    "intent_tags",
    "description",
    "search_document",
    "semantic_search_text",
  ]);

  return /\b(theater|theatre|broadway|off-broadway|performing arts|cinema|movie theater)\b/.test(
    text,
  );
}

function explicitLocationType(r: EnterpriseLocation) {
  return String(
    r.location_type ?? (r as any).source_table ?? (r as any).type ?? "",
  )
    .toLowerCase()
    .replaceAll("_", " ")
    .replaceAll("-", " ");
}

function isPlaceOfWorshipRecord(r: EnterpriseLocation) {
  const typeText = explicitLocationType(r);
  const categoryText = fieldText(r, [
    "primary_category",
    "activity_type",
    "activity_name",
    "google_types",
    "tags",
    "semantic_tags",
    "intent_tags",
    "name",
    "description",
    "search_document",
    "semantic_search_text",
  ]);

  const combined = `${typeText} ${categoryText}`;

  return PLACE_OF_WORSHIP_TERMS.some((term) =>
    combined.includes(term.toLowerCase()),
  );
}

function shouldHidePlaceOfWorship(r: EnterpriseLocation, intent: SearchIntent) {
  return (
    isPlaceOfWorshipRecord(r) && !userAskedForPlaceOfWorship(intent.rawQuery)
  );
}

function isClearlyActivityOnly(r: EnterpriseLocation) {
  const typeText = explicitLocationType(r);
  const categoryText = fieldText(r, [
    "primary_category",
    "activity_type",
    "activity_name",
    "google_types",
    "tags",
    "semantic_tags",
    "intent_tags",
  ]);

  const hasRestaurantName = Boolean(r.restaurant_name);
  const hasCuisine = Boolean(r.cuisine || r.cuisine_type);

  if (hasRestaurantName || hasCuisine) return false;

  return (
    /\bactivity\b|\bactivities\b|\bexperience\b|\bentertainment\b/.test(
      typeText,
    ) ||
    /\btemple\b|\bchurch\b|\bmosque\b|\bsynagogue\b|\bplace of worship\b|\breligious\b|\bchapel\b|\bcathedral\b|\bshrine\b|\bmasjid\b|\bparish\b|\bministry\b/.test(
      categoryText,
    ) ||
    /\btheater\b|\btheatre\b|\bperforming arts\b|\bcinema\b|\bmovie theater\b/.test(
      categoryText,
    ) ||
    /\bmuseum\b|\bgallery\b|\bpark\b|\bgarden\b|\bzoo\b|\baquarium\b/.test(
      categoryText,
    ) ||
    /\bbowling\b|\barcade\b|\bescape room\b|\bkaraoke\b/.test(categoryText)
  );
}

function matchesAnyAlternativeGroup(
  record: EnterpriseLocation,
  groups: string[][] | undefined,
) {
  const validGroups = (groups ?? []).filter((group) => group.length >= 2);

  if (!validGroups.length) return true;

  return validGroups.some((group) => termMatchesRecord(record, group));
}

function isRestaurantLike(r: EnterpriseLocation) {
  const typeText = explicitLocationType(r);
  const categoryText = fieldText(r, [
    "primary_category",
    "cuisine",
    "cuisine_type",
    "restaurant_name",
    "name",
    "google_types",
    "tags",
    "semantic_tags",
    "intent_tags",
  ]);

  const fullText = compactRecordText(r);

  const strongRestaurantSignal =
    Boolean(r.restaurant_name) ||
    Boolean(r.cuisine) ||
    Boolean(r.cuisine_type) ||
    /\brestaurant\b|\brestaurants\b|\bdining\b|\beatery\b|\bcafe\b|\bbakery\b|\bbistro\b|\bsteakhouse\b|\bbar and grill\b|\bgastropub\b/.test(
      typeText,
    ) ||
    /\brestaurant\b|\brestaurants\b|\bdining\b|\beatery\b|\bcafe\b|\bbakery\b|\bbistro\b|\bsteakhouse\b|\bbar and grill\b|\bgastropub\b/.test(
      categoryText,
    );

  const foodSignal =
    /\bsteak\b|\bseafood\b|\bsushi\b|\bitalian\b|\bmexican\b|\bcaribbean\b|\bthai\b|\bindian restaurant\b|\bchinese restaurant\b|\bjapanese restaurant\b|\bkorean restaurant\b|\bbrunch\b|\bdinner menu\b|\bfood\b|\bcuisine\b/.test(
      fullText,
    );

  const loungeWithFood =
    /\blounge\b|\bcocktail bar\b|\bwine bar\b/.test(categoryText) &&
    /\bfood\b|\bdining\b|\brestaurant\b|\bmenu\b|\bdinner\b|\bbrunch\b|\bcuisine\b/.test(
      fullText,
    );

  const sportsWatchFoodVenue =
    /\bsports bar\b|\bbar and grill\b|\bgastropub\b|\bpub\b|\btavern\b/.test(
      categoryText,
    ) &&
    /\bwings?\b|\bchicken wings\b|\bfood\b|\bmenu\b|\bgrill\b|\bburgers?\b/.test(
      fullText,
    );

  if (isClearlyActivityOnly(r)) return false;

  return strongRestaurantSignal || foodSignal || loungeWithFood || sportsWatchFoodVenue;
}

export function isSportsWatchComboEligible(record: EnterpriseLocation, intent?: SearchIntent) {
  const typeText = explicitLocationType(record);
  const categoryText = fieldText(record, [
    "primary_category",
    "cuisine",
    "cuisine_type",
    "restaurant_name",
    "activity_name",
    "name",
    "activity_type",
    "google_types",
    "tags",
    "semantic_tags",
    "intent_tags",
  ]);
  const fullText = compactRecordText(record);
  const combined = `${typeText} ${categoryText} ${fullText}`;
  const locationType = String((record as any).location_type ?? (record as any).source_table ?? "").toLowerCase();
  const reasons: string[] = [];

  const sportsBarSignal = /\bsports bar\b|\bsports lounge\b|\bsport lounge\b/.test(combined);
  const barAndGrillSignal = /\bbar and grill\b|\bbar & grill\b|\bgastropub\b/.test(combined);
  const pubTavernSignal = /\bpub\b|\btavern\b/.test(combined);
  const barSignal = sportsBarSignal || barAndGrillSignal || pubTavernSignal || /\bbar\b/.test(combined);
  const restaurantSignal =
    locationType.includes("restaurant") ||
    Boolean(record.restaurant_name || record.cuisine || record.cuisine_type) ||
    /\brestaurant\b|\bdining\b|\beatery\b|\bbistro\b/.test(combined) ||
    barAndGrillSignal || sportsBarSignal || pubTavernSignal;
  const foodSignal = /\bwings?\b|\bchicken wings\b|\bbar food\b|\bfood\b|\bmenu\b|\bdinner\b|\bgrill\b|\bburgers?\b|\bchicken\b|\brestaurant\b/.test(combined);
  const sportsWatchSignal =
    sportsWatchRecordSignal(record) > 0 ||
    /\bsports bar\b|\blive sports\b|\bgame watch\b|\bwatch party\b|\bgame day\b|\bknicks\b|\bbasketball\b|\bnba\b|\btvs?\b|\bscreens?\b|\bbig screens?\b/.test(combined);
  const cigarOnly = /\bcigar(?:s| lounge| bar)?\b/.test(combined) && !foodSignal && !sportsWatchSignal;
  const hookahOnly = /\bhookah\b/.test(combined) && !foodSignal && !sportsWatchSignal;
  const cocktailLoungeOnly = /\bcocktail lounge\b|\bcocktail bar\b|\bspeakeasy\b/.test(combined) && !foodSignal && !sportsWatchSignal;
  const nightlifeOnly = /\bnightclub\b|\bdance club\b|\bnightlife\b|\blounge\b/.test(combined) && !barSignal && !foodSignal && !sportsWatchSignal;

  if (cigarOnly || hookahOnly || cocktailLoungeOnly || nightlifeOnly) {
    if (cigarOnly) reasons.push("cigar_lounge_only");
    if (hookahOnly) reasons.push("hookah_lounge_only");
    if (cocktailLoungeOnly) reasons.push("cocktail_lounge_only");
    if (nightlifeOnly) reasons.push("generic_nightlife_only");
    return { status: "reject" as const, eligible: false, reasons, restaurantSignal, foodSignal, sportsWatchSignal, barSignal, sportsBarSignal, barAndGrillSignal, pubTavernSignal, locationType, combined, disqualifyingLoungeOnly: true };
  }

  if (sportsBarSignal && foodSignal) reasons.push("sports_bar_with_food");
  if (barAndGrillSignal && foodSignal) reasons.push("bar_and_grill_with_food");
  if (restaurantSignal && barSignal && sportsWatchSignal) reasons.push("restaurant_bar_with_game_watch");
  if (pubTavernSignal && sportsWatchSignal) reasons.push("pub_tavern_with_sports_watch");
  if (reasons.length > 0) {
    return { status: "pass" as const, eligible: true, reasons, restaurantSignal, foodSignal, sportsWatchSignal, barSignal, sportsBarSignal, barAndGrillSignal, pubTavernSignal, locationType, combined, disqualifyingLoungeOnly: false };
  }

  if (restaurantSignal && barSignal && foodSignal) reasons.push("restaurant_bar_with_food");
  if (sportsBarSignal) reasons.push("sports_bar_soft_without_explicit_food");
  if (barAndGrillSignal) reasons.push("bar_and_grill_soft_without_explicit_tv");
  if (pubTavernSignal && (foodSignal || sportsWatchSignal)) reasons.push("pub_tavern_soft_combo");
  if (reasons.length > 0) {
    return { status: "demote" as const, eligible: true, reasons, restaurantSignal, foodSignal, sportsWatchSignal, barSignal, sportsBarSignal, barAndGrillSignal, pubTavernSignal, locationType, combined, disqualifyingLoungeOnly: false };
  }

  return { status: "reject" as const, eligible: false, reasons: ["missing_combo_sports_food_bar_signals"], restaurantSignal, foodSignal, sportsWatchSignal, barSignal, sportsBarSignal, barAndGrillSignal, pubTavernSignal, locationType, combined, disqualifyingLoungeOnly: false };
}

function sportsWatchFoodEligibility(record: EnterpriseLocation) {
  return isSportsWatchComboEligible(record);
}

function sportsWatchFoodScore(record: EnterpriseLocation, intent: SearchIntent) {
  if (!isSportsWatchFoodSameVenueIntent(intent.rawQuery)) return 0;
  const eligibility = sportsWatchFoodEligibility(record);
  let score = 0;
  if (/\bsports bar\b/.test(eligibility.combined)) score += 140;
  if (/\bbar and grill\b|\bgastropub\b/.test(eligibility.combined)) score += 100;
  if (/\bpub\b|\btavern\b/.test(eligibility.combined)) score += 70;
  if (/\bwings?\b|\bchicken wings\b/.test(eligibility.combined)) score += 110;
  if (/\btvs?\b|\bscreens?\b|\bbig screens?\b/.test(eligibility.combined)) score += 90;
  if (/\bknicks\b|\bbasketball\b|\bgame watch\b|\bwatch party\b|\blive sports\b|\bgame day\b/.test(eligibility.combined)) score += 80;
  if (/\bfood\b|\bdinner\b|\bbar food\b|\bmenu\b/.test(eligibility.combined)) score += 45;
  if (eligibility.locationType.includes("activity") && !eligibility.eligible) score -= 500;
  if (eligibility.disqualifyingLoungeOnly) score -= 350;
  return score;
}

function isActivityLike(r: EnterpriseLocation) {
  const typeText = explicitLocationType(r);
  const categoryText = fieldText(r, [
    "primary_category",
    "activity_type",
    "activity_name",
    "google_types",
    "tags",
    "semantic_tags",
    "intent_tags",
  ]);

  const fullText = compactRecordText(r);
  const hasRestaurantOnlySignals =
    Boolean(r.restaurant_name || r.cuisine || r.cuisine_type) &&
    !r.activity_name &&
    !r.activity_type;

  if (hasRestaurantOnlySignals) return false;

  return Boolean(
    r.activity_name ||
    r.activity_type ||
    /\bactivity\b|\bactivities\b|\bexperience\b|\bentertainment\b|\bnightlife\b/.test(
      typeText,
    ) ||
    /\bbowling\b|\bkaraoke\b|\bmuseum\b|\bhookah\b|\blounge\b|\brooftop\b|\broof top\b|\brooftop bar\b|\brooftop lounge\b|\bcocktail bar\b|\bwine bar\b|\bbar\b|\bsports bar\b|\bsports lounge\b|\bpub\b|\btavern\b|\bbar and grill\b|\blive sports\b|\bwatch party\b|\bgame day\b|\btv\b|\btvs\b|\bscreen\b|\bscreens\b|\bnightlife\b|\bspeakeasy\b|\barcade\b|\bmusic\b|\btheater\b|\btheatre\b|\bgallery\b|\bpark\b|\bescape room\b|\bclub\b|\bspa\b/.test(
      categoryText,
    ) ||
    /\bbowling\b|\bkaraoke\b|\bmuseum\b|\bhookah\b|\blounge\b|\brooftop\b|\broof top\b|\brooftop bar\b|\brooftop lounge\b|\bcocktail bar\b|\bwine bar\b|\bbar\b|\bsports bar\b|\bsports lounge\b|\bpub\b|\btavern\b|\bbar and grill\b|\blive sports\b|\bwatch party\b|\bgame day\b|\btv\b|\btvs\b|\bscreen\b|\bscreens\b|\bnightlife\b|\bspeakeasy\b|\bskyline\b|\barcade\b|\blive music\b|\btheater\b|\btheatre\b|\bescape room\b/.test(
      fullText,
    ),
  );
}

function hasSingleVenueWithSportsSignal(terms: string[]) {
  return terms.some((term) =>
    /sports|game watch|tv|bar with tv|screen/.test(term),
  );
}

const SAME_VENUE_PRIMARY_FIELDS = [
  "name",
  "restaurant_name",
  "activity_name",
  "cuisine",
  "cuisine_type",
  "food_type",
  "category",
  "primary_category",
  "primary_tag",
  "search_document",
  "semantic_search_text",
  "description",
];

const SAME_VENUE_SECONDARY_FIELDS = [
  "name",
  "restaurant_name",
  "activity_name",
  "search_document",
  "semantic_tags",
  "review_keywords",
  "tags",
  "search_keywords",
  "intent_tags",
  "vibe_tags",
  "date_style_tags",
  "special_features",
  "best_for_tags",
  "best_for",
  "semantic_search_text",
  "description",
  "primary_category",
  "primary_tag",
];

const SAME_VENUE_PRIMARY_FOOD_TERMS = [
  "mediterranean",
  "middle eastern",
  "italian",
  "seafood",
  "sushi",
  "steakhouse",
  "steak",
  "soul food",
  "caribbean",
  "jamaican",
  "latin",
  "mexican",
  "tacos",
  "taco",
  "vegan",
  "vegetarian",
  "brunch",
  "breakfast",
  "lunch",
  "dinner",
  "dessert",
  "coffee",
  "cafe",
  "bakery",
  "pizza",
  "burgers",
  "burger",
  "wings",
  "barbecue",
  "bbq",
  "thai",
  "chinese",
  "korean",
  "japanese",
  "indian",
  "halal",
  "greek",
  "spanish",
  "tapas",
  "restaurant",
  "lounge",
  "bar",
  "food",
  "drinks",
  "cocktails",
  "hookah lounge",
  "rooftop bar",
  "bowling",
  "arcade",
];

const SAME_VENUE_SECONDARY_ATTRIBUTE_TERMS = [
  "hookah",
  "shisha",
  "live music",
  "jazz",
  "dj",
  "dancing",
  "rooftop",
  "rooftop views",
  "skyline views",
  "outdoor seating",
  "patio",
  "garden",
  "waterfront",
  "water view",
  "cocktails",
  "margaritas",
  "bottomless mimosas",
  "happy hour",
  "games",
  "arcade",
  "bowling",
  "karaoke",
  "private room",
  "private rooms",
  "private dining",
  "birthday",
  "anniversary",
  "romantic",
  "cozy",
  "upscale",
  "late night",
  "open late",
  "lounge",
  "sports",
  "tvs",
  "cigar",
  "speakeasy",
  "comedy",
  "trivia",
  "board games",
  "food",
  "drinks",
];

const SAME_VENUE_SECONDARY_SYNONYMS: Record<string, string[]> = {
  hookah: [
    "hookah",
    "shisha",
    "hookah lounge",
    "hookah bar",
    "hookah restaurant",
  ],
  shisha: [
    "hookah",
    "shisha",
    "hookah lounge",
    "hookah bar",
    "hookah restaurant",
  ],
  "live music": [
    "live music",
    "jazz",
    "band",
    "dj",
    "performance",
    "music venue",
  ],
  jazz: ["live music", "jazz", "band", "performance", "music venue"],
  dj: ["dj", "live dj", "music", "dancing"],
  rooftop: [
    "rooftop",
    "roof top",
    "skyline",
    "rooftop views",
    "city views",
    "view",
    "views",
  ],
  "rooftop views": [
    "rooftop",
    "roof top",
    "skyline",
    "rooftop views",
    "city views",
    "view",
    "views",
  ],
  "outdoor seating": [
    "outdoor seating",
    "patio",
    "garden",
    "terrace",
    "sidewalk seating",
    "outdoor",
  ],
  patio: ["outdoor seating", "patio", "garden", "terrace", "outdoor"],
  "bottomless mimosas": [
    "bottomless",
    "mimosas",
    "bottomless mimosas",
    "brunch cocktails",
  ],
  cocktails: ["cocktails", "drinks", "bar", "mixology"],
  margaritas: ["margaritas", "cocktails", "drinks", "bar"],
  games: [
    "games",
    "arcade",
    "board games",
    "bowling",
    "darts",
    "pool table",
    "billiards",
  ],
  arcade: ["games", "arcade", "board games", "drinks"],
  bowling: ["bowling", "games", "arcade"],
  "private room": [
    "private room",
    "private rooms",
    "private dining",
    "event room",
    "group dining",
  ],
  "private rooms": [
    "private room",
    "private rooms",
    "private dining",
    "event room",
    "group dining",
  ],
  "late night": ["late night", "open late", "after hours"],
  "open late": ["late night", "open late", "after hours"],
};

export type SameVenueSecondaryMatchStrength =
  | "explicit"
  | "strong_synonym"
  | "supporting"
  | "generic"
  | "none";

const SECONDARY_ATTRIBUTE_TAXONOMY: Record<
  string,
  {
    explicit: string[];
    strong: string[];
    supporting: string[];
    generic: string[];
  }
> = {
  hookah: {
    explicit: ["hookah"],
    strong: ["shisha", "hookah lounge", "hookah bar", "hookah restaurant"],
    supporting: ["lounge", "nightlife"],
    generic: ["food", "restaurant", "bar", "activity"],
  },
  shisha: {
    explicit: ["shisha"],
    strong: ["hookah", "hookah lounge", "hookah bar", "hookah restaurant"],
    supporting: ["lounge", "nightlife"],
    generic: ["food", "restaurant", "bar", "activity"],
  },
  "live music": {
    explicit: ["live music"],
    strong: ["jazz", "band", "dj", "performance", "music venue"],
    supporting: ["nightlife", "lounge", "music"],
    generic: ["entertainment", "activity"],
  },
  "outdoor seating": {
    explicit: ["outdoor seating"],
    strong: ["patio", "outdoor dining", "terrace", "garden seating"],
    supporting: ["outdoor", "garden"],
    generic: ["seating"],
  },
  rooftop: {
    explicit: ["rooftop"],
    strong: ["roof top", "skyline", "rooftop views", "city views"],
    supporting: ["views", "lounge"],
    generic: ["bar"],
  },
  "rooftop views": {
    explicit: ["rooftop views"],
    strong: ["rooftop", "roof top", "skyline", "city views"],
    supporting: ["views", "lounge"],
    generic: ["bar"],
  },
  "bottomless mimosas": {
    explicit: ["bottomless mimosas"],
    strong: ["bottomless", "mimosas", "brunch cocktails"],
    supporting: ["brunch", "cocktails"],
    generic: ["drinks"],
  },
  games: {
    explicit: ["games"],
    strong: ["arcade", "bowling", "darts", "billiards", "pool table", "board games"],
    supporting: ["entertainment"],
    generic: ["activity"],
  },
};

function secondaryBuckets(secondaryCandidates: string[]) {
  const explicit = uniqLowerTerms(secondaryCandidates.flatMap((term) => SECONDARY_ATTRIBUTE_TAXONOMY[term]?.explicit ?? [term]));
  const strong = uniqLowerTerms(secondaryCandidates.flatMap((term) => SECONDARY_ATTRIBUTE_TAXONOMY[term]?.strong ?? []));
  const supporting = uniqLowerTerms(secondaryCandidates.flatMap((term) => SECONDARY_ATTRIBUTE_TAXONOMY[term]?.supporting ?? []));
  const generic = uniqLowerTerms(secondaryCandidates.flatMap((term) => SECONDARY_ATTRIBUTE_TAXONOMY[term]?.generic ?? []));
  return { explicitSecondaryTerms: explicit, strongSecondarySynonyms: strong, supportingSecondaryTerms: supporting, genericSecondaryTerms: generic };
}

function strengthFromMatches(matched: string[], buckets: ReturnType<typeof secondaryBuckets>): SameVenueSecondaryMatchStrength {
  const has = (terms: string[]) => matched.some((term) => terms.includes(term));
  if (has(buckets.explicitSecondaryTerms)) return "explicit";
  if (has(buckets.strongSecondarySynonyms)) return "strong_synonym";
  if (has(buckets.supportingSecondaryTerms)) return "supporting";
  if (has(buckets.genericSecondaryTerms)) return "generic";
  return "none";
}

export function isStrongSameVenueMatch(record: EnterpriseLocation, intent: SearchIntent) {
  const match = scoreSameVenueAttributeMatch(record, intent);
  return Boolean(match.primaryMatched && match.secondaryStrongMatched && match.score >= 180);
}

function uniqLowerTerms(terms: unknown[]): string[] {
  return Array.from(
    new Set(
      terms
        .flat()
        .map((term) =>
          String(term ?? "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    ),
  );
}

function matchTermsInFields(
  record: EnterpriseLocation,
  terms: string[],
  fields: string[],
) {
  const matchedTerms: string[] = [];
  const matchedFields: string[] = [];
  for (const field of fields) {
    const text = fieldText(record, [field]);
    if (!text) continue;
    for (const term of terms) {
      const pattern = new RegExp(
        `\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\s+/g, "\\\\s+")}\\b`,
        "i",
      );
      if (pattern.test(text)) {
        if (!matchedTerms.includes(term)) matchedTerms.push(term);
        if (!matchedFields.includes(field)) matchedFields.push(field);
      }
    }
  }
  return { matchedTerms, matchedFields };
}

export function sameVenueSearchTerms(intent: SearchIntent) {
  const singleVenue = detectSingleVenueWithIntent(intent.rawQuery);
  const sameVenuePreferred =
    Boolean((intent as any).sameVenuePreferred) || singleVenue.matched;
  if (!sameVenuePreferred) {
    return {
      primaryFoodTerms: [],
      secondaryAttributeTerms: [],
      expandedSecondaryAttributeTerms: [],
      explicitSecondaryTerms: [],
      strongSecondarySynonyms: [],
      supportingSecondaryTerms: [],
      genericSecondaryTerms: [],
    };
  }

  const mealTerms = intent.restaurantIntent?.mealTerms ?? [];
  const primaryCandidates = uniqLowerTerms([
    ...(intent.restaurantIntent?.cuisineTerms ?? []),
    ...(intent.restaurantIntent?.foodTerms ?? []),
    ...mealTerms,
    ...(mealTerms.some((term) => ["dinner", "lunch", "brunch", "breakfast"].includes(String(term).toLowerCase())) ? ["food", "restaurant"] : []),
    ...(intent.restaurantIntent?.categoryTerms ?? []),
    ...singleVenue.foodTerms,
    ...singleVenue.venueTerms,
    ...SAME_VENUE_PRIMARY_FOOD_TERMS.filter((term) =>
      intent.rawQuery.toLowerCase().includes(term),
    ),
  ]);

  const connectorSplit = String(intent.rawQuery ?? "")
    .toLowerCase()
    .split(
      /\b(?:with|and|plus|has|have|serving|serves|offering|offers|featuring|features|including|includes)\b/,
    );
  const afterWith = connectorSplit.slice(1).join(" ");
  const secondaryCandidates = uniqLowerTerms([
    ...((intent as any).secondaryAttributeTerms ?? []),
    ...SAME_VENUE_SECONDARY_ATTRIBUTE_TERMS.filter(
      (term) => afterWith.includes(term),
    ),
  ]);

  const buckets = secondaryBuckets(secondaryCandidates);
  const expandedSecondaryAttributeTerms = uniqLowerTerms([
    ...buckets.explicitSecondaryTerms,
    ...buckets.strongSecondarySynonyms,
    ...buckets.supportingSecondaryTerms,
    ...buckets.genericSecondaryTerms,
    ...secondaryCandidates.flatMap(
      (term) => SAME_VENUE_SECONDARY_SYNONYMS[term] ?? [term],
    ),
  ]);

  return {
    primaryFoodTerms: primaryCandidates,
    secondaryAttributeTerms: secondaryCandidates,
    expandedSecondaryAttributeTerms,
    ...buckets,
  };
}

export function scoreSameVenueAttributeMatch(
  record: EnterpriseLocation,
  intent: SearchIntent,
) {
  const terms = sameVenueSearchTerms(intent);
  if (
    !terms.primaryFoodTerms.length ||
    !terms.expandedSecondaryAttributeTerms.length
  ) {
    return {
      score: 0,
      primaryMatched: false,
      secondaryMatched: false,
      ...terms,
      primaryTermsMatched: [],
      secondaryTermsMatched: [],
      primaryFieldsMatched: [],
      secondaryFieldsMatched: [],
      reason: "not_same_venue_attribute_query",
      secondaryStrongMatched: false,
      secondarySupportingMatched: false,
      secondaryMatchStrength: "none" as SameVenueSecondaryMatchStrength,
    };
  }

  const primary = matchTermsInFields(
    record,
    terms.primaryFoodTerms,
    SAME_VENUE_PRIMARY_FIELDS,
  );
  const secondary = matchTermsInFields(
    record,
    terms.expandedSecondaryAttributeTerms,
    SAME_VENUE_SECONDARY_FIELDS,
  );
  const namePrimary =
    matchTermsInFields(record, terms.primaryFoodTerms, [
      "name",
      "restaurant_name",
      "activity_name",
    ]).matchedTerms.length > 0;
  const nameSecondary =
    matchTermsInFields(record, terms.expandedSecondaryAttributeTerms, [
      "name",
      "restaurant_name",
      "activity_name",
    ]).matchedTerms.length > 0;
  const docPrimary =
    matchTermsInFields(record, terms.primaryFoodTerms, ["search_document"])
      .matchedTerms.length > 0;
  const docSecondary =
    matchTermsInFields(record, terms.expandedSecondaryAttributeTerms, [
      "search_document",
    ]).matchedTerms.length > 0;
  const primaryMatched = primary.matchedTerms.length > 0;
  const secondaryMatched = secondary.matchedTerms.length > 0;
  const secondaryMatchStrength = strengthFromMatches(secondary.matchedTerms, terms);
  const secondaryStrongMatched =
    secondaryMatchStrength === "explicit" ||
    secondaryMatchStrength === "strong_synonym";
  const secondarySupportingMatched =
    secondaryMatchStrength === "supporting" || secondaryMatchStrength === "generic";
  const primaryGenericOnly =
    primaryMatched && primary.matchedTerms.every((term) => ["food", "restaurant", "dinner", "lunch", "brunch", "bar", "lounge", "drinks", "cocktails"].includes(term));

  let score = 0;
  let reason = "missing_primary_and_secondary";
  if (primaryMatched && secondaryMatched) {
    if (secondaryStrongMatched && !primaryGenericOnly) {
      score = 320;
      reason = "strong_matched_primary_and_explicit_secondary_same_venue_terms";
    } else if (secondaryStrongMatched) {
      score = 150;
      reason = "generic_primary_with_explicit_secondary_same_venue_terms";
    } else if (!primaryGenericOnly) {
      score = 90;
      reason = "primary_with_supporting_secondary_same_venue_terms";
    } else {
      score = 25;
      reason = "generic_primary_with_supporting_secondary_same_venue_terms";
    }
    if (secondaryStrongMatched) {
      if (namePrimary && nameSecondary) score += 120;
      if (docPrimary && docSecondary) score += 120;
      if (
        primary.matchedFields.some((f) =>
        [
          "cuisine",
          "cuisine_type",
          "primary_category",
          "primary_tag",
          "search_document",
        ].includes(f),
      ) &&
      secondary.matchedFields.some((f) =>
        [
          "semantic_tags",
          "review_keywords",
          "search_document",
          "name",
          "tags",
          "search_keywords",
          "intent_tags",
        ].includes(f),
      )
      )
        score += 80;
      if (
        secondary.matchedFields.some((f) =>
          ["description", "semantic_search_text"].includes(f),
        )
      )
        score += 40;
    }
  } else if (primaryMatched) {
    score = -90;
    reason = "primary_only_missing_same_venue_attribute";
  } else if (secondaryMatched) {
    score = 35;
    reason = "secondary_only_missing_primary_food_intent";
  }

  (record as any).sameVenuePrimaryMatched = primaryMatched;
  (record as any).sameVenueSecondaryMatched = secondaryMatched;
  (record as any).sameVenuePrimaryTermsMatched = primary.matchedTerms;
  (record as any).sameVenueAttributeTermsMatched = secondary.matchedTerms;
  (record as any).sameVenueSecondaryStrongMatched = secondaryStrongMatched;
  (record as any).sameVenueSecondarySupportingMatched = secondarySupportingMatched;
  (record as any).sameVenueAttributeMatchStrength = secondaryMatchStrength;
  (record as any).phase2IntentMatchStrength = secondaryMatchStrength;
  (record as any).sameVenuePrimaryFieldsMatched = primary.matchedFields;
  (record as any).sameVenueSecondaryFieldsMatched = secondary.matchedFields;
  (record as any).sameVenueScore = score;
  (record as any).sameVenueBoostApplied = score > 0;
  (record as any).sameVenueRankingReason = reason;
  (record as any).matchedFields = uniqLowerTerms([
    primary.matchedFields,
    secondary.matchedFields,
  ]);
  return {
    score,
    primaryMatched,
    secondaryMatched,
    secondaryStrongMatched,
    secondarySupportingMatched,
    secondaryMatchStrength,
    ...terms,
    primaryTermsMatched: primary.matchedTerms,
    secondaryTermsMatched: secondary.matchedTerms,
    primaryFieldsMatched: primary.matchedFields,
    secondaryFieldsMatched: secondary.matchedFields,
    reason,
  };
}

export function scoreSingleVenueWithMatch(
  record: EnterpriseLocation,
  intent: SearchIntent,
) {
  const singleVenue = detectSingleVenueWithIntent(intent.rawQuery);
  if (!singleVenue.matched)
    return {
      score: 0,
      venueMatched: false,
      foodMatched: false,
      featureMatched: false,
      dualMatched: false,
    };

  const venueMatched =
    singleVenue.venueTerms.length === 0 ||
    termMatchesRecord(record, singleVenue.venueTerms);
  const foodMatched =
    singleVenue.foodTerms.length === 0 ||
    termMatchesRecord(record, singleVenue.foodTerms);
  const featureMatched =
    singleVenue.featureTerms.length === 0 ||
    termMatchesRecord(record, singleVenue.featureTerms);
  const sportsMatched =
    hasSingleVenueWithSportsSignal([
      ...singleVenue.venueTerms,
      ...singleVenue.featureTerms,
    ]) && sportsWatchRecordSignal(record) > 0;

  let score = 0;
  if (venueMatched && singleVenue.venueTerms.length) score += 70;
  if (foodMatched && singleVenue.foodTerms.length) score += 70;
  if (featureMatched && singleVenue.featureTerms.length) score += 40;
  if (sportsMatched) score += 25;
  if (singleVenue.foodTerms.length && venueMatched && !foodMatched) score -= 60;
  if (singleVenue.venueTerms.length && foodMatched && !venueMatched)
    score -= 60;
  if (isClearlyActivityOnly(record) && !isRestaurantLike(record)) score -= 80;
  if (
    singleVenue.featureTerms.length &&
    isRestaurantLike(record) &&
    !venueMatched &&
    !featureMatched
  )
    score -= 80;

  (record as any).singleVenueWithScore = score;
  (record as any).singleVenueWithVenueMatched = venueMatched;
  (record as any).singleVenueWithFoodMatched = foodMatched;
  (record as any).singleVenueWithFeatureMatched = featureMatched;
  (record as any).singleVenueWithDualMatched = Boolean(
    venueMatched && (foodMatched || featureMatched),
  );

  return {
    score,
    venueMatched,
    foodMatched,
    featureMatched,
    dualMatched: Boolean(venueMatched && (foodMatched || featureMatched)),
  };
}

const CURATED_TERMS = [
  "romantic",
  "date night",
  "anniversary",
  "birthday",
  "upscale",
  "rooftop",
  "steak",
  "seafood",
  "cocktails",
  "lounge",
  "fine dining",
  "group night",
  "dinner date",
  "experience",
];
const UTILITY_TERMS = [
  "coffee",
  "quick bite",
  "fast food",
  "cheap eats",
  "casual",
  "near me",
  "open now",
  "breakfast",
  "grab and go",
];
const SELF_CARE_INTENT_TERMS = [
  "self care",
  "self-care",
  "spa day",
  "couples massage",
  "couple massage",
  "girls day",
  "relaxing date",
  "wellness",
  "birthday prep",
  "pampering",
  "pamper",
];
const NON_WELLNESS_PRIORITY_TERMS = [
  "dinner",
  "restaurant",
  "food",
  "eat",
  "dining",
  "rooftop",
  "hookah",
  "bowling",
  "arcade",
];

function userHasSelfCareIntent(intent: SearchIntent) {
  const text = intentText(intent);
  return SELF_CARE_INTENT_TERMS.some((term) => text.includes(term));
}

function isNonWellnessPriorityIntent(intent: SearchIntent) {
  const text = intentText(intent);
  return NON_WELLNESS_PRIORITY_TERMS.some((term) => text.includes(term));
}

function wellnessIntentAdjustment(
  r: EnterpriseLocation,
  intent: SearchIntent,
  domain: SearchDomain,
) {
  if (domain !== "activity" || !isWellnessActivity(r)) return 0;

  if (userHasSelfCareIntent(intent)) return 180;
  if (isNonWellnessPriorityIntent(intent)) return -220;

  return 0;
}

function hasLocationPhotos(r: EnterpriseLocation) {
  const images = (r as any).images ?? (r as any).gallery_images;
  const hasImageArray = Array.isArray(images)
    ? images.filter(Boolean).length > 0
    : typeof images === "string" &&
      images.trim().length > 2 &&
      !["[]", "null"].includes(images.trim().toLowerCase());
  return Boolean(
    (r as any).has_photos === true ||
    r.image_url ||
    r.main_image ||
    (r as any).photo_url ||
    (r as any).primary_photo_url ||
    hasImageArray,
  );
}

function normalizedPublicVisibilityTier(r: EnterpriseLocation) {
  return String((r as any).public_visibility_tier ?? "")
    .toLowerCase()
    .replaceAll("_", " ");
}

function normalizedCurationTier(r: EnterpriseLocation) {
  return String((r as any).curation_tier ?? "")
    .toLowerCase()
    .replaceAll("_", " ");
}

function normalizedVisibilityTier(r: EnterpriseLocation) {
  return `${normalizedPublicVisibilityTier(r)} ${normalizedCurationTier(r)}`.trim();
}

function normalizedQualityStatus(r: EnterpriseLocation) {
  return String(
    (r as any).quality_status ??
      (r as any).source_quality_status ??
      (r as any).data_status ??
      (r as any).status ??
      "",
  )
    .toLowerCase()
    .replaceAll("_", " ");
}

function userAskedForCasualQuickOrChicken(intent: SearchIntent) {
  return /\b(casual|quick|fast|fast casual|fast food|chicken|wings|fried chicken|hot chicken|takeout|take out|delivery|food truck|pizza|slice|deli|quick bite)\b/i.test(
    intent.rawQuery,
  );
}

function userAskedForChicken(intent: SearchIntent) {
  return /\b(chicken|wings|fried chicken|hot chicken)\b/i.test(intent.rawQuery);
}

function userAskedForQuickService(intent: SearchIntent) {
  return /\b(quick|quick bite|fast|fast casual|fast food|counter service|takeout|take out|delivery|food truck)\b/i.test(
    intent.rawQuery,
  );
}

function isGenericRestaurantQualityIntent(intent: SearchIntent) {
  const text = intentText(intent);
  return /\b(restaurant|restaurants|dinner|date|date night|girls night|casual dinner|nice dinner|dining)\b/.test(
    text,
  );
}

function qualityReason(pushTo: string[], reason: string, points: number) {
  pushTo.push(`${reason} ${points > 0 ? "+" : ""}${points}`);
}

function baseQualitySignals(r: EnterpriseLocation) {
  const text = compactRecordText(r).toLowerCase();
  const nameText = fieldText(r, ["name", "restaurant_name"]);
  const categoryTypeText = fieldText(r, [
    "primary_category",
    "activity_type",
    "cuisine",
    "cuisine_type",
    "google_types",
    "tags",
    "semantic_tags",
    "intent_tags",
  ]);
  const descriptionTagText = fieldText(r, [
    "description",
    "tags",
    "vibe_tags",
    "best_for_tags",
    "date_style_tags",
    "semantic_tags",
    "intent_tags",
    "search_keywords",
    "search_document",
    "semantic_search_text",
  ]);
  const rating = Number(r.rating ?? 0);
  const reviewCount = Number(
    r.review_count ?? (r as any).reviewCount ?? (r as any).total_reviews ?? 0,
  );
  const publicVisibility = normalizedPublicVisibilityTier(r);
  const curationTier = normalizedCurationTier(r);
  const visibility = normalizedVisibilityTier(r);
  const status = normalizedQualityStatus(r);
  const curated =
    Boolean(
      (r as any).is_featured ||
      (r as any).featured ||
      (r as any).is_curated ||
      (r as any).approved,
    ) || /\b(featured|premium|curated|editor|approved)\b/.test(visibility);
  const approved =
    /\b(approved|published|publish ready|verified|active)\b/.test(status);
  return {
    text,
    nameText,
    categoryTypeText,
    descriptionTagText,
    rating,
    reviewCount,
    publicVisibility,
    curationTier,
    visibility,
    status,
    curated,
    approved,
    hasPhotos: hasLocationPhotos(r),
  };
}

const OUTING_CATEGORY_RE =
  /\b(fine dining|upscale|full service|restaurant|bistro|brasserie|steakhouse|seafood|italian restaurant|wine bar|supper club)\b/;
const OUTING_DESCRIPTION_RE =
  /\b(date night|romantic|ambiance|ambience|elegant|upscale|cocktails|lounge|dinner|reservations?)\b/;
const QUICK_SERVICE_RE =
  /\b(fast food|quick service|fast casual|counter service)\b/;
const TAKEOUT_FIRST_RE =
  /\b(delivery|takeout|take out|catering|ghost kitchen)\b/;
const RESERVATION_DINING_RE =
  /\b(reservations?|reservation friendly|book a table|open ?table|resy|full service|dining room|dinner service|table service|waiter|waitstaff|host stand)\b/;
const WEAK_OUTING_RE =
  /\b(eats|chicken|pizza|deli|slice|burger|sandwich|wings|takeout|delivery|counter service|fast food|fast casual|quick service|catering|ghost kitchen)\b/;

function hasReservationSignal(r: EnterpriseLocation, text: string) {
  return (
    Boolean(
      r.reservation_url ||
      r.reservation_link ||
      r.booking_url ||
      r.external_reservation_url ||
      (r as any).reservation_enabled ||
      (r as any).reservations_url,
    ) || RESERVATION_DINING_RE.test(text)
  );
}

export function scoreRestaurantOutingFit(
  r: EnterpriseLocation,
  intent: SearchIntent,
) {
  const reasons: string[] = [];
  const penalties: string[] = [];
  const signals = baseQualitySignals(r);
  let score = 0;
  const askedCasual = userAskedForCasualQuickOrChicken(intent);
  const askedChicken = userAskedForChicken(intent);
  const askedQuickService = userAskedForQuickService(intent);
  const categoryTypeText = signals.categoryTypeText;
  const descriptionTagText = signals.descriptionTagText;
  const outingCategoryMatch = OUTING_CATEGORY_RE.test(categoryTypeText);
  const outingDescriptionMatch = OUTING_DESCRIPTION_RE.test(descriptionTagText);
  const dateNightDinnerIntent = isDateNightDinnerIntent(intent);
  const explicitCafeDessertIntent = hasExplicitCafeDessertIntent(intent);
  const cafeBakeryDessertOnly = isCafeBakeryDessertQuickBiteOnly(r);
  const suppressCafeDessertForDateNight =
    dateNightDinnerIntent &&
    !explicitCafeDessertIntent &&
    cafeBakeryDessertOnly;
  const strongOutingSignal =
    /\b(fine dining|upscale|full service|bistro|brasserie|steakhouse|seafood|italian restaurant|wine bar|supper club)\b/.test(
      categoryTypeText,
    ) || outingDescriptionMatch;
  const reservationSignal = hasReservationSignal(
    r,
    `${categoryTypeText} ${descriptionTagText} ${signals.text}`,
  );
  const ambianceSignal =
    outingDescriptionMatch ||
    /\b(romantic|elegant|ambiance|ambience|date night|upscale|lounge|supper club|brasserie|fine dining)\b/.test(
      `${categoryTypeText} ${descriptionTagText}`,
    );

  if (
    /\b(featured|premium|curated)\b/.test(signals.curationTier) ||
    Boolean(
      (r as any).is_featured || (r as any).featured || (r as any).is_curated,
    )
  ) {
    score += 25;
    qualityReason(reasons, "curation tier featured/premium/curated", 25);
  }
  if (/\b(featured|premium)\b/.test(signals.publicVisibility)) {
    score += 20;
    qualityReason(reasons, "public visibility featured/premium", 20);
  }
  if (signals.approved) {
    score += 10;
    qualityReason(reasons, "approved/verified/published status", 10);
  }
  if (signals.hasPhotos) {
    score += 15;
    qualityReason(reasons, "has photos", 15);
  }
  if (signals.rating >= 4.5 && signals.reviewCount >= 500) {
    score += 25;
    qualityReason(reasons, "rating >= 4.5 with 500+ reviews", 25);
  } else if (signals.rating >= 4.3 && signals.reviewCount >= 100) {
    score += 15;
    qualityReason(reasons, "rating >= 4.3 with 100+ reviews", 15);
  }
  if (outingCategoryMatch) {
    if (suppressCafeDessertForDateNight) {
      qualityReason(
        penalties,
        "removed dining boost for cafe/bakery/dessert-only date-night result",
        0,
      );
    } else {
      score += 20;
      qualityReason(reasons, "outing category/type dining signal", 20);
    }
  }
  if (outingDescriptionMatch) {
    if (suppressCafeDessertForDateNight) {
      qualityReason(
        penalties,
        "removed date-night boost for cafe/bakery/dessert-only result",
        0,
      );
    } else {
      score += 15;
      qualityReason(reasons, "date-night/ambiance/dinner tag signal", 15);
    }
  }
  if (suppressCafeDessertForDateNight) {
    score -= 80;
    qualityReason(
      penalties,
      "cafe/bakery/dessert-only suppressed for date-night dinner intent",
      -80,
    );
  }

  const priority = Number(
    (r as any).default_market_priority ?? (r as any).market_priority,
  );
  if (priority === 0) {
    score += 8;
    qualityReason(reasons, "default market priority 0", 8);
  } else if (priority === 1) {
    score += 4;
    qualityReason(reasons, "default market priority 1", 4);
  }

  if ((r as any).is_low_level === true) {
    score -= 35;
    qualityReason(penalties, "low-level location", -35);
  }
  if (
    !askedCasual &&
    /\beats\b/.test(signals.nameText) &&
    !strongOutingSignal
  ) {
    score -= 15;
    qualityReason(
      penalties,
      "name contains eats without upscale/full-service signal",
      -15,
    );
  }
  if (!askedChicken && /\bchicken\b/.test(signals.nameText)) {
    score -= 20;
    qualityReason(penalties, "name contains chicken not requested", -20);
  }
  if (
    !askedCasual &&
    !askedQuickService &&
    QUICK_SERVICE_RE.test(categoryTypeText)
  ) {
    score -= 30;
    qualityReason(
      penalties,
      "fast casual/quick service/counter service category",
      -30,
    );
  }
  if (!askedQuickService && TAKEOUT_FIRST_RE.test(categoryTypeText)) {
    score -= 30;
    qualityReason(
      penalties,
      "delivery/takeout/catering/ghost kitchen category",
      -30,
    );
  }
  if (
    !askedCasual &&
    ((r as any).is_chain === true ||
      /\b(chain|utility|low priority)\b/.test(
        `${signals.visibility} ${signals.text}`,
      ))
  ) {
    score -= 15;
    qualityReason(penalties, "chain/low-priority not requested", -15);
  }
  if (isGenericRestaurantQualityIntent(intent) && !ambianceSignal) {
    score -= 10;
    qualityReason(penalties, "weak outing ambiance signal", -10);
  }
  if (
    isGenericRestaurantQualityIntent(intent) &&
    !reservationSignal &&
    !strongOutingSignal
  ) {
    score -= 10;
    qualityReason(
      penalties,
      "missing reservation/dining/full-service signal",
      -10,
    );
  }
  if (!signals.hasPhotos) {
    score -= 15;
    qualityReason(penalties, "missing photos", -15);
  }
  if (
    !askedCasual &&
    isGenericRestaurantQualityIntent(intent) &&
    WEAK_OUTING_RE.test(signals.nameText) &&
    !strongOutingSignal
  ) {
    score -= 10;
    qualityReason(penalties, "quick-bite style name for generic outing", -10);
  }
  if (
    askedCasual &&
    /\b(casual|quick|fast casual|quick service|chicken|wings|fried chicken|hot chicken|pizza|slice|deli)\b/.test(
      signals.text,
    )
  ) {
    score += 20;
    qualityReason(reasons, "requested casual/quick/specific food fit", 20);
  }

  (r as any).restaurantOutingFitScore = score;
  (r as any).restaurantOutingFitReasons = reasons;
  (r as any).restaurantOutingFitPenalties = penalties;
  return { score, reasons, penalties };
}

export function scoreRestaurantQuality(
  r: EnterpriseLocation,
  intent: SearchIntent,
) {
  const outingFit = scoreRestaurantOutingFit(r, intent);
  const score = outingFit.score;
  const reasons = [...outingFit.reasons];
  const penalties = [...outingFit.penalties];

  (r as any).restaurantQualityScore = score;
  (r as any).restaurantQualityReasons = reasons;
  (r as any).restaurantQualityPenalties = penalties;
  return { score, outingFitScore: outingFit.score, reasons, penalties };
}

export function scoreActivityQuality(
  r: EnterpriseLocation,
  intent: SearchIntent,
) {
  const reasons: string[] = [];
  const penalties: string[] = [];
  const signals = baseQualitySignals(r);
  let score = 0;
  if (signals.curated) {
    score += 35;
    qualityReason(reasons, "curated/featured/premium", 35);
  }
  if (signals.rating >= 4.6 && signals.reviewCount >= 300) {
    score += 25;
    qualityReason(reasons, "rating >= 4.6 with 300+ reviews", 25);
  } else if (signals.rating >= 4.4 && signals.reviewCount >= 100) {
    score += 20;
    qualityReason(reasons, "rating >= 4.4 with 100+ reviews", 20);
  }
  if (signals.hasPhotos) {
    score += 15;
    qualityReason(reasons, "has photos", 15);
  }
  const sportsWatchIntent = userAskedToWatchSportsGame(intent);
  const sportsWatchScore = sportsWatchRecordSignal(r);
  const relaxedNoClubIntent = userAskedForRelaxedNoClub(intent);
  const relaxedScore = relaxedNoClubIntent ? relaxedActivityRecordSignal(r) : 0;
  if (relaxedNoClubIntent && relaxedScore > 0) {
    score += relaxedScore;
    qualityReason(reasons, "relaxed/casual activity fit", relaxedScore);
  }
  if (relaxedNoClubIntent && isHardNightlifeRecord(r)) {
    score -= 60;
    qualityReason(
      penalties,
      "hard nightlife result for relaxed/no-club query",
      -60,
    );
  }
  if (sportsWatchIntent && sportsWatchScore > 0) {
    score += sportsWatchScore;
    qualityReason(reasons, "sports/game-watch fit", sportsWatchScore);
  }
  if (sportsWatchIntent && sportsWatchScore <= 10) {
    score -= 45;
    qualityReason(penalties, "missing sports bar/TV/game-watch signal", -45);
  }
  if (sportsWatchIntent && isNightlifeOnlyForSportsWatch(r)) {
    score -= 55;
    qualityReason(
      penalties,
      "nightlife/rooftop-only result for sports-watch query",
      -55,
    );
  }
  if (
    !sportsWatchIntent &&
    !relaxedNoClubIntent &&
    /\b(rooftop|roof top|rooftop bar|rooftop lounge|terrace|skyline|views?|roof deck)\b/.test(
      signals.text,
    )
  ) {
    score += 30;
    qualityReason(reasons, "rooftop/terrace/skyline signal", 30);
  }
  if (
    !sportsWatchIntent &&
    !relaxedNoClubIntent &&
    /\b(cocktail|cocktails|lounge|bar|speakeasy|nightlife)\b/.test(signals.text)
  ) {
    score += 20;
    qualityReason(reasons, "drinks/lounge/nightlife signal", 20);
  }
  if (sportsWatchIntent && isBarPubForSportsWatch(r)) {
    score += 12;
    qualityReason(reasons, "bar/pub fit for sports-watch query", 12);
  }
  if (
    /\b(live dj|dj)\b/.test(signals.text) &&
    userAskedForHardNightlife(intent.rawQuery)
  ) {
    score += 10;
    qualityReason(reasons, "requested DJ/nightlife signal", 10);
  }
  if (signals.approved) {
    score += 8;
    qualityReason(reasons, "approved/published/verified status", 8);
  }

  const theaterRequested = userExplicitlyAskedForTheater(intent);
  if (isTheaterRecord(r) && theaterRequested) {
    score += 30;
    qualityReason(reasons, "requested theater/theatre", 30);
  }
  if (isTheaterRecord(r) && !theaterRequested) {
    score -= 60;
    qualityReason(penalties, "theater/performance not requested", -60);
  }
  const rooftopDrinksRequested =
    /\b(rooftop|drinks|cocktails|bar|lounge)\b/i.test(intent.rawQuery);
  const restaurantOnly =
    Boolean(r.restaurant_name || r.cuisine || r.cuisine_type) &&
    !/\b(rooftop|roof top|bar|lounge|cocktail|speakeasy|nightlife|terrace)\b/.test(
      signals.text,
    );
  if (rooftopDrinksRequested && restaurantOnly) {
    score -= 35;
    qualityReason(
      penalties,
      "restaurant-only activity without rooftop/bar relevance",
      -35,
    );
  }
  if (
    /\b(rooftop bars? nyc|best rooftop bars|top rooftop bars|rooftop bars list|guide to rooftop)\b/.test(
      signals.text,
    )
  ) {
    score -= 25;
    qualityReason(penalties, "aggregator/listing-style rooftop name", -25);
  }
  if (!signals.hasPhotos) {
    score -= 25;
    qualityReason(penalties, "missing photos", -25);
  }
  if ((r as any).is_low_level === true) {
    score -= 35;
    qualityReason(penalties, "low-level activity", -35);
  }

  (r as any).activityQualityScore = score;
  (r as any).activityQualityReasons = reasons;
  (r as any).activityQualityPenalties = penalties;
  return { score, reasons, penalties };
}

function intentText(intent: SearchIntent) {
  return [
    intent.rawQuery,
    intent.occasion,
    intent.budget,
    ...(Array.isArray(intent.vibe) ? intent.vibe : []),
    ...intent.restaurantIntent.mealTerms,
    ...intent.restaurantIntent.foodTerms,
    ...intent.restaurantIntent.cuisineTerms,
    ...intent.restaurantIntent.vibeTerms,
    ...intent.restaurantIntent.featureTerms,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replaceAll("_", " ");
}
function isCuratedIntent(intent: SearchIntent) {
  const t = intentText(intent);
  return (
    CURATED_TERMS.some((term) => t.includes(term)) &&
    !UTILITY_TERMS.some((term) => t.includes(term))
  );
}
function chainPenalty(r: EnterpriseLocation, intent: SearchIntent) {
  if (!isCuratedIntent(intent)) return 0;
  const isChain =
    r.is_chain === true ||
    String(r.brand_type || "").toLowerCase() === "chain" ||
    String(r.curation_tier || "").toLowerCase() === "utility";
  return isChain ? 500 : 0;
}
function rooftopMatch(r: EnterpriseLocation) {
  return /rooftop|roof top|terrace|patio|outdoor|skyline|view|roof deck/.test(
    textForRecord(r),
  );
}
export function explainRejection(
  record: EnterpriseLocation,
  intent: SearchIntent,
  domain: SearchDomain,
) {
  if (shouldExcludeByGeo(record, intent.geo)) return "wrong_geo";

  if (shouldHidePlaceOfWorship(record, intent)) {
    return "place_of_worship_not_requested";
  }

  if (
    domain === "activity" &&
    userAskedForHookah(intent) &&
    !isHookahRecord(record)
  ) {
    return "missing_hookah_signal";
  }

  if (
    domain === "activity" &&
    isTheaterRecord(record) &&
    !userExplicitlyAskedForTheater(intent)
  ) {
    return "theater_not_requested";
  }

  if (
    domain === "activity" &&
    hasRelaxedActivityIntent(intent.rawQuery) &&
    !userAskedForHardNightlife(intent.rawQuery) &&
    isHardNightlifeRecord(record)
  ) {
    return "hard_nightlife_not_relaxed";
  }

  if (domain === "restaurant" && isSportsWatchFoodSameVenueIntent(intent.rawQuery)) {
    const comboEligibility = isSportsWatchComboEligible(record, intent);
    (record as any).sportsWatchComboEligibility = comboEligibility.status;
    (record as any).sportsWatchComboEligibilityReasons = comboEligibility.reasons;
    if (!comboEligibility.eligible) {
      return "missing_sports_watch_food_same_venue_signal";
    }
  } else if (domain === "restaurant" && !isRestaurantLike(record)) {
    return "not_restaurant_domain";
  }

  if (domain === "activity" && !isActivityLike(record))
    return "not_activity_domain";

  const specificRestaurantTerms = [
    ...intent.restaurantIntent.foodTerms,
    ...intent.restaurantIntent.cuisineTerms,
  ].filter(
    (term) =>
      ![
        "birthday dinner",
        "dinner",
        "restaurant",
        "restaurants",
        "dining",
      ].includes(term.toLowerCase()),
  );

  const hasMealOnlyFallback =
    domain === "restaurant" &&
    Boolean(intent.timeContext || intent.restaurantIntent.mealTerms.length) &&
    specificRestaurantTerms.some((term) =>
      ["chicken", "wings", "fried chicken", "hot chicken"].includes(
        term.toLowerCase(),
      ),
    );

  if (
    domain === "restaurant" &&
    !isSportsWatchFoodSameVenueIntent(intent.rawQuery) &&
    specificRestaurantTerms.length > 0 &&
    !termMatchesRecord(record, specificRestaurantTerms) &&
    !hasMealOnlyFallback
  ) {
    return "missing_specific_food";
  }

  if (
    domain === "restaurant" &&
    !isSportsWatchFoodSameVenueIntent(intent.rawQuery) &&
    !matchesAnyAlternativeGroup(
      record,
      intent.restaurantIntent.alternativeGroups,
    )
  ) {
    return "missing_restaurant_alternative";
  }

  if (
    domain === "restaurant" &&
    intent.restaurantIntent.featureTerms.includes("rooftop") &&
    !rooftopMatch(record)
  )
    return "missing_rooftop_signal";

  const hasGenericActivityAlternative = (
    intent.activityIntent.alternativeGroups ?? []
  )
    .flat()
    .some((term) =>
      ["activity", "activities", "things to do", "experience"].includes(
        term.toLowerCase(),
      ),
    );
  const specificActivityTerms = intent.activityIntent.activityTerms.filter(
    (term) =>
      !["activity", "activities", "things to do", "experience"].includes(
        term.toLowerCase(),
      ),
  );

  if (
    domain === "activity" &&
    userAskedToWatchSportsGame(intent) &&
    isNightlifeOnlyForSportsWatch(record)
  ) {
    return "nightlife_only_not_sports_watch";
  }

  if (
    domain === "activity" &&
    isSpecificActivityIntent(intent.activityIntent) &&
    !hasGenericActivityAlternative &&
    specificActivityTerms.length > 0 &&
    !activityTermMatches(record, specificActivityTerms)
  )
    return "missing_specific_activity";

  if (
    domain === "activity" &&
    !matchesAnyAlternativeGroup(record, intent.activityIntent.alternativeGroups)
  ) {
    return "missing_activity_alternative";
  }

  return null;
}
export function filterRestaurantResults(
  results: EnterpriseLocation[],
  intent: SearchIntent,
) {
  return results.filter((r) => !explainRejection(r, intent, "restaurant"));
}
export function filterActivityResults(
  results: EnterpriseLocation[],
  intent: SearchIntent,
) {
  return results.filter((r) => !explainRejection(r, intent, "activity"));
}

function isFoodForwardRestaurantSearch(intent: SearchIntent) {
  const text = [
    intent.rawQuery,
    intent.normalizedQuery,
    intent.timeContext,
    intent.restaurantIntent?.foodTerms,
    intent.restaurantIntent?.cuisineTerms,
    intent.restaurantIntent?.mealTerms,
    intent.restaurantIntent?.featureTerms,
    intent.restaurantIntent?.categoryTerms,
    intent.restaurantIntent?.alternativeGroups?.flat(),
  ]
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replaceAll("_", " ")
    .replaceAll("-", " ");

  return /\b(lunch|dinner|brunch|breakfast|food|restaurant|dining|eat|chicken|wings|fried chicken|hot chicken|seafood|sushi|pizza|tacos|burger|burgers|steak|pasta|ramen|bbq|barbecue|lobster|crab|shrimp|oyster|oysters|raw bar)\b/.test(
    text,
  );
}

function activityNightlifeRestaurantPenalty(
  record: EnterpriseLocation,
  intent: SearchIntent,
) {
  if (!isFoodForwardRestaurantSearch(intent)) return 0;

  const text = fieldText(record, [
    "location_type",
    "source_table",
    "type",
    "primary_category",
    "category",
    "activity_type",
    "primary_tag",
    "cuisine",
    "cuisine_type",
    "food_type",
    "restaurant_name",
    "business_name",
    "name",
    "search_document",
    "semantic_search_text",
    "tags",
    "search_keywords",
    "semantic_tags",
    "intent_tags",
  ]);

  const isActivityRecord =
    /\b(activity|activities)\b/.test(
      String((record as any).location_type ?? "").toLowerCase(),
    ) ||
    /\b(activity|activities)\b/.test(
      String((record as any).source_table ?? "").toLowerCase(),
    ) ||
    /\b(activity|activities)\b/.test(
      String((record as any).type ?? "").toLowerCase(),
    );

  const isNightlifeTyped =
    /\b(nightlife|hookah|shisha|lounge|club|nightclub|night club|cigar|karaoke|speakeasy)\b/.test(
      text,
    );

  if (!isActivityRecord && !isNightlifeTyped) return 0;

  const hasRealRestaurantIdentity = Boolean(
    (record as any).restaurant_name ||
      (record as any).food_type ||
      (record as any).menu_url ||
      String((record as any).primary_category ?? "")
        .toLowerCase()
        .includes("restaurant"),
  );

  const hasSpecificFoodMatch =
    /\b(chicken|wings|fried chicken|hot chicken|seafood|sushi|pizza|tacos|burger|burgers|steak|pasta|ramen|bbq|barbecue|lobster|crab|shrimp|oyster|oysters|raw bar)\b/.test(
      text,
    );

  if (hasRealRestaurantIdentity && hasSpecificFoodMatch) return -35;
  if (hasRealRestaurantIdentity) return -125;
  if (isActivityRecord && isNightlifeTyped) return -500;
  if (isActivityRecord) return -300;
  if (isNightlifeTyped) return -220;

  return 0;
}

function relevance(
  r: EnterpriseLocation,
  intent: SearchIntent,
  domain: SearchDomain,
) {
  const geo = scoreGeoMatch(r, intent.geo);
  const dist = getLocationDistanceMiles(r, intent.geo);
  if (dist != null) r.distance_miles = Number(dist.toFixed(2));
  r.distance_score = scoreDistance(r, intent.geo);
  const terms =
    domain === "restaurant"
      ? [
          ...intent.restaurantIntent.foodTerms,
          ...intent.restaurantIntent.cuisineTerms,
          ...intent.restaurantIntent.mealTerms,
          ...intent.restaurantIntent.featureTerms,
          ...(intent.restaurantIntent.alternativeGroups ?? []).flat(),
        ]
      : [
          ...intent.activityIntent.activityTerms,
          ...intent.activityIntent.categoryTerms,
          ...intent.activityIntent.featureTerms,
          ...(intent.activityIntent.alternativeGroups ?? []).flat(),
        ];
  const sportsWatchIntent =
    domain === "activity" && userAskedToWatchSportsGame(intent);
  const termScore = terms.reduce((s, t) => {
    const matched = termMatchesRecord(r, [t]);
    if (!matched) return s;
    const normalizedTerm = String(t || "").toLowerCase();
    if (
      sportsWatchIntent &&
      /\b(sports bar|sports lounge|tv|tvs|screen|screens|watch game|watch the game|game day|watch party|live sports|bar with tv|bar with tvs)\b/.test(
        normalizedTerm,
      )
    ) {
      return s + 65;
    }
    return s + 35;
  }, 0);
  const alternativeScore =
    domain === "restaurant"
      ? (intent.restaurantIntent.alternativeGroups ?? []).some((group) =>
          termMatchesRecord(r, group),
        )
        ? 45
        : 0
      : (intent.activityIntent.alternativeGroups ?? []).some((group) =>
            termMatchesRecord(r, group),
          )
        ? 45
        : 0;
  const domainScore =
    domain === "restaurant"
      ? isRestaurantLike(r)
        ? 80
        : -80
      : isActivityLike(r)
        ? 80
        : -80;
  const generic =
    isGenericMealIntent(intent.restaurantIntent) && domain === "restaurant"
      ? 30
      : 0;
  const domainQuality =
    domain === "restaurant"
      ? scoreRestaurantQuality(r, intent).score
      : scoreActivityQuality(r, intent).score;
  const legacySingleVenueScore =
    domain === "restaurant" ? scoreSingleVenueWithMatch(r, intent).score : 0;
  const sameVenueAttributeScore =
    domain === "restaurant" ? scoreSameVenueAttributeMatch(r, intent).score : 0;
  const singleVenueWithScore = legacySingleVenueScore + sameVenueAttributeScore;
  const quality =
    Number(r.theouthaven_score ?? r.quality_score ?? 0) +
    Number(r.rating ?? 0) * 2 +
    Math.min(Number(r.review_count ?? 0) / 100, 10) +
    domainQuality +
    singleVenueWithScore;
  const restaurantFoodActivityPenalty =
    domain === "restaurant" ? activityNightlifeRestaurantPenalty(r, intent) : 0;

  r.term_score = termScore + alternativeScore + generic + singleVenueWithScore;
  r.geo_score = geo;
  r.domain_score = domainScore;
  r.quality_rank_score = quality;
  (r as any).restaurant_food_activity_penalty = restaurantFoodActivityPenalty;
  r.match_score =
    (r.term_score ?? 0) + domainScore + geo + restaurantFoodActivityPenalty;
  return (
    (r.match_score ?? 0) +
    (r.term_score ?? 0) +
    (r.geo_score ?? 0) +
    (r.domain_score ?? 0) +
    (r.distance_score ?? 0) +
    quality +
    restaurantFoodActivityPenalty -
    chainPenalty(r, intent) +
    sportsWatchFoodScore(r, intent) +
    wellnessIntentAdjustment(r, intent, domain) +
    Number(r.search_boost ?? 0) +
    ((r.ml_boost = calculateMlBoost(r.ml_score)), r.ml_boost ?? 0) +
    ((r.advanced_ml = calculateAdvancedMlRankingAdjustments({ ...(r as any).advanced_ml_features, ...r }, intent)),
    (r as any).advanced_ml.advancedMlBoost ?? 0)
  );
}
export function rankRestaurantResults(
  results: EnterpriseLocation[],
  intent: SearchIntent,
) {
  return filterRestaurantResults(results, intent).sort(
    (a, b) =>
      relevance(b, intent, "restaurant") - relevance(a, intent, "restaurant"),
  );
}
export function rankActivityResults(
  results: EnterpriseLocation[],
  intent: SearchIntent,
) {
  results.forEach((result) => scoreActivityQuality(result, intent));
  return filterActivityResults(results, intent).sort(
    (a, b) =>
      relevance(b, intent, "activity") - relevance(a, intent, "activity"),
  );
}
