import type { EnterpriseLocation, SearchIntent, SearchDomain } from "./types";
import { scoreGeoMatch, shouldExcludeByGeo } from "./geo-taxonomy";
import { getLocationDistanceMiles, scoreDistance } from "./distance";
import {
  activityTermMatches,
  isGenericMealIntent,
  isSpecificActivityIntent,
  termMatchesRecord,
  textForRecord,
  PLACE_OF_WORSHIP_TERMS,
  userAskedForPlaceOfWorship,
} from "./taxonomy";
import { isWellnessActivity } from "../lowLevel";
import {
  hasRelaxedActivityIntent,
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

function userAskedToWatchSportsGame(intent: SearchIntent): boolean {
  const text = [
    intent.rawQuery,
    ...intent.activityIntent.activityTerms,
    ...intent.activityIntent.categoryTerms,
    ...intent.activityIntent.featureTerms,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replaceAll("_", " ")
    .replaceAll("-", " ");

  return hasSportsWatchIntent(text);
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
  if (
    /\bsports bar\b|\bsports lounge\b|\bsport bar\b|\bsport lounge\b|\bbar & grill\b|\bbar and grill\b|\bpub\b|\btavern\b|\bplayoffs?\b|\bgame bar\b|\btv bar\b/.test(
      text,
    )
  )
    score += 55;
  if (
    /\btv\b|\btvs\b|\btelevision\b|\bscreen\b|\bscreens\b|\bbig screen\b|\bbig screens\b|\bprojector\b/.test(
      text,
    )
  )
    score += 35;
  if (
    /\bwatch party\b|\bgame day\b|\bgame night\b|\bshowing the game\b|\bwatch the game\b|\blive sports\b|\bsports viewing\b/.test(
      text,
    )
  )
    score += 45;
  if (
    /\bnba\b|\bnfl\b|\bmlb\b|\bnhl\b|\bwnba\b|\bknicks\b|\bnets\b|\byankees\b|\bmets\b|\bgiants\b|\bjets\b|\brangers\b|\bislanders\b|\bdevils\b|\bfootball\b|\bbasketball\b|\bbaseball\b|\bhockey\b|\bsoccer\b|\bufc\b|\bboxing\b/.test(
      text,
    )
  )
    score += 25;
  return score;
}


function userAskedForRelaxedNoClub(intent: SearchIntent): boolean {
  const q = String(intent.rawQuery ?? "").toLowerCase();
  return /\b(relaxed activity|relaxing activity|chill activity|easy activity|low key|low-key|laid back|laid-back|casual activity|casual|relaxed|chill|quiet|not too loud|no club|no clubs|not a club|no dancing|no live dj|no dj|cozy)\b/.test(q);
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

  if (/\bboard games?\b|\barcade\b|\bmini golf\b|\bbowling\b|\bgallery\b|\bmuseum\b|\bbilliards\b|\bpool hall\b|\bpaint and sip\b|\bcafe\b|\bdessert\b/.test(text)) {
    score += 35;
  }

  if (/\brelaxed\b|\bchill\b|\blow key\b|\blow-key\b|\blaid back\b|\blaid-back\b|\bcasual\b|\bquiet\b|\bcozy\b/.test(text)) {
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

  return /\bnightclub\b|\bdance club\b|\bclub\b|\bdancing\b|\bdance\b|\blive dj\b|\bdj\b|\bspeakeasy\b|\brooftop lounge\b|\brooftop\b|\broof top\b/i.test(text);
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

  if (isClearlyActivityOnly(r)) return false;

  return strongRestaurantSignal || foodSignal || loungeWithFood;
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
    score += 20;
    qualityReason(reasons, "outing category/type dining signal", 20);
  }
  if (outingDescriptionMatch) {
    score += 15;
    qualityReason(reasons, "date-night/ambiance/dinner tag signal", 15);
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
    qualityReason(penalties, "hard nightlife result for relaxed/no-club query", -60);
  }
  if (sportsWatchIntent && sportsWatchScore > 0) {
    score += sportsWatchScore;
    qualityReason(reasons, "sports/game-watch fit", sportsWatchScore);
  }
  if (sportsWatchIntent && sportsWatchScore <= 0) {
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

  if (domain === "restaurant" && !isRestaurantLike(record))
    return "not_restaurant_domain";

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

  if (
    domain === "restaurant" &&
    specificRestaurantTerms.length > 0 &&
    !termMatchesRecord(record, specificRestaurantTerms)
  )
    return "missing_specific_food";

  if (
    domain === "restaurant" &&
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
  const quality =
    Number(r.theouthaven_score ?? r.quality_score ?? 0) +
    Number(r.rating ?? 0) * 2 +
    Math.min(Number(r.review_count ?? 0) / 100, 10) +
    domainQuality;
  r.term_score = termScore + alternativeScore + generic;
  r.geo_score = geo;
  r.domain_score = domainScore;
  r.quality_rank_score = quality;
  r.match_score = (r.term_score ?? 0) + domainScore + geo;
  return (
    (r.match_score ?? 0) +
    (r.term_score ?? 0) +
    (r.geo_score ?? 0) +
    (r.domain_score ?? 0) +
    (r.distance_score ?? 0) +
    quality -
    chainPenalty(r, intent) +
    wellnessIntentAdjustment(r, intent, domain) +
    Number(r.search_boost ?? 0)
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
