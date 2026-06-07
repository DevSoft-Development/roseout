import { handleOptions } from "../_shared/cors.ts";
import {
  badRequest,
  ok,
  serverError,
  unauthorized,
} from "../_shared/response.ts";
import { createSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { getUserFromRequest } from "../_shared/auth.ts";
import {
  fastParseSearchIntent,
  normalizeIntent,
  parserConfidence,
} from "../_shared/fastSearchParser.ts";
import {
  getCachedIntent,
  saveCachedIntent,
} from "../_shared/searchIntentCache.ts";
import {
  haversineMiles,
  hasCoordinates,
  walkingMinutesFromMiles,
} from "../_shared/distance.ts";
import { hasValidPhoto } from "../_shared/photos.ts";
import {
  logEdgeFunctionRun,
  safeError,
  startTimer,
} from "../_shared/logger.ts";

const SEARCH_INTENT_FAST_MODEL =
  Deno.env.get("SEARCH_INTENT_FAST_MODEL") || "gpt-4o-mini";
const SEARCH_INTENT_FALLBACK_MODEL =
  Deno.env.get("SEARCH_INTENT_FALLBACK_MODEL") || "gpt-4o";
const SEARCH_INTENT_CACHE_VERSION =
  Deno.env.get("SEARCH_INTENT_CACHE_VERSION") || "intent-v4-fast-model";
const STEAK_TERMS = [
  "steak",
  "steakhouse",
  "steak house",
  "ribeye",
  "porterhouse",
  "filet",
  "filet mignon",
  "sirloin",
  "tomahawk",
  "prime rib",
  "churrasco",
  "brazilian steakhouse",
];
const THEATER_TERMS = [
  "theater",
  "theatre",
  "cinema",
  "movie theater",
  "movie theatre",
  "movie_theater",
  "movies",
  "showtimes",
  "box office",
  "performing arts",
  "performing_arts",
  "performance",
  "playhouse",
  "concert hall",
  "opera house",
];
const THEATER_INTENT_TERMS = [...THEATER_TERMS, "movie", "show"];
const NIGHTLIFE_TERMS = [
  "cocktail",
  "cocktails",
  "drink",
  "drinks",
  "lounge",
  "rooftop bar",
  "wine bar",
  "speakeasy",
  "nightlife",
  "hookah",
  "bar",
];
const GENERIC_RESTAURANT_TERMS = new Set([
  "dinner",
  "restaurant",
  "restaurants",
  "dining",
  "lunch",
  "brunch",
  "breakfast",
  "meal",
  "food",
  "eat",
  "eats",
]);
const HOOKAH_TERMS = ["hookah", "hookah lounge", "hookah bar", "shisha"];
const BROAD_NIGHTLIFE_TERMS = new Set([
  "lounge",
  "drinks",
  "drink",
  "cocktails",
  "cocktail",
  "cocktail bar",
  "wine bar",
  "nightlife",
  "bar",
  "rooftop bar",
  "rooftop lounge",
  "club",
  "dance club",
  "dancing",
  "live dj",
  "speakeasy",
]);
const SPORTS_WATCH_BLOCKED_ACTIVITY_TERMS = new Set([
  "nightlife", "lounge", "rooftop lounge", "rooftop", "roof top", "club", "dance club", "dancing", "nightclub", "live dj", "dj", "speakeasy", "skating", "roller skating", "ice skating", "golf", "driving range", "batting cages", "climbing", "rock climbing", "gym", "roller", "ice", "driving", "range", "batting", "cages", "rock",
]);
const SPORTS_WATCH_REQUIRED_ACTIVITY_TERMS = [
  "sports bar", "sports lounge", "sport lounge", "bar with tv", "bar with tvs", "bar with screens", "tv bar", "big screen", "big screens", "watch party", "game day", "game night", "live sports", "sports viewing", "pub", "tavern", "bar and grill", "bar", "tv", "tvs", "screens",
];

const HARD_NIGHTLIFE_ACTIVITY_TERMS = new Set([
  "nightlife",
  "rooftop lounge",
  "rooftop",
  "roof top",
  "club",
  "dance club",
  "nightclub",
  "dancing",
  "dance",
  "live dj",
  "dj",
  "speakeasy",
]);
const RELAXED_ACTIVITY_REQUIRED_TERMS = [
  "relaxed activity", "chill activity", "easy activity", "low key", "laid back", "casual activity", "board games", "arcade", "mini golf", "bowling", "gallery", "museum", "billiards", "pool hall", "paint and sip", "cafe", "dessert",
];
const SEARCH_FIELDS = [
  "name",
  "restaurant_name",
  "activity_name",
  "cuisine",
  "cuisine_type",
  "food_type",
  "primary_category",
  "category",
  "tags",
  "description",
  "search_document",
  "google_types",
  "activity_type",
  "location_type",
];
function textOf(item: Record<string, unknown>) {
  return SEARCH_FIELDS.map((field) =>
    Array.isArray(item[field])
      ? (item[field] as unknown[]).join(" ")
      : item[field],
  )
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}
function hasAny(item: Record<string, unknown>, terms: string[]) {
  const hay = textOf(item);
  return terms.some((term) => hay.includes(term.toLowerCase()));
}
function score(item: Record<string, unknown>, terms: string[]) {
  const hay = textOf(item);
  return (
    terms.reduce((sum, term) => sum + (hay.includes(term) ? 10 : 0), 0) +
    Number(item.rating ?? 0)
  );
}
function normalizeTerm(term: string) {
  return term.trim().toLowerCase();
}
function uniqueTerms(items: unknown[]) {
  return Array.from(
    new Set(items.map((term) => String(term ?? "").trim()).filter(Boolean)),
  );
}
function normalizeSportsWatchTerm(term: string) {
  return String(term || "")
    .toLowerCase()
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeIntentTerm(term: string) {
  return String(term || "")
    .toLowerCase()
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .trim()
    .replace(/\s+/g, " ");
}
function normalizeFinalTerm(term: string) {
  return String(term || "").toLowerCase().replaceAll("_", " ").replaceAll("-", " ").trim().replace(/\s+/g, " ");
}
const PHRASE_TOKEN_STOPWORDS = new Set(["and","with","to","do","the","a","an","for","in","near","nearby","after","before","then","low","key","laid","back","mini","paint","sip","live","big","good","best","spot","idea","things","party","game","day","night","date","screen","viewing","open","mic","house","mignon","prime","rib","raw","fried","outdoor","scenic","dining","center","cultural","art","alley","lanes","range","cages","rock","ice","roller","sport","sports","watch"]);
const ACTIVITY_ALLOWED_SINGLE_WORDS = new Set(["bar","pub","tavern","karaoke","comedy","museum","gallery","arcade","bowling","billiards","pool","hookah","shisha","jazz","rooftop","cocktails","drinks","speakeasy","lounge","activity","games","cafe","dessert","wine","tv","tvs","screens","music","views","terrace","skyline","basketball","football","baseball","hockey"]);
const RESTAURANT_ALLOWED_SINGLE_WORDS = new Set(["dinner","brunch","lunch","breakfast","restaurant","steak","steakhouse","seafood","sushi","japanese","mexican","italian","thai","american","tacos","taco","pizza","pasta","lobster","crab","shrimp","oyster","oysters","romantic","casual","birthday","anniversary","views","rooftop","terrace","skyline"]);
function finalCleanTermList(terms: string[], allowedSingles: Set<string>) {
  return uniqueTerms(terms.map((term) => normalizeFinalTerm(String(term))).filter((term) => term && (term.includes(" ") || (!PHRASE_TOKEN_STOPWORDS.has(term) && allowedSingles.has(term)))));
}
function emptyPairingPreference() { return { requiresPairing: false, distanceMode: "any", maxPairDistanceMiles: null, maxPairWalkingMinutes: null, requireWalkablePair: false }; }
function isActivityVenueOnlyQuery(query: string) {
  const q = String(query || "").toLowerCase();
  const hasActivityVenue = /\b(cocktail bar|wine bar|rooftop bar|rooftop lounge|sports bar|sports lounge|sport lounge|hookah bar|karaoke bar|comedy club|jazz club|lounge|speakeasy|bar with tv|bar with tvs|bar with screens|quiet lounge|upscale lounge)\b/.test(q);
  const hasExplicitMeal = /\b(dinner|brunch|lunch|breakfast|restaurant|eat|food before|food after|steak|seafood|sushi|mexican|italian)\b/.test(q);
  return hasActivityVenue && !hasExplicitMeal;
}
function finalDomainCleanup(intent: Record<string, any>) {
  if (isActivityVenueOnlyQuery(String(intent.rawQuery ?? ""))) {
    return { ...intent, searchType: "activity", primaryDomain: "activity", needsRestaurant: false, needsActivity: true, wantsPairing: false, restaurantIntent: emptyRestaurantIntent(), pairingPreference: emptyPairingPreference() };
  }
  if (!intent.needsActivity || intent.searchType === "restaurant") return { ...intent, searchType: "restaurant", primaryDomain: "restaurant", needsActivity: false, needsRestaurant: true, activityIntent: emptyActivityIntent(), wantsPairing: false, pairingPreference: emptyPairingPreference() };
  if (!intent.needsRestaurant || intent.searchType === "activity") return { ...intent, searchType: "activity", primaryDomain: "activity", needsRestaurant: false, needsActivity: true, restaurantIntent: emptyRestaurantIntent(), wantsPairing: false, pairingPreference: emptyPairingPreference() };
  return intent;
}
function finalCleanIntentTerms(intent: Record<string, any>) {
  return { ...intent,
    activityIntent: { ...(intent.activityIntent ?? emptyActivityIntent()), activityTerms: finalCleanTermList(intent.activityIntent?.activityTerms ?? [], ACTIVITY_ALLOWED_SINGLE_WORDS), categoryTerms: finalCleanTermList(intent.activityIntent?.categoryTerms ?? [], ACTIVITY_ALLOWED_SINGLE_WORDS), featureTerms: finalCleanTermList(intent.activityIntent?.featureTerms ?? [], ACTIVITY_ALLOWED_SINGLE_WORDS), vibeTerms: finalCleanTermList(intent.activityIntent?.vibeTerms ?? [], ACTIVITY_ALLOWED_SINGLE_WORDS), negativeTerms: finalCleanTermList(intent.activityIntent?.negativeTerms ?? [], ACTIVITY_ALLOWED_SINGLE_WORDS) },
    restaurantIntent: { ...(intent.restaurantIntent ?? emptyRestaurantIntent()), mealTerms: finalCleanTermList(intent.restaurantIntent?.mealTerms ?? [], RESTAURANT_ALLOWED_SINGLE_WORDS), foodTerms: finalCleanTermList(intent.restaurantIntent?.foodTerms ?? [], RESTAURANT_ALLOWED_SINGLE_WORDS), cuisineTerms: finalCleanTermList(intent.restaurantIntent?.cuisineTerms ?? [], RESTAURANT_ALLOWED_SINGLE_WORDS), categoryTerms: finalCleanTermList(intent.restaurantIntent?.categoryTerms ?? [], RESTAURANT_ALLOWED_SINGLE_WORDS), vibeTerms: finalCleanTermList(intent.restaurantIntent?.vibeTerms ?? [], RESTAURANT_ALLOWED_SINGLE_WORDS), featureTerms: finalCleanTermList(intent.restaurantIntent?.featureTerms ?? [], RESTAURANT_ALLOWED_SINGLE_WORDS), negativeTerms: finalCleanTermList(intent.restaurantIntent?.negativeTerms ?? [], RESTAURANT_ALLOWED_SINGLE_WORDS) },
  };
}
function hasNoClubIntent(query: string | null | undefined) {
  const q = String(query ?? "").toLowerCase();
  return /\b(no club|no clubs|not a club|not clubs|avoid clubs|without clubs|no dancing|not dancing|no nightclub|no nightclubs|not a nightclub|no dj|no live dj|not too loud)\b/.test(q);
}
function hasRelaxedOrCasualActivityIntent(query: string | null | undefined) {
  const q = String(query ?? "").toLowerCase();
  return /\b(relaxed activity|relaxing activity|chill activity|easy activity|low key|low-key|laid back|laid-back|casual activity|casual|relaxed|chill|quiet|not too loud|cozy|easy first date)\b/.test(q) || hasNoClubIntent(q);
}
function cleanupRelaxedActivityTerms(terms: string[]) {
  return uniqueTerms([
    ...terms
      .map((term) => normalizeIntentTerm(String(term)))
      .filter((term) => term && !HARD_NIGHTLIFE_ACTIVITY_TERMS.has(term)),
    ...RELAXED_ACTIVITY_REQUIRED_TERMS,
  ]);
}
function relaxedActivityTermsRemoved(terms: string[]) {
  return uniqueTerms(
    terms
      .map((term) => normalizeIntentTerm(String(term)))
      .filter((term) => term && HARD_NIGHTLIFE_ACTIVITY_TERMS.has(term)),
  );
}
function cleanupRelaxedIntent(intent: Record<string, any>) {
  if (!hasRelaxedOrCasualActivityIntent(intent.rawQuery)) return intent;

  return {
    ...intent,
    activityIntent: {
      ...(intent.activityIntent ?? {}),
      activityTerms: cleanupRelaxedActivityTerms(intent.activityIntent?.activityTerms ?? []),
      negativeTerms: uniqueTerms([
        ...(intent.activityIntent?.negativeTerms ?? []).map((term: unknown) => normalizeIntentTerm(String(term))),
        ...(hasNoClubIntent(intent.rawQuery)
          ? ["club", "clubs", "dance club", "nightclub", "dancing", "live dj", "dj", "speakeasy", "rooftop lounge", "nightlife"]
          : []),
      ]),
    },
  };
}
function cleanupSearchIntent(intent: Record<string, any>) {
  let cleaned = cleanupSportsWatchIntent(intent);
  cleaned = cleanupRelaxedIntent(cleaned);
  cleaned = finalDomainCleanup(cleaned);
  cleaned = finalCleanIntentTerms(cleaned);
  return cleaned;
}
function emptyGeoIntent() {
  return { raw: null, aliases: [], latitude: null, longitude: null, radiusMiles: null, geoStrictness: "none", neighborhood: null, city: null, borough: null, county: null, region: null, state: null };
}
function emptyRestaurantIntent() {
  return { mealTerms: [], foodTerms: [], cuisineTerms: [], categoryTerms: [], vibeTerms: [], featureTerms: [], negativeTerms: [], alternativeGroups: [] };
}
function emptyActivityIntent() {
  return { activityTerms: [], categoryTerms: [], vibeTerms: [], featureTerms: [], negativeTerms: [], alternativeGroups: [] };
}
const SPORTS_TEAM_TERMS = ["knicks","nets","lakers","warriors","celtics","heat","bucks","sixers","76ers","bulls","mavericks","mavs","suns","clippers","nuggets","timberwolves","wolves","thunder","grizzlies","pelicans","kings","trail blazers","blazers","jazz","rockets","spurs","raptors","pacers","cavaliers","cavs","magic","hawks","hornets","pistons","wizards","giants","jets","cowboys","eagles","commanders","patriots","chiefs","ravens","steelers","bills","dolphins","bengals","browns","texans","colts","jaguars","titans","broncos","raiders","chargers","packers","bears","lions","vikings","falcons","panthers","saints","buccaneers","bucs","cardinals","rams","49ers","seahawks","yankees","mets","dodgers","red sox","cubs","white sox","phillies","braves","astros","rangers","blue jays","orioles","rays","guardians","tigers","royals","twins","angels","athletics","mariners","nationals","marlins","brewers","pirates","reds","diamondbacks","rockies","padres","islanders","devils","bruins","flyers","penguins","capitals","hurricanes","panthers","lightning","maple leafs","leafs","canadiens","senators","sabres","red wings","blackhawks","blues","predators","wild","stars","avalanche","golden knights","knights","kraken","canucks","oilers","flames","ducks","sharks","coyotes","liberty","aces","sun","storm","sparks","mercury","sky","fever","wings","dream","mystics","lynx","valkyries","march madness","final four","duke","unc","north carolina","uconn","kentucky","kansas","villanova","gonzaga","alabama","michigan","ohio state","penn state","notre dame","syracuse"];
const SPORTS_LEAGUE_TERMS = ["nba","nfl","mlb","nhl","wnba","ufc","boxing","soccer","football","basketball","baseball","hockey","college basketball","college football","march madness","final four"];
function includesFastPathPhrase(query: string, term: string) { return new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}([^a-z0-9]|$)`, "i").test(query); }
function hasMealOrRestaurantTerm(query: string) { const q = String(query || "").toLowerCase(); return /\b(dinner|brunch|lunch|breakfast|restaurant|food|eat|steakhouse|steak|seafood|sushi|mexican|italian|tacos|pizza|birthday dinner|anniversary dinner)\b/.test(q); }
function hasActivityVenueOrActivityTerm(query: string) { const q = String(query || "").toLowerCase(); return /\b(activity|things to do|something fun|karaoke|comedy|comedy club|comedy show|bowling|arcade|museum|museum date|hookah|hookah lounge|lounge|cocktail bar|wine bar|bar with|bar showing|sports bar|sports lounge|rooftop bar|rooftop lounge|rooftop drinks|paint and sip|sip and paint|mini golf|live jazz|jazz|live music|pool hall|billiards|game day|watch party)\b/.test(q); }
function hasExplicitMixedOutingIntent(query: string) { const q = String(query || "").toLowerCase(); return /\b(and|with|after|before|then|nearby|close by|walking distance|walk apart|close together)\b/.test(q) && hasMealOrRestaurantTerm(q) && hasActivityVenueOrActivityTerm(q); }
function hasSportsWatchFastPathIntent(query: string) {
  const q = String(query || "").toLowerCase();
  const explicitPhrase = /\b(sports bar|sports lounge|bar with tv|bar with tvs|bar with screens|watch the game|watch game|watch party|game day|game night|live sports|showing the game|ufc fight|boxing fight)\b/.test(q);
  const hasTeamOrLeague = [...SPORTS_TEAM_TERMS, ...SPORTS_LEAGUE_TERMS].some((term) => includesFastPathPhrase(q, term));
  const hasViewingLanguage = /\b(watch|showing|viewing|see|catch|plays?|game|match|fight|watch party|game day)\b/.test(q);
  const hasVenueLanguage = /\b(bar|pub|sports bar|sports lounge|sport lounge|tavern|lounge|grill|tv|tvs|screen|screens|big screen|big screens)\b/.test(q);
  const hasSportOnlyViewing = /\b(where can i watch|watch basketball|watch football|watch baseball|watch hockey|football bar|basketball bar|baseball bar|hockey bar|nba bar|nfl bar|mlb bar|nhl bar|wnba bar|sports bar with wings and tvs)\b/.test(q);
  return explicitPhrase || (hasTeamOrLeague && (hasViewingLanguage || hasVenueLanguage)) || hasSportOnlyViewing;
}
function sportsWatchActivityTermsFromQuery(query: string) {
  const q = String(query || "").toLowerCase();
  const teams = SPORTS_TEAM_TERMS.filter((term) => includesFastPathPhrase(q, term));
  const leagues = SPORTS_LEAGUE_TERMS.filter((term) => includesFastPathPhrase(q, term));
  const terms = [...SPORTS_WATCH_REQUIRED_ACTIVITY_TERMS, ...teams.map((term) => `${term} game`), ...leagues.map((term) => `${term} game`)];
  if (/\b(basketball|nba|knicks|nets|lakers|warriors|celtics|duke|uconn|march madness|final four)\b/.test(q)) terms.push("basketball", "watch basketball");
  if (/\b(football|nfl|giants|jets|cowboys|eagles|chiefs)\b/.test(q)) terms.push("football", "watch football");
  if (/\b(baseball|mlb|yankees|mets|dodgers|red sox)\b/.test(q)) terms.push("baseball", "watch baseball");
  if (/\b(hockey|nhl|rangers|islanders|devils)\b/.test(q)) terms.push("hockey", "watch hockey");
  if (/\b(ufc|boxing|fight)\b/.test(q)) terms.push("fight night", "ufc fight", "boxing fight");
  return finalCleanTermList(uniqueTerms(terms), ACTIVITY_ALLOWED_SINGLE_WORDS);
}
function createExplicitMixedFastPathIntent(rawQuery: string) {
  const q = rawQuery.toLowerCase();
  const restaurantIntent = createRestaurantOnlyFastPathIntent(rawQuery).restaurantIntent ?? emptyRestaurantIntent();
  const activityIntent = createActivityOnlyFastPathIntent(rawQuery).activityIntent ?? emptyActivityIntent();
  return { rawQuery, searchType: "mixed_outing", primaryDomain: "mixed", needsRestaurant: true, needsActivity: true, wantsPairing: true, strictness: "high", vibe: [], partySize: null, geo: emptyGeoIntent(), restaurantIntent, activityIntent, pairingPreference: { requiresPairing: true, distanceMode: /\bwalk|walking|nearby|close by|walk apart\b/.test(q) ? "walking" : "any", maxPairDistanceMiles: null, maxPairWalkingMinutes: null, requireWalkablePair: /\bwalk|walking|walk apart\b/.test(q) }, confidence: 0.9 };
}
function createSportsWatchFastPathIntent(rawQuery: string) {
  return { rawQuery, searchType: "activity", primaryDomain: "activity", needsRestaurant: false, needsActivity: true, wantsPairing: false, restaurantIntent: emptyRestaurantIntent(), activityIntent: { activityTerms: sportsWatchActivityTermsFromQuery(rawQuery), categoryTerms: ["sports bar"], vibeTerms: [], featureTerms: ["tv"], negativeTerms: [], alternativeGroups: [] }, pairingPreference: { requiresPairing: false, distanceMode: "any", maxPairDistanceMiles: null, maxPairWalkingMinutes: null, requireWalkablePair: false }, geo: emptyGeoIntent(), vibe: rawQuery.toLowerCase().includes("best") ? ["best"] : [], strictness: "high", confidence: 0.9 };
}
function hasRelaxedMixedFastPathIntent(query: string) {
  const q = String(query || "").toLowerCase();
  return /\b(dinner|brunch|lunch|breakfast|restaurant|food|eat)\b/.test(q) && /\b(relaxed activity|relaxing activity|chill activity|easy activity|low key|low-key|laid back|laid-back|casual activity|activity|something fun|board games|arcade|mini golf|bowling|gallery|museum|billiards|pool hall|not too loud|no club|not a club)\b/.test(q);
}
function createRelaxedMixedFastPathIntent(rawQuery: string) {
  const q = rawQuery.toLowerCase();
  return { rawQuery, searchType: "mixed_outing", primaryDomain: "mixed", needsRestaurant: true, needsActivity: true, wantsPairing: true, strictness: "high", vibe: q.includes("casual") ? ["casual"] : [], partySize: null, geo: emptyGeoIntent(), restaurantIntent: { mealTerms: q.includes("brunch") ? ["brunch"] : q.includes("lunch") ? ["lunch"] : q.includes("breakfast") ? ["breakfast"] : ["dinner"], foodTerms: [], cuisineTerms: [], categoryTerms: [], vibeTerms: q.includes("casual") ? ["casual"] : [], featureTerms: [], negativeTerms: [], alternativeGroups: [] }, activityIntent: { activityTerms: ["relaxed activity", "relaxing activity", "chill activity", "easy activity", "low key", "laid back", "casual activity", "board games", "arcade", "mini golf", "bowling", "gallery", "museum", "billiards", "pool hall", "activity"], categoryTerms: [], vibeTerms: ["relaxed", "casual", "chill"], featureTerms: [], negativeTerms: hasNoClubIntent(rawQuery) ? ["club", "dance club", "nightclub", "dancing", "live dj", "dj", "speakeasy", "nightlife"] : [], alternativeGroups: [] }, pairingPreference: { requiresPairing: true, distanceMode: /\bwalk|walking|nearby|close by|close together|within walking distance\b/.test(q) ? "walking" : "any", maxPairDistanceMiles: null, maxPairWalkingMinutes: /\b30 minute|30-minute\b/.test(q) ? 30 : null, requireWalkablePair: /\bwalk|walking|within walking distance\b/.test(q) }, confidence: 0.9 };
}
function hasActivityOnlyFastPathIntent(query: string) {
  const q = String(query || "").toLowerCase();
  const hasRestaurantMeal = /\b(dinner|brunch|lunch|breakfast|restaurant|food|steak|seafood|sushi|mexican|italian)\b/.test(q);
  const hasActivity = /\b(rooftop drinks|rooftop lounge|rooftop bar|cocktail bar|cocktails|lounge|speakeasy|karaoke|comedy show|comedy|hookah lounge|hookah|shisha|jazz lounge|live music|bowling|arcade|museum|paint and sip|things to do|fun activity|date idea)\b/.test(q);
  return hasActivity && !hasRestaurantMeal;
}
function createActivityOnlyFastPathIntent(rawQuery: string) {
  const q = rawQuery.toLowerCase();
  const activityTerms: string[] = [];
  if (/\brooftop\b/.test(q)) activityTerms.push("rooftop bar", "rooftop lounge", "rooftop drinks", "rooftop cocktails", "terrace bar", "terrace lounge", "skyline bar", "skyline lounge", "views", "outdoor bar", "bar", "lounge", "cocktails", "drinks");
  else if (/\bhookah\b|\bshisha\b/.test(q)) activityTerms.push("hookah", "hookah lounge", "hookah bar", "shisha", "lounge", "bar");
  else if (/\bkaraoke\b/.test(q)) activityTerms.push("karaoke");
  else if (/\bcomedy\b|\bshow\b/.test(q)) activityTerms.push("comedy show", "comedy", "show", "theater", "theatre");
  else if (/\bspeakeasy\b/.test(q)) activityTerms.push("speakeasy", "cocktails", "bar", "lounge");
  else if (/\bcocktail|cocktails|bar\b/.test(q)) activityTerms.push("cocktail bar", "cocktails", "bar", "lounge", "wine bar", "speakeasy");
  else if (/\blounge\b/.test(q)) activityTerms.push("lounge", "bar", "cocktails", "nightlife");
  else if (/\bthings to do|fun activity|date idea|first date|surprise me\b/.test(q)) activityTerms.push("activity", "things to do", "entertainment", "experience", "arcade", "bowling", "mini golf", "museum", "gallery", "comedy", "karaoke");
  return { rawQuery, searchType: "activity", primaryDomain: "activity", needsRestaurant: false, needsActivity: true, wantsPairing: false, strictness: "high", vibe: [], partySize: null, geo: emptyGeoIntent(), restaurantIntent: emptyRestaurantIntent(), activityIntent: { activityTerms: uniqueTerms(activityTerms), categoryTerms: [], vibeTerms: [], featureTerms: [], negativeTerms: [], alternativeGroups: [] }, pairingPreference: { requiresPairing: false, distanceMode: "any", maxPairDistanceMiles: null, maxPairWalkingMinutes: null, requireWalkablePair: false }, confidence: 0.88 };
}
function hasRestaurantOnlyFastPathIntent(query: string) {
  const q = String(query || "").toLowerCase();
  return /\b(restaurant|dinner|brunch|lunch|breakfast|steakhouse|steak|seafood|sushi|mexican|italian|food|casual dinner|birthday dinner|romantic italian|brunch spot)\b/.test(q) && !/\b(activity|things to do|karaoke|comedy|bowling|arcade|museum|hookah|lounge|bar|drinks|cocktails|rooftop|watch|game)\b/.test(q);
}
function createRestaurantOnlyFastPathIntent(rawQuery: string) {
  const q = rawQuery.toLowerCase();
  const mealTerms: string[] = [];
  const cuisineTerms: string[] = [];
  const foodTerms: string[] = [];
  const vibeTerms: string[] = [];
  if (/\bbrunch\b/.test(q)) mealTerms.push("brunch");
  if (/\bbreakfast\b/.test(q)) mealTerms.push("breakfast");
  if (/\blunch\b/.test(q)) mealTerms.push("lunch");
  if (/\bdinner\b/.test(q)) mealTerms.push("dinner");
  if (mealTerms.length === 0 && /\brestaurant|steakhouse|food|spot\b/.test(q)) mealTerms.push("dinner");
  if (/\bsteak|steakhouse\b/.test(q)) { cuisineTerms.push("steak"); foodTerms.push("steak", "steakhouse", "steak house", "ribeye", "porterhouse", "filet", "sirloin"); }
  if (/\bseafood\b/.test(q)) { cuisineTerms.push("seafood"); foodTerms.push("seafood", "fish", "lobster", "crab", "shrimp", "oyster", "raw bar"); }
  if (/\bsushi\b/.test(q)) { cuisineTerms.push("sushi", "japanese"); foodTerms.push("sushi", "sashimi", "omakase", "nigiri", "maki", "rolls"); }
  if (/\bmexican\b/.test(q)) { cuisineTerms.push("mexican"); foodTerms.push("mexican", "tacos", "taco", "burritos", "birria", "taqueria", "tex-mex"); }
  if (/\bitalian\b/.test(q)) { cuisineTerms.push("italian"); foodTerms.push("italian", "pasta", "pizza", "trattoria", "osteria", "ristorante"); }
  if (/\bromantic|date night\b/.test(q)) vibeTerms.push("romantic", "date night");
  if (/\bcasual\b/.test(q)) vibeTerms.push("casual");
  if (/\bbirthday\b/.test(q)) vibeTerms.push("birthday");
  return { rawQuery, searchType: "restaurant", primaryDomain: "restaurant", needsRestaurant: true, needsActivity: false, wantsPairing: false, strictness: "high", vibe: uniqueTerms(vibeTerms), partySize: null, geo: emptyGeoIntent(), restaurantIntent: { mealTerms: uniqueTerms(mealTerms), foodTerms: uniqueTerms(foodTerms), cuisineTerms: uniqueTerms(cuisineTerms), categoryTerms: [], vibeTerms: uniqueTerms(vibeTerms), featureTerms: [], negativeTerms: [], alternativeGroups: [] }, activityIntent: emptyActivityIntent(), pairingPreference: { requiresPairing: false, distanceMode: "any", maxPairDistanceMiles: null, maxPairWalkingMinutes: null, requireWalkablePair: false }, confidence: 0.9 };
}
function createEdgeFastPathIntent(rawQuery: string) {
  const q = rawQuery.toLowerCase().trim();
  if (hasSportsWatchFastPathIntent(q)) return { intent: createSportsWatchFastPathIntent(rawQuery), reason: "matched sports-watch activity fast path", confidence: 0.9 };
  if (hasExplicitMixedOutingIntent(q)) return { intent: createExplicitMixedFastPathIntent(rawQuery), reason: "matched explicit mixed outing fast path", confidence: 0.9 };
  if (hasRelaxedMixedFastPathIntent(q)) return { intent: createRelaxedMixedFastPathIntent(rawQuery), reason: "matched relaxed mixed outing fast path", confidence: 0.9 };
  if (isActivityVenueOnlyQuery(q)) return { intent: createActivityOnlyFastPathIntent(rawQuery), reason: "matched activity-only venue fast path", confidence: 0.88 };
  if (hasActivityOnlyFastPathIntent(q)) return { intent: createActivityOnlyFastPathIntent(rawQuery), reason: "matched activity-only fast path", confidence: 0.88 };
  if (hasRestaurantOnlyFastPathIntent(q)) return { intent: createRestaurantOnlyFastPathIntent(rawQuery), reason: "matched restaurant-only fast path", confidence: 0.9 };
  return { intent: null, reason: null, confidence: 0 };
}
function hasSportsWatchIntent(intent: Record<string, any>) {
  const text = [
    intent.rawQuery,
    ...(intent.activityIntent?.activityTerms ?? []),
    ...(intent.activityIntent?.categoryTerms ?? []),
    ...(intent.activityIntent?.featureTerms ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replaceAll("_", " ")
    .replaceAll("-", " ");

  const sportsOrGame =
    /\b(watch|showing|viewing|game|match|fight|ufc|boxing|nba|nfl|mlb|nhl|wnba|soccer|football|basketball|baseball|hockey|knicks|nets|lakers|warriors|celtics|cowboys|eagles|chiefs|dodgers|red sox|duke|uconn|yankees|mets|giants|jets|rangers|islanders|devils|march madness|final four)\b/.test(
      text,
    );

  const venueOrViewing =
    /\b(bar|sports bar|sports lounge|sport lounge|pub|tavern|lounge|grill|tv|tvs|screen|screens|watch party|game day|game night|live sports)\b/.test(
      text,
    );

  return sportsOrGame && venueOrViewing;
}
function cleanupSportsWatchActivityTerms(searchTerms: string[], rawQuery = "") {
  return finalCleanTermList(uniqueTerms([
    ...searchTerms
      .map((term) => normalizeSportsWatchTerm(String(term)))
      .filter((term) => term && !SPORTS_WATCH_BLOCKED_ACTIVITY_TERMS.has(term)),
    ...SPORTS_WATCH_REQUIRED_ACTIVITY_TERMS,
    ...sportsWatchActivityTermsFromQuery(rawQuery),
  ]), ACTIVITY_ALLOWED_SINGLE_WORDS);
}
function sportsWatchTermsRemoved(searchTerms: string[]) {
  return uniqueTerms(
    searchTerms
      .map((term) => normalizeSportsWatchTerm(String(term)))
      .filter((term) => term && SPORTS_WATCH_BLOCKED_ACTIVITY_TERMS.has(term)),
  );
}
function cleanupSportsWatchIntent(intent: Record<string, any>) {
  if (!hasSportsWatchIntent(intent)) return intent;

  const removedTerms = sportsWatchTermsRemoved(
    intent.activityIntent?.activityTerms ?? [],
  );
  const cleaned = {
    ...intent,
    searchType: "activity",
    primaryDomain: "activity",
    needsRestaurant: false,
    needsActivity: true,
    wantsPairing: false,
    restaurantIntent: {
      mealTerms: [],
      foodTerms: [],
      cuisineTerms: [],
      categoryTerms: [],
      vibeTerms: [],
      featureTerms: [],
      negativeTerms: [],
      alternativeGroups: [],
    },
    activityIntent: {
      ...(intent.activityIntent ?? {}),
      activityTerms: cleanupSportsWatchActivityTerms(
        intent.activityIntent?.activityTerms ?? [],
        String(intent.rawQuery ?? ""),
      ),
      categoryTerms: uniqueTerms([
        "sports bar",
        ...(intent.activityIntent?.categoryTerms ?? []),
      ]),
      featureTerms: uniqueTerms([
        "tv",
        ...(intent.activityIntent?.featureTerms ?? []),
      ]),
      vibeTerms: intent.activityIntent?.vibeTerms ?? [],
      negativeTerms: intent.activityIntent?.negativeTerms ?? [],
      alternativeGroups: intent.activityIntent?.alternativeGroups ?? [],
    },
    pairingPreference: {
      requiresPairing: false,
      distanceMode: "any",
      maxPairDistanceMiles: null,
      maxPairWalkingMinutes: null,
      requireWalkablePair: false,
    },
  };

  Object.defineProperty(cleaned, "__sportsWatchRemovedActivityTerms", {
    value: removedTerms,
    enumerable: false,
  });

  return cleaned;
}
function restaurantTermsOriginal(intent: Record<string, any>) {
  if (!intent.needsRestaurant) return [];
  return uniqueTerms([
    ...(intent.restaurantIntent?.mealTerms ?? []),
    ...(intent.restaurantIntent?.foodTerms ?? []),
    ...(intent.restaurantIntent?.cuisineTerms ?? []),
    ...(intent.restaurantIntent?.categoryTerms ?? []),
    ...(intent.restaurantIntent?.featureTerms ?? []),
    ...((intent.restaurantIntent?.alternativeGroups ?? []).flat?.() ?? []),
  ]);
}
function activityTermsOriginal(intent: Record<string, any>) {
  if (!intent.needsActivity) return [];
  return uniqueTerms([
    ...(intent.activityIntent?.activityTerms ?? []),
    ...(intent.activityIntent?.categoryTerms ?? []),
    ...(intent.activityIntent?.featureTerms ?? []),
    ...((intent.activityIntent?.alternativeGroups ?? []).flat?.() ?? []),
  ]);
}
function hasSpecificRestaurantTerm(intent: Record<string, any>) {
  const terms = [
    ...(intent.restaurantIntent?.foodTerms ?? []),
    ...(intent.restaurantIntent?.cuisineTerms ?? []),
    ...(intent.restaurantIntent?.categoryTerms ?? []),
    ...((intent.restaurantIntent?.alternativeGroups ?? []).flat?.() ?? []),
  ].map((term) => normalizeTerm(String(term ?? "")));
  return terms.some((term) => term && !GENERIC_RESTAURANT_TERMS.has(term));
}
function pruneRestaurantRpcTerms(
  intent: Record<string, any>,
  searchTerms: string[],
) {
  const unique = uniqueTerms(searchTerms);
  if (!hasSpecificRestaurantTerm(intent)) return unique;
  return unique.filter(
    (term) => !GENERIC_RESTAURANT_TERMS.has(normalizeTerm(term)),
  );
}
function hasHookahIntent(rawQuery: string) {
  return /\b(hookah|shisha|hookah lounge|hookah bar)\b/i.test(rawQuery);
}
function rawQueryOutsideHookahPhrases(rawQuery: string) {
  return rawQuery
    .toLowerCase()
    .replace(/\bhookah\s+(?:lounge|bar)\b/gi, " ")
    .replace(/\b(?:hookah|shisha)\b/gi, " ");
}
function rawQueryExplicitlyIncludes(rawQuery: string, term: string) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(
    rawQueryOutsideHookahPhrases(rawQuery),
  );
}
function pruneActivityRpcTerms(
  intent: Record<string, any>,
  searchTerms: string[],
) {
  const rawQuery = String(intent.rawQuery ?? "");
  let unique = uniqueTerms(searchTerms);

  if (hasSportsWatchIntent(intent)) {
    unique = cleanupSportsWatchActivityTerms(unique, rawQuery);
  }

  if (hasRelaxedOrCasualActivityIntent(rawQuery)) {
    unique = cleanupRelaxedActivityTerms(unique);
  }

  if (!hasHookahIntent(rawQuery)) return unique;

  const output = [...HOOKAH_TERMS];

  for (const term of unique) {
    const normalized = normalizeTerm(term);

    if (HOOKAH_TERMS.includes(normalized)) continue;

    if (BROAD_NIGHTLIFE_TERMS.has(normalized)) {
      if (rawQueryExplicitlyIncludes(rawQuery, normalized)) output.push(term);
      continue;
    }

    output.push(term);
  }

  return uniqueTerms(output);
}
function terms(intent: Record<string, any>, domain: "restaurant" | "activity") {
  return domain === "restaurant"
    ? pruneRestaurantRpcTerms(intent, restaurantTermsOriginal(intent))
    : finalCleanTermList(pruneActivityRpcTerms(intent, activityTermsOriginal(intent)), ACTIVITY_ALLOWED_SINGLE_WORDS);
}
function speedStatus(ms: number) {
  return ms < 1000
    ? "excellent"
    : ms < 2000
      ? "good"
      : ms < 3500
        ? "okay"
        : ms < 5000
          ? "slow"
          : "critical";
}

async function parseIntent(
  supabase: any,
  rawQuery: string,
  body: any,
  perf: Record<string, number>,
) {
  const cached = await getCachedIntent(supabase, rawQuery);
  if (cached.cache_hit)
    return {
      intent: cleanupSearchIntent({
        ...(cached.intent as Record<string, unknown>),
        rawQuery,
      }),
      parser_source: "cache",
      cache_hit: true,
      llm_used: false,
      intentLlmModel: SEARCH_INTENT_FAST_MODEL,
      intentCacheVersion: SEARCH_INTENT_CACHE_VERSION,
    };
  const started = Date.now();
  const fast = fastParseSearchIntent(rawQuery, { area: body.area });
  perf.llm_ms = 0;
  const edgeFastPath = body.useFastPath === false ? { intent: null, reason: null, confidence: 0 } : createEdgeFastPathIntent(rawQuery);
  if (edgeFastPath.intent && (edgeFastPath.confidence ?? 0) >= 0.88) {
    const cleanedFast = cleanupSearchIntent(edgeFastPath.intent as Record<string, any>);
    await saveCachedIntent(supabase, rawQuery, cleanedFast, "fast_path");
    return {
      intent: cleanedFast,
      parser_source: "fast_path",
      cache_hit: false,
      llm_used: false,
      fastPathMatched: true,
      fastPathReason: edgeFastPath.reason,
      intentLlmModel: null,
      intentLlmFastModel: SEARCH_INTENT_FAST_MODEL,
      intentLlmFallbackModel: SEARCH_INTENT_FALLBACK_MODEL,
      intentCacheVersion: SEARCH_INTENT_CACHE_VERSION,
    };
  }
  if (hasSportsWatchIntent(fast as Record<string, any>)) {
    const cleanedFast = cleanupSearchIntent(fast as Record<string, any>);
    await saveCachedIntent(supabase, rawQuery, cleanedFast, "fast_path");
    return {
      intent: cleanedFast,
      parser_source: "fast_path",
      cache_hit: false,
      llm_used: false,
      fastPathMatched: true,
      fastPathReason: "matched sports-watch activity fast path",
      intentLlmModel: null,
      intentLlmFastModel: SEARCH_INTENT_FAST_MODEL,
      intentLlmFallbackModel: SEARCH_INTENT_FALLBACK_MODEL,
      intentCacheVersion: SEARCH_INTENT_CACHE_VERSION,
    };
  }
  const useFastPath = body.useFastPath !== false;
  const force =
    body.force_llm === true || body.debug?.force_llm === true || !useFastPath;
  if (
    !force &&
    parserConfidence(fast) >= 0.75 &&
    fast.searchType !== "unknown"
  ) {
    const cleanedFast = cleanupSearchIntent(fast as Record<string, any>);
    await saveCachedIntent(supabase, rawQuery, cleanedFast, "fast_path");
    return {
      intent: cleanedFast,
      parser_source: "fast_path",
      cache_hit: false,
      llm_used: false,
      fastPathMatched: true,
      fastPathReason: "edge_fast_parser_confidence_threshold",
      intentLlmFastModel: SEARCH_INTENT_FAST_MODEL,
      intentLlmFallbackModel: SEARCH_INTENT_FALLBACK_MODEL,
      intentCacheVersion: SEARCH_INTENT_CACHE_VERSION,
    };
  }
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey)
    return {
      intent: cleanupSearchIntent(
        normalizeIntent({ ...fast, parser_source: "fallback" }),
      ),
      parser_source: "fallback",
      cache_hit: false,
      llm_used: false,
      fastPathMatched: false,
      fastPathReason: useFastPath ? "llm_unavailable" : "fast_path_disabled",
    };
  try {
    const model = SEARCH_INTENT_FAST_MODEL;
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content: "Return compact JSON TheOutHaven search intent.",
          },
          { role: "user", content: JSON.stringify({ rawQuery, fast }) },
        ],
      }),
    });
    perf.llm_ms = Date.now() - started;
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    const intent = cleanupSearchIntent(
      normalizeIntent({
        ...fast,
        ...JSON.parse(data.choices?.[0]?.message?.content || "{}"),
        parser_source: "llm",
        confidence: 0.86,
      }),
    );
    await saveCachedIntent(supabase, rawQuery, intent, "llm", model);
    return {
      intent,
      parser_source: "llm",
      cache_hit: false,
      llm_used: true,
      intentLlmModel: model,
      intentLlmFastModel: SEARCH_INTENT_FAST_MODEL,
      intentLlmFallbackModel: SEARCH_INTENT_FALLBACK_MODEL,
      intentCacheVersion: SEARCH_INTENT_CACHE_VERSION,
      fastPathMatched: false,
      fastPathReason: useFastPath
        ? "fast_parser_confidence_below_threshold"
        : "fast_path_disabled",
    };
  } catch (error) {
    perf.llm_ms = Date.now() - started;
    return {
      intent: cleanupSearchIntent(
        normalizeIntent({
          ...fast,
          parser_source: "fallback",
          llm_error: safeError(error),
        }),
      ),
      parser_source: "fallback",
      cache_hit: false,
      llm_used: false,
      fastPathMatched: false,
      fastPathReason: useFastPath ? "llm_error" : "fast_path_disabled",
    };
  }
}

async function rpcSearch(
  supabase: any,
  domain: string,
  searchTerms: string[],
  intent: any,
  limit: number,
  radius: number,
) {
  const geo = intent.geo ?? {};
  const params = {
    p_search_terms: searchTerms,
    p_domain: domain,
    p_neighborhood: geo.neighborhood ?? null,
    p_borough: geo.borough ?? null,
    p_city: geo.city ?? null,
    p_county: geo.county ?? null,
    p_region: geo.raw ?? null,
    p_state: geo.state ?? null,
    p_latitude: geo.latitude ?? null,
    p_longitude: geo.longitude ?? null,
    p_radius_miles: radius,
    p_limit: intent.strictness === "high" ? Math.min(limit * 4, 24) : limit * 4,
    p_allow_places_of_worship: false,
    p_allow_low_level: false,
  };
  const { data, error } = await supabase.rpc(
    "enterprise_search_locations",
    params,
  );
  if (!error && Array.isArray(data)) return data;
  const query = supabase
    .from("locations")
    .select("*")
    .limit(limit * 8);
  return (await query).data ?? [];
}

function isTheaterLike(row: Record<string, unknown>) {
  const hay = textOf(row).replace(/_/g, " ");
  return THEATER_TERMS.some((term) => hay.includes(term.replace(/_/g, " ")));
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function includesPhrase(text: string, term: string) {
  const normalizedText = text.toLowerCase().replace(/_/g, " ");
  const normalizedTerm = escapeRegex(
    term.toLowerCase().replace(/_/g, " "),
  ).replace(/ /g, "\\s+");
  return new RegExp(`(^|\\s)${normalizedTerm}(\\s|$)`, "i").test(
    normalizedText,
  );
}

function explicitlyAsksForTheater(intent: any) {
  const rawQuery = String(intent.rawQuery ?? "");
  const searchTerms = Array.from(
    new Set([...terms(intent, "restaurant"), ...terms(intent, "activity")]),
  ).map((term) => String(term).toLowerCase().replace(/_/g, " "));
  return THEATER_INTENT_TERMS.some((term) => {
    const normalized = term.replace(/_/g, " ");
    return (
      includesPhrase(rawQuery, normalized) || searchTerms.includes(normalized)
    );
  });
}

function hasNightlifeIntent(intent: any) {
  const rawQuery = String(intent.rawQuery ?? "");
  const searchTerms = Array.from(
    new Set([...terms(intent, "restaurant"), ...terms(intent, "activity")]),
  ).map((term) => String(term).toLowerCase().replace(/_/g, " "));
  return NIGHTLIFE_TERMS.some(
    (term) => includesPhrase(rawQuery, term) || searchTerms.includes(term),
  );
}

function userAskedForHookah(intent: any) {
  return hasHookahIntent(String(intent.rawQuery ?? ""));
}
function isHookahRow(row: Record<string, unknown>) {
  return /\b(hookah|shisha)\b/i.test(textOf(row));
}

function domainFilter(
  rows: Record<string, unknown>[],
  intent: any,
  domain: "restaurant" | "activity",
) {
  const searchTerms = terms(intent, domain);
  const hardTerms =
    domain === "restaurant" &&
    searchTerms.some((term) => STEAK_TERMS.includes(String(term).toLowerCase()))
      ? STEAK_TERMS
      : domain === "activity" &&
          searchTerms.some((term) => String(term).includes("bowling"))
        ? [
            "bowling",
            "bowling alley",
            "bowling lounge",
            "bowling lanes",
            "lanes",
          ]
        : searchTerms;
  const allowTheater = explicitlyAsksForTheater(intent);
  const blocksTheaterIntent = hasNightlifeIntent(intent) || !allowTheater;
  return rows
    .filter((row) => {
      const theaterLike = isTheaterLike(row);
      if (domain === "restaurant" && theaterLike) return false;
      if (
        domain === "activity" &&
        userAskedForHookah(intent) &&
        !isHookahRow(row)
      )
        return false;
      if (domain === "activity" && theaterLike && blocksTheaterIntent)
        return false;
      return hardTerms.length ? hasAny(row, hardTerms) : true;
    })
    .sort((a, b) => score(b, hardTerms) - score(a, hardTerms));
}

function pair(
  restaurants: Record<string, unknown>[],
  activities: Record<string, unknown>[],
  intent: any,
  debug: Record<string, number>,
) {
  const requireWalk = Boolean(intent.pairingPreference?.requireWalkablePair);
  const maxMiles = Number(intent.pairingPreference?.maxPairDistanceMiles ?? 1);
  const pairs: Record<string, unknown>[] = [];
  for (const restaurant of restaurants)
    for (const activity of activities) {
      debug.pairCandidatesEvaluated++;
      if (!hasCoordinates(restaurant) || !hasCoordinates(activity)) {
        debug.pairsRejectedForMissingCoordinates++;
        if (requireWalk) continue;
        pairs.push({
          restaurant,
          activity,
          pairDistanceMiles: null,
          pairWalkingMinutes: null,
        });
        continue;
      }
      const miles = haversineMiles(
        Number(restaurant.latitude),
        Number(restaurant.longitude),
        Number(activity.latitude),
        Number(activity.longitude),
      );
      if (requireWalk && miles > maxMiles) {
        debug.pairsRejectedForDistance++;
        continue;
      }
      if (requireWalk) debug.walkablePairsFound++;
      pairs.push({
        restaurant,
        activity,
        pairDistanceMiles: Number(miles.toFixed(2)),
        pairWalkingMinutes: walkingMinutesFromMiles(miles),
        pair_walking_label: `${walkingMinutesFromMiles(miles)} min walk`,
      });
    }
  return pairs.sort(
    (a: any, b: any) =>
      (a.pairDistanceMiles ?? 99) - (b.pairDistanceMiles ?? 99),
  );
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  const totalTimer = startTimer();
  let supabase;
  try {
    supabase = createSupabaseAdminClient();
    const user = await getUserFromRequest(req, supabase);
    if (!user) return unauthorized("Valid JWT required for create-search");
    const body = await req.json().catch(() => ({}));
    const rawQuery = String(
      body.prompt ?? body.query ?? body.message ?? "",
    ).trim();
    if (!rawQuery) return badRequest("prompt is required");
    const limit = Math.min(Math.max(Number(body.limit ?? 12), 1), 50);
    const perf: Record<string, number> = {};
    const parsed = await parseIntent(supabase, rawQuery, body, perf);
    const parsedIntentRemovedTerms =
      (parsed.intent as any).__sportsWatchRemovedActivityTerms ?? [];
    const intent: any = cleanupSportsWatchIntent({
      ...parsed.intent,
      rawQuery,
    });
    if (parsedIntentRemovedTerms.length) {
      Object.defineProperty(intent, "__sportsWatchRemovedActivityTerms", {
        value: uniqueTerms([
          ...parsedIntentRemovedTerms,
          ...((intent as any).__sportsWatchRemovedActivityTerms ?? []),
        ]),
        enumerable: false,
      });
    }
    const restaurantRpcTermsOriginal = restaurantTermsOriginal(intent);
    const restaurantTerms = pruneRestaurantRpcTerms(
      intent,
      restaurantRpcTermsOriginal,
    );
    const activityRpcTermsOriginal = activityTermsOriginal(intent);
    const activityRpcTermsRemovedForSportsWatchIntent = hasSportsWatchIntent(
      intent,
    )
      ? uniqueTerms([
          ...((intent as any).__sportsWatchRemovedActivityTerms ?? []),
          ...sportsWatchTermsRemoved(activityRpcTermsOriginal),
        ])
      : [];
    const activityTerms = pruneActivityRpcTerms(
      intent,
      activityRpcTermsOriginal,
    );
    const activityRpcTermsRemovedForRelaxedIntent = hasRelaxedOrCasualActivityIntent(String(intent.rawQuery ?? ""))
      ? relaxedActivityTermsRemoved(activityRpcTermsOriginal)
      : [];
    const initialRadius = Number(intent.geo?.radiusMiles ?? 3);
    let activityRadius = initialRadius;
    const parallelStarted = Date.now();
    const restaurantStarted = Date.now();
    const restaurantPromise = rpcSearch(
      supabase,
      "restaurant",
      restaurantTerms,
      intent,
      limit,
      initialRadius,
    ).finally(() => {
      perf.restaurant_rpc_ms = Date.now() - restaurantStarted;
    });
    const activityStarted = Date.now();
    let activityRows = await rpcSearch(
      supabase,
      "activity",
      activityTerms,
      intent,
      limit,
      activityRadius,
    ).finally(() => {
      perf.activity_rpc_ms = Date.now() - activityStarted;
    });
    const restaurantRows = await restaurantPromise;
    perf.rpc_parallel_ms = Date.now() - parallelStarted;
    let filteredActivities = domainFilter(activityRows, intent, "activity");
    const activityGeoExpanded =
      activityTerms.some((t) => String(t).includes("bowling")) &&
      filteredActivities.length < 5;
    if (activityGeoExpanded) {
      activityRadius = Math.max(5, Math.min(8, initialRadius + 3));
      const expandStarted = Date.now();
      activityRows = await rpcSearch(
        supabase,
        "activity",
        activityTerms,
        intent,
        limit,
        activityRadius,
      );
      perf.activity_rpc_ms += Date.now() - expandStarted;
      filteredActivities = domainFilter(activityRows, intent, "activity");
    }
    const rankingStarted = Date.now();
    let restaurants = domainFilter(restaurantRows, intent, "restaurant");
    let activities = filteredActivities;
    perf.ranking_ms = Date.now() - rankingStarted;
    const photoStarted = Date.now();
    restaurants = restaurants.filter(hasValidPhoto);
    activities = activities.filter(hasValidPhoto);
    perf.photo_filter_ms = Date.now() - photoStarted;
    const pairDebug = {
      pairCandidatesEvaluated: 0,
      pairsRejectedForDistance: 0,
      pairsRejectedForMissingCoordinates: 0,
      walkablePairsFound: 0,
    };
    const pairingStarted = Date.now();
    const pairs = intent.wantsPairing
      ? pair(
          restaurants.slice(0, limit),
          activities.slice(0, limit),
          intent,
          pairDebug,
        ).slice(0, limit)
      : [];
    perf.pairing_ms = Date.now() - pairingStarted;
    perf.total_ms = totalTimer();
    const performance = { ...perf, speed_status: speedStatus(perf.total_ms) };
    const debug = {
      parser_source: parsed.parser_source,
      intentParserSource: parsed.parser_source,
      intentLlmModel:
        (parsed as any).intentLlmModel ??
        (parsed.llm_used ? SEARCH_INTENT_FAST_MODEL : null),
      intentLlmFastModel: SEARCH_INTENT_FAST_MODEL,
      intentLlmFallbackModel: SEARCH_INTENT_FALLBACK_MODEL,
      intentCacheVersion: SEARCH_INTENT_CACHE_VERSION,
      llmEnhancementUsed: parsed.llm_used,
      llmFallbackUsed: false,
      llmTimedOut: false,
      fallbackIntentUsed: parsed.parser_source === "fallback",
      intentCacheHit: parsed.cache_hit,
      fastPathMatched: Boolean(parsed.fastPathMatched),
      fastPathReason: parsed.fastPathReason ?? null,
      sportsWatchIntent: hasSportsWatchIntent(intent),
      relaxedActivityIntent: hasRelaxedOrCasualActivityIntent(String(intent.rawQuery ?? "")),
      noClubIntent: hasNoClubIntent(String(intent.rawQuery ?? "")),
      activityRpcTermsRemovedForSportsWatchIntent,
      activityRpcTermsRemovedForRelaxedIntent,
      cache_hit: parsed.cache_hit,
      llm_used: parsed.llm_used,
      ...performance,
      restaurantTerms,
      activityTerms,
      restaurantRpcTerms: restaurantTerms,
      activityRpcTerms: activityTerms,
      restaurantRpcTermsOriginal,
      restaurantRpcTermsPruned: restaurantTerms,
      activityRpcTermsOriginal,
      activityRpcTermsPruned: activityTerms,
      activityGeoExpanded,
      activityInitialRadiusMiles: initialRadius,
      activityFinalRadiusMiles: activityRadius,
      activityExpansionReason: activityGeoExpanded
        ? "fewer than 5 strong activity matches"
        : null,
      pairCandidatesFound: restaurants.length * activities.length,
      pairsWithinRequestedDistance: pairs.length,
      ...pairDebug,
      performance,
    };
    await logEdgeFunctionRun(supabase, {
      function_name: "create-search",
      status: "success",
      user_id: user.id,
      input_summary: { rawQuery },
      output_summary: {
        restaurants: restaurants.length,
        activities: activities.length,
        pairs: pairs.length,
      },
      duration_ms: perf.total_ms,
      metadata: debug,
    });
    return ok({
      success: true,
      search_system: "edge-enterprise-search-v1",
      rawQuery,
      normalizedIntent: intent,
      restaurants: restaurants.slice(0, limit),
      activities: activities.slice(0, limit),
      pairs,
      renderMode: pairs.length
        ? "mixed_pairs"
        : restaurants.length && activities.length
          ? "partial_mixed"
          : restaurants.length
            ? "restaurant_cards"
            : activities.length
              ? "activity_cards"
              : "empty",
      performance,
      debug,
    });
  } catch (error) {
    if (supabase)
      await logEdgeFunctionRun(supabase, {
        function_name: "create-search",
        status: "error",
        error_message: safeError(error),
        duration_ms: totalTimer(),
      });
    return serverError("create-search failed", safeError(error));
  }
});
