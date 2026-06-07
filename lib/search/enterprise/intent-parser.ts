import OpenAI from "openai";
import type { SearchIntent } from "./types";
import {
  deterministicIntentFromQuery,
  mergeLlmIntentWithPreIntent,
  normalizeIntent,
  hasNoClubIntent,
} from "./normalize-intent";
import {
  detectActivityTerms,
  detectFoodTerms,
  detectMealTerms,
  createEmptyActivityIntent,
  createEmptyRestaurantIntent,
} from "./taxonomy";
import {
  SEARCH_INTENT_CACHE_VERSION,
  SEARCH_INTENT_FAST_MODEL,
  SEARCH_INTENT_FALLBACK_MODEL,
  SEARCH_INTENT_LLM_TIMEOUT_MS,
  SEARCH_INTENT_FALLBACK_TIMEOUT_MS,
} from "./model-config";
import {
  buildSearchIntentCacheKey,
  getCachedSearchIntent,
  setCachedSearchIntent,
} from "./searchIntentCache";
import { withTimeout } from "./timeout";

const FAST_PATH_CONNECTORS = [
  "and",
  "after",
  "before",
  "then",
  "followed by",
  "nearby",
  "with",
  "plus",
];

const FAST_PATH_RESTAURANT_SIGNAL_TERMS = [
  "dinner",
  "lunch",
  "brunch",
  "breakfast",
  "restaurant",
  "dining",
  "food",
  "eat",
  "place to eat",
  "somewhere to eat",
  "steak",
  "steakhouse",
  "sushi",
  "pasta",
  "seafood",
  "tacos",
  "pizza",
  "burgers",
  "rooftop dinner",
  "cocktails with dinner",
];

const FAST_PATH_ACTIVITY_SIGNAL_TERMS = [
  "hookah lounge",
  "hookah",
  "shisha",
  "karaoke",
  "bowling",
  "arcade",
  "comedy show",
  "comedy",
  "museum",
  "rooftop drinks",
  "rooftop cocktails",
  "rooftop bar",
  "rooftop lounge",
  "rooftop",
  "lounge",
  "drinks",
  "cocktails",
  "bar",
  "sports bar",
  "sports lounge",
  "bar with tv",
  "bar with tvs",
  "bar with screens",
  "watch party",
  "game day",
  "game night",
  "live sports",
  "pub",
  "tavern",
  "bar and grill",
  "spa",
  "live music",
  "jazz",
  "paint and sip",
  "escape room",
  "activity",
  "activities",
  "thing to do",
  "things to do",
  "something to do",
  "something fun",
  "fun",
  "fun activity",
  "relaxed activity",
  "chill activity",
  "low key activity",
  "date idea",
  "date activity",
  "outing",
  "experience",
  "entertainment",
  "indoor activity",
  "outdoor activity",
];

const FAST_PATH_SPORTS_WATCH_TERMS = [
  "sports bar",
  "sports lounge",
  "bar with tv",
  "bar with tvs",
  "bar with screens",
  "watch the game",
  "watch game",
  "watch party",
  "game day",
  "game night",
  "live sports",
  "showing the game",
  "nba game",
  "nfl game",
  "mlb game",
  "nhl game",
  "ufc fight",
  "boxing fight",
  "knicks game",
  "nets game",
  "yankees game",
  "mets game",
  "giants game",
  "jets game",
  "rangers game",
  "islanders game",
  "devils game",
];

const NBA_TEAM_TERMS = [
  "knicks", "nets", "lakers", "warriors", "celtics", "heat", "bucks", "sixers", "76ers", "bulls", "mavericks", "mavs", "suns", "clippers", "nuggets", "timberwolves", "wolves", "thunder", "grizzlies", "pelicans", "kings", "trail blazers", "blazers", "jazz", "rockets", "spurs", "raptors", "pacers", "cavaliers", "cavs", "magic", "hawks", "hornets", "pistons", "wizards",
];
const NFL_TEAM_TERMS = [
  "giants", "jets", "cowboys", "eagles", "commanders", "patriots", "chiefs", "ravens", "steelers", "bills", "dolphins", "bengals", "browns", "texans", "colts", "jaguars", "titans", "broncos", "raiders", "chargers", "packers", "bears", "lions", "vikings", "falcons", "panthers", "saints", "buccaneers", "bucs", "cardinals", "rams", "49ers", "seahawks",
];
const MLB_TEAM_TERMS = [
  "yankees", "mets", "dodgers", "red sox", "cubs", "white sox", "phillies", "braves", "astros", "rangers", "blue jays", "orioles", "rays", "guardians", "tigers", "royals", "twins", "angels", "athletics", "mariners", "nationals", "marlins", "brewers", "cardinals", "pirates", "reds", "diamondbacks", "rockies", "padres", "giants",
];
const NHL_TEAM_TERMS = [
  "rangers", "islanders", "devils", "bruins", "flyers", "penguins", "capitals", "hurricanes", "panthers", "lightning", "maple leafs", "leafs", "canadiens", "senators", "sabres", "red wings", "blackhawks", "blues", "predators", "wild", "jets", "stars", "avalanche", "golden knights", "knights", "kraken", "canucks", "oilers", "flames", "ducks", "kings", "sharks", "coyotes",
];
const WNBA_TEAM_TERMS = [
  "liberty", "aces", "sun", "storm", "sparks", "mercury", "sky", "fever", "wings", "dream", "mystics", "lynx", "valkyries",
];
const COLLEGE_TEAM_TERMS = [
  "march madness", "final four", "duke", "unc", "north carolina", "uconn", "kentucky", "kansas", "villanova", "gonzaga", "alabama", "michigan", "ohio state", "penn state", "notre dame", "syracuse",
];
const SPORTS_TEAM_TERMS = uniqueTerms([
  ...NBA_TEAM_TERMS, ...NFL_TEAM_TERMS, ...MLB_TEAM_TERMS, ...NHL_TEAM_TERMS, ...WNBA_TEAM_TERMS, ...COLLEGE_TEAM_TERMS,
]);
const SPORTS_LEAGUE_TERMS = [
  "nba", "nfl", "mlb", "nhl", "wnba", "ufc", "boxing", "soccer", "football", "basketball", "baseball", "hockey", "college basketball", "college football", "march madness", "final four",
];

type EnterpriseIntentFastPathResult = {
  intent: Partial<SearchIntent> | null;
  reason: string;
  confidence?: number;
};

function includesFastPathPhrase(query: string, term: string) {
  const escaped = term
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, "i").test(query);
}

function uniqueTerms(items: string[]) {
  return Array.from(
    new Set(items.map((item) => item.toLowerCase().trim()).filter(Boolean)),
  );
}

function detectFastPathConnector(query: string) {
  return (
    FAST_PATH_CONNECTORS.find((term) => includesFastPathPhrase(query, term)) ??
    null
  );
}

function detectFastPathRestaurantSignals(query: string) {
  const explicitSignals = FAST_PATH_RESTAURANT_SIGNAL_TERMS.filter((term) =>
    includesFastPathPhrase(query, term),
  );
  return uniqueTerms([
    ...explicitSignals,
    ...detectMealTerms(query),
    ...detectFoodTerms(query),
  ]);
}

function hasRooftopDrinkActivityPhrase(query: string) {
  return (
    /\b(rooftop|roof top)\s+(drinks?|cocktails?|bar|lounge|nightlife)\b/i.test(
      query,
    ) ||
    /\b(drinks?|cocktails?|bar|lounge|nightlife)\s+(on|at)?\s*(a\s+)?(rooftop|roof top)\b/i.test(
      query,
    )
  );
}

function hasStandaloneRooftopSecondStop(query: string) {
  const q = String(query || "").toLowerCase();

  const connectorBeforeRooftop =
    /\b(?:with|and|then|after|afterward|afterwards|next|later|plus|followed by|before)\b[\s\w'-]{0,40}\b(?:a\s+)?(?:rooftop|roof top)\b/i.test(
      q,
    );

  const rooftopBeforeAfter =
    /\b(?:rooftop|roof top)\b[\s\w'-]{0,20}\b(?:after|afterward|afterwards|next|later)\b/i.test(
      q,
    );

  const rooftopDinner =
    /\b(?:rooftop|roof top)\s+(?:dinner|restaurant|dining|brunch|lunch|breakfast)\b/i.test(
      q,
    );

  return (connectorBeforeRooftop || rooftopBeforeAfter) && !rooftopDinner;
}

function hasRooftopActivityPhrase(query: string) {
  return (
    hasRooftopDrinkActivityPhrase(query) ||
    hasStandaloneRooftopSecondStop(query)
  );
}

function isRooftopFastPathSignal(term: string) {
  return term === "rooftop" || term.startsWith("rooftop ");
}

function detectFastPathActivitySignals(query: string) {
  const rooftopActivity = hasRooftopActivityPhrase(query);
  const explicitSignals = FAST_PATH_ACTIVITY_SIGNAL_TERMS.filter(
    (term) =>
      includesFastPathPhrase(query, term) &&
      (rooftopActivity || !isRooftopFastPathSignal(term)),
  );
  return uniqueTerms([...explicitSignals, ...detectActivityTerms(query)]);
}

function detectFastPathActivityIntentTerms(query: string) {
  const explicitSignals = FAST_PATH_ACTIVITY_SIGNAL_TERMS.filter((term) =>
    includesFastPathPhrase(query, term),
  );

  if (hasRooftopActivityPhrase(query)) {
    return uniqueTerms([
      "rooftop",
      "rooftop bar",
      "rooftop lounge",
      "rooftop drinks",
      "rooftop cocktails",
      "drinks",
      "cocktails",
      "bar",
      "lounge",
      ...detectActivityTerms(query),
    ]);
  }

  if (explicitSignals.includes("hookah lounge")) return ["hookah lounge"];
  if (explicitSignals.includes("hookah")) return ["hookah"];
  if (explicitSignals.includes("shisha")) return ["shisha"];
  if (explicitSignals.includes("comedy show")) return ["comedy show"];
  if (explicitSignals.includes("rooftop lounge")) return ["rooftop lounge"];

  const detected = uniqueTerms(detectActivityTerms(query));
  if (detected.length) return detected;

  return uniqueTerms(
    explicitSignals.filter((term) => !isRooftopFastPathSignal(term)),
  );
}

function emptyGeoIntent() {
  return {
    raw: null,
    aliases: [],
    latitude: null,
    longitude: null,
    radiusMiles: null,
    geoStrictness: "none" as const,
    neighborhood: null,
    city: null,
    borough: null,
    county: null,
    region: null,
    state: null,
  };
}

function hasMealOrRestaurantTerm(query: string) {
  const q = String(query || "").toLowerCase();
  return /\b(dinner|brunch|lunch|breakfast|restaurant|food|eat|steakhouse|steak|seafood|sushi|mexican|italian|tacos|pizza|birthday dinner|anniversary dinner)\b/.test(q);
}

function hasActivityVenueOrActivityTerm(query: string) {
  const q = String(query || "").toLowerCase();
  return /\b(activity|things to do|something fun|karaoke|comedy|comedy club|comedy show|bowling|arcade|museum|museum date|hookah|hookah lounge|lounge|cocktail bar|wine bar|bar with|bar showing|sports bar|sports lounge|rooftop bar|rooftop lounge|rooftop drinks|paint and sip|sip and paint|mini golf|live jazz|jazz|live music|pool hall|billiards|game day|watch party)\b/.test(q);
}

function hasExplicitMixedOutingIntent(query: string) {
  const q = String(query || "").toLowerCase();
  const hasConnector = /\b(and|with|after|before|then|nearby|close by|walking distance|walk apart|close together)\b/.test(q);
  return hasConnector && hasMealOrRestaurantTerm(q) && hasActivityVenueOrActivityTerm(q);
}

function isActivityVenueOnlyQuery(query: string) {
  const q = String(query || "").toLowerCase();
  const hasActivityVenue = /\b(cocktail bar|wine bar|rooftop bar|rooftop lounge|sports bar|sports lounge|sport lounge|hookah bar|karaoke bar|comedy club|jazz club|lounge|speakeasy|bar with tv|bar with tvs|bar with screens|quiet lounge|upscale lounge)\b/.test(q);
  const hasExplicitMeal = /\b(dinner|brunch|lunch|breakfast|restaurant|eat|food before|food after|steak|seafood|sushi|mexican|italian)\b/.test(q);
  const hasVibeOnlyTrigger = /\b(date night|romantic|vibes|girls night|girls' night|first date|no loud music|quiet|not too loud)\b/.test(q);
  return hasActivityVenue && !hasExplicitMeal && (hasVibeOnlyTrigger || /\bspeakeasy\b/.test(q));
}

function hasSportsWatchFastPathIntent(query: string) {
  const q = String(query || "").toLowerCase();
  const allSportsTeamsAndLeagues = [...SPORTS_TEAM_TERMS, ...SPORTS_LEAGUE_TERMS];
  const explicitPhrase = FAST_PATH_SPORTS_WATCH_TERMS.some((term) => includesFastPathPhrase(q, term));
  const hasTeamOrLeague = allSportsTeamsAndLeagues.some((term) => includesFastPathPhrase(q, term));
  const hasViewingLanguage = /\b(watch|showing|viewing|see|catch|plays?|game|match|fight|watch party|game day)\b/.test(q);
  const hasVenueLanguage = /\b(bar|pub|sports bar|sports lounge|sport lounge|tavern|lounge|grill|tv|tvs|screen|screens|big screen|big screens)\b/.test(q);
  const hasSportOnlyViewing = /\b(where can i watch|watch basketball|watch football|watch baseball|watch hockey|football bar|basketball bar|baseball bar|hockey bar|nba bar|nfl bar|mlb bar|nhl bar|wnba bar|sports bar with wings and tvs|bar with big screens)\b/.test(q);
  return explicitPhrase || (hasTeamOrLeague && (hasViewingLanguage || hasVenueLanguage)) || hasSportOnlyViewing;
}

function sportsWatchActivityTermsFromQuery(query: string) {
  const q = String(query || "").toLowerCase();
  const teamTerms = SPORTS_TEAM_TERMS.filter((term) => includesFastPathPhrase(q, term));
  const leagueTerms = SPORTS_LEAGUE_TERMS.filter((term) => includesFastPathPhrase(q, term));
  const terms = [
    "sports bar", "sports lounge", "sport lounge", "bar with tv", "bar with tvs", "bar with screens", "tv bar", "big screen", "big screens", "watch party", "game day", "game night", "live sports", "sports viewing", "pub", "tavern", "bar and grill", "bar", "tv", "tvs", "screens",
    ...teamTerms.map((term) => `${term} game`),
    ...leagueTerms.map((term) => `${term} game`),
  ];
  if (/\b(basketball|nba|knicks|nets|lakers|warriors|celtics|heat|bucks|sixers|76ers|bulls|mavericks|mavs|suns|clippers|nuggets|timberwolves|wolves|thunder|grizzlies|pelicans|kings|blazers|jazz|rockets|spurs|raptors|pacers|cavaliers|cavs|magic|hawks|hornets|pistons|wizards|duke|uconn|march madness|final four)\b/.test(q)) terms.push("basketball", "watch basketball");
  if (/\b(football|nfl|giants|jets|cowboys|eagles|commanders|patriots|chiefs|ravens|steelers|bills|dolphins|bengals|browns|texans|colts|jaguars|titans|broncos|raiders|chargers|packers|bears|lions|vikings|falcons|panthers|saints|buccaneers|bucs|cardinals|rams|49ers|seahawks)\b/.test(q)) terms.push("football", "watch football");
  if (/\b(baseball|mlb|yankees|mets|dodgers|red sox|cubs|phillies|braves|astros|blue jays|orioles|rays|guardians|tigers|royals|twins|angels|athletics|mariners|nationals|marlins|brewers|pirates|reds|diamondbacks|rockies|padres)\b/.test(q)) terms.push("baseball", "watch baseball");
  if (/\b(hockey|nhl|rangers|islanders|devils|bruins|flyers|penguins|capitals|hurricanes|panthers|lightning|maple leafs|leafs|canadiens|senators|sabres|red wings|blackhawks|blues|predators|wild|stars|avalanche|golden knights|knights|kraken|canucks|oilers|flames|ducks|sharks|coyotes)\b/.test(q)) terms.push("hockey", "watch hockey");
  if (/\b(ufc|boxing|fight)\b/.test(q)) terms.push("fight night", "ufc fight", "boxing fight");
  return uniqueTerms(terms);
}

function createExplicitMixedFastPathIntent(rawQuery: string) {
  const q = rawQuery.toLowerCase();
  const restaurantIntent = createRestaurantOnlyFastPathIntent(rawQuery).restaurantIntent ?? createEmptyRestaurantIntent();
  const activityIntent = createActivityOnlyFastPathIntent(rawQuery).activityIntent ?? createEmptyActivityIntent();
  const detectedActivityTerms = detectFastPathActivityIntentTerms(q);
  return {
    rawQuery,
    searchType: "mixed_outing",
    primaryDomain: "mixed",
    needsRestaurant: true,
    needsActivity: true,
    wantsPairing: true,
    restaurantIntent,
    activityIntent: {
      ...activityIntent,
      activityTerms: uniqueTerms([...(activityIntent.activityTerms ?? []), ...detectedActivityTerms]),
    },
    pairingPreference: {
      requiresPairing: true,
      distanceMode: /\b(walking|walk|close by|nearby|walk apart)\b/.test(q) ? "walking" : "any",
      maxPairDistanceMiles: null,
      maxPairWalkingMinutes: null,
      requireWalkablePair: /\b(walking|walk|walk apart)\b/.test(q),
    },
    geo: emptyGeoIntent(),
    vibe: [],
    strictness: "high",
  } satisfies Partial<SearchIntent>;
}

function createSportsWatchFastPathIntent(rawQuery: string) {
  const activityTerms = sportsWatchActivityTermsFromQuery(rawQuery);

  const intent: Partial<SearchIntent> = {
    rawQuery,
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
      activityTerms,
      categoryTerms: ["sports bar"],
      vibeTerms: [],
      featureTerms: ["tv"],
      negativeTerms: [],
      alternativeGroups: [],
    },
    pairingPreference: {
      requiresPairing: false,
      distanceMode: "any",
      maxPairDistanceMiles: null,
      maxPairWalkingMinutes: null,
      requireWalkablePair: false,
    },
    geo: emptyGeoIntent(),
    vibe: rawQuery.toLowerCase().includes("best") ? ["best"] : [],
    strictness: "high",
  };

  return intent;
}


function hasRelaxedMixedFastPathIntent(query: string) {
  const q = String(query || "").toLowerCase();
  const hasMeal = /\b(dinner|brunch|lunch|breakfast|restaurant|food|eat)\b/.test(q);
  const hasRelaxedActivity = /\b(relaxed activity|chill activity|easy activity|low key|low-key|laid back|laid-back|casual activity|something fun|board games|arcade|mini golf|bowling|gallery|museum|billiards|pool hall|not too loud|no club|not a club)\b/.test(q);
  return hasMeal && hasRelaxedActivity;
}

function createRelaxedMixedFastPathIntent(rawQuery: string) {
  const q = rawQuery.toLowerCase();
  return {
    rawQuery,
    searchType: "mixed_outing",
    primaryDomain: "mixed",
    needsRestaurant: true,
    needsActivity: true,
    wantsPairing: true,
    strictness: "high",
    vibe: q.includes("casual") ? ["casual"] : [],
    partySize: null,
    geo: emptyGeoIntent(),
    restaurantIntent: {
      mealTerms: q.includes("brunch") ? ["brunch"] : q.includes("lunch") ? ["lunch"] : q.includes("breakfast") ? ["breakfast"] : ["dinner"],
      foodTerms: [],
      cuisineTerms: [],
      categoryTerms: [],
      vibeTerms: q.includes("casual") ? ["casual"] : [],
      featureTerms: [],
      negativeTerms: [],
      alternativeGroups: [],
    },
    activityIntent: {
      activityTerms: ["relaxed activity", "relaxing activity", "chill activity", "easy activity", "low key", "laid back", "casual activity", "board games", "arcade", "mini golf", "bowling", "gallery", "museum", "billiards", "pool hall", "activity"],
      categoryTerms: [],
      vibeTerms: ["relaxed", "casual", "chill"],
      featureTerms: [],
      negativeTerms: hasNoClubIntent(rawQuery) ? ["club", "dance club", "nightclub", "dancing", "live dj", "dj", "speakeasy", "nightlife"] : [],
      alternativeGroups: [],
    },
    pairingPreference: {
      requiresPairing: true,
      distanceMode: /\bwalk|walking|nearby|close by|close together|within walking distance\b/.test(q) ? "walking" : "any",
      maxPairDistanceMiles: null,
      maxPairWalkingMinutes: /\b30 minute|30-minute\b/.test(q) ? 30 : null,
      requireWalkablePair: /\bwalk|walking|within walking distance\b/.test(q),
    },
  } satisfies Partial<SearchIntent>;
}

function hasActivityOnlyFastPathIntent(query: string) {
  const q = String(query || "").toLowerCase();
  const hasRestaurantMeal = /\b(dinner|brunch|lunch|breakfast|restaurant|food|steak|seafood|sushi|mexican|italian)\b/.test(q);
  const hasActivity = /\b(rooftop drinks|rooftop lounge|rooftop bar|cocktail bar|cocktails|wine bar|chill drinks spot|bar with good music|lounge|speakeasy|karaoke bar|karaoke|comedy club|comedy show|comedy|hookah lounge|hookah|shisha|jazz lounge|live jazz spot|live jazz|live music|bowling|arcade|museum|mini golf|paint and sip|things to do|fun indoor activity|fun activity|date idea|football bar|watch basketball|where can i watch basketball)\b/.test(q);
  return hasActivity && !hasRestaurantMeal;
}

function createActivityOnlyFastPathIntent(rawQuery: string) {
  const q = rawQuery.toLowerCase();
  const activityTerms: string[] = [];
  if (/\brooftop\b/.test(q)) activityTerms.push("rooftop bar", "rooftop lounge", "rooftop drinks", "rooftop cocktails", "terrace bar", "terrace lounge", "skyline bar", "skyline lounge", "views", "outdoor bar", "bar", "lounge", "cocktails", "drinks");
  else if (/\bhookah\b|\bshisha\b/.test(q)) activityTerms.push("hookah", "hookah lounge", "hookah bar", "shisha", "lounge", "bar");
  else if (/\bkaraoke\b/.test(q)) activityTerms.push("karaoke", "karaoke bar");
  else if (/\bmini golf\b/.test(q)) activityTerms.push("mini golf", "putt putt", "games");
  else if (/\barcade\b/.test(q)) activityTerms.push("arcade", "games");
  else if (/\bmuseum\b/.test(q)) activityTerms.push("museum", "exhibit", "exhibition", "cultural center");
  else if (/\b(live jazz|jazz)\b/.test(q)) activityTerms.push("live jazz", "jazz", "jazz club", "live music");
  else if (/\bcomedy\b|\bshow\b/.test(q)) activityTerms.push("comedy club", "comedy show", "comedy", "show", "theater", "theatre");
  else if (/\bspeakeasy\b/.test(q)) activityTerms.push("speakeasy", "cocktails", "bar", "lounge");
  else if (/\bwine bar\b/.test(q)) activityTerms.push("wine bar", "bar", "drinks", "cocktails");
  else if (/\bcocktail|cocktails|bar|drinks\b/.test(q)) activityTerms.push("cocktail bar", "cocktails", "bar", "lounge", "wine bar", "speakeasy", "drinks");
  else if (/\blounge\b/.test(q)) activityTerms.push("lounge", "bar", "cocktails", "nightlife");
  else if (/\bthings to do|fun activity|date idea|first date|surprise me\b/.test(q)) activityTerms.push("activity", "things to do", "entertainment", "experience", "arcade", "bowling", "mini golf", "museum", "gallery", "comedy", "karaoke");
  return {
    rawQuery,
    searchType: "activity",
    primaryDomain: "activity",
    needsRestaurant: false,
    needsActivity: true,
    wantsPairing: false,
    strictness: "high",
    vibe: [],
    partySize: null,
    geo: emptyGeoIntent(),
    restaurantIntent: createEmptyRestaurantIntent(),
    activityIntent: { activityTerms: uniqueTerms(activityTerms), categoryTerms: [], vibeTerms: [], featureTerms: [], negativeTerms: [], alternativeGroups: [] },
    pairingPreference: { requiresPairing: false, distanceMode: "any", maxPairDistanceMiles: null, maxPairWalkingMinutes: null, requireWalkablePair: false },
  } satisfies Partial<SearchIntent>;
}

function hasRestaurantOnlyFastPathIntent(query: string) {
  const q = String(query || "").toLowerCase();
  const hasActivity = /\b(activity|things to do|karaoke|comedy|bowling|arcade|museum|hookah|lounge|bar|drinks|cocktails|rooftop|watch|game)\b/.test(q);
  const hasRestaurant = /\b(restaurant|dinner|brunch|lunch|breakfast|steakhouse|steak|seafood|sushi|mexican|italian|food|casual dinner|birthday dinner|romantic italian|brunch spot)\b/.test(q);
  return hasRestaurant && !hasActivity;
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
  return {
    rawQuery,
    searchType: "restaurant",
    primaryDomain: "restaurant",
    needsRestaurant: true,
    needsActivity: false,
    wantsPairing: false,
    strictness: "high",
    vibe: uniqueTerms(vibeTerms),
    partySize: null,
    geo: emptyGeoIntent(),
    restaurantIntent: { mealTerms: uniqueTerms(mealTerms), foodTerms: uniqueTerms(foodTerms), cuisineTerms: uniqueTerms(cuisineTerms), categoryTerms: [], vibeTerms: uniqueTerms(vibeTerms), featureTerms: [], negativeTerms: [], alternativeGroups: [] },
    activityIntent: createEmptyActivityIntent(),
    pairingPreference: { requiresPairing: false, distanceMode: "any", maxPairDistanceMiles: null, maxPairWalkingMinutes: null, requireWalkablePair: false },
  } satisfies Partial<SearchIntent>;
}

function createEnterpriseIntentFastPathResult(
  rawQuery: string,
): EnterpriseIntentFastPathResult {
  const query = rawQuery.toLowerCase().trim();

  if (hasSportsWatchFastPathIntent(query)) {
    return {
      intent: createSportsWatchFastPathIntent(rawQuery),
      reason: "matched sports-watch activity fast path",
      confidence: 0.9,
    };
  }

  if (hasExplicitMixedOutingIntent(query)) {
    return {
      intent: createExplicitMixedFastPathIntent(rawQuery),
      reason: "matched explicit mixed outing fast path",
      confidence: 0.9,
    };
  }

  if (hasRelaxedMixedFastPathIntent(query)) {
    return {
      intent: createRelaxedMixedFastPathIntent(rawQuery),
      reason: "matched relaxed mixed outing fast path",
      confidence: 0.9,
    };
  }

  if (isActivityVenueOnlyQuery(query)) {
    return {
      intent: createActivityOnlyFastPathIntent(rawQuery),
      reason: "matched activity-only venue fast path",
      confidence: 0.88,
    };
  }

  if (hasActivityOnlyFastPathIntent(query)) {
    return {
      intent: createActivityOnlyFastPathIntent(rawQuery),
      reason: "matched activity-only fast path",
      confidence: 0.88,
    };
  }

  if (hasRestaurantOnlyFastPathIntent(query)) {
    return {
      intent: createRestaurantOnlyFastPathIntent(rawQuery),
      reason: "matched restaurant-only fast path",
      confidence: 0.9,
    };
  }

  const connector = detectFastPathConnector(query);

  if (!connector) {
    return { intent: null, reason: "missing_pairing_connector" };
  }

  const restaurantSignals = detectFastPathRestaurantSignals(query);
  const activitySignals = detectFastPathActivitySignals(query);

  if (!restaurantSignals.length) {
    return { intent: null, reason: "missing_restaurant_signal" };
  }

  if (!activitySignals.length) {
    return { intent: null, reason: "missing_activity_signal" };
  }

  const mealTerms = detectMealTerms(query);
  const foodTerms = detectFoodTerms(query);
  const activityTerms = detectFastPathActivityIntentTerms(query);

  if (!mealTerms.length && !foodTerms.length) {
    return { intent: null, reason: "restaurant_signal_not_actionable" };
  }

  if (!activityTerms.length) {
    return { intent: null, reason: "activity_signal_not_actionable" };
  }

  const intent: Partial<SearchIntent> = {
    rawQuery,
    searchType: "mixed_outing",
    primaryDomain: "mixed",
    needsRestaurant: true,
    needsActivity: true,
    wantsPairing: true,
    restaurantIntent: {
      mealTerms,
      foodTerms,
      cuisineTerms: [],
      categoryTerms: [],
      vibeTerms: [],
      featureTerms: [],
      negativeTerms: [],
      alternativeGroups: [],
    },
    activityIntent: {
      activityTerms,
      categoryTerms: [],
      vibeTerms: [],
      featureTerms: [],
      negativeTerms: [],
      alternativeGroups: [],
    },
    pairingPreference: {
      requiresPairing: true,
      distanceMode: "any",
      maxPairDistanceMiles: null,
      maxPairWalkingMinutes: null,
      requireWalkablePair: false,
    },
    geo: emptyGeoIntent(),
    vibe: [],
    strictness: "high",
  };

  return {
    intent,
    reason: `matched connector "${connector}" with restaurant signals [${restaurantSignals.join(", ")}] and activity signals [${activitySignals.join(", ")}]`,
    confidence: 0.8,
  };
}

export function parseEnterpriseIntentFastPath(
  rawQuery: string,
): Partial<SearchIntent> | null {
  return createEnterpriseIntentFastPathResult(rawQuery).intent;
}

export function getEnterpriseIntentFastPathReason(
  rawQuery: string,
): string | null {
  return createEnterpriseIntentFastPathResult(rawQuery).reason;
}

function cleanEnvValue(value: string | undefined) {
  return value?.trim().replace(/^["']|["']$/g, "");
}

function getOpenAIClient() {
  const apiKey = cleanEnvValue(process.env.OPENAI_API_KEY);

  if (!apiKey) {
    return null;
  }

  try {
    return new OpenAI({ apiKey });
  } catch (error) {
    console.error("[enterprise intent parser] failed to create OpenAI client", {
      message: error instanceof Error ? error.message : String(error),
    });

    return null;
  }
}

function extractJson(text: string) {
  const trimmed = String(text || "").trim();

  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function sanitizeLlmIntent(value: unknown) {
  if (!isPlainObject(value)) return null;

  const restaurantIntent = isPlainObject(value.restaurantIntent)
    ? value.restaurantIntent
    : {};

  const activityIntent = isPlainObject(value.activityIntent)
    ? value.activityIntent
    : {};

  const geo = isPlainObject(value.geo) ? value.geo : {};

  const pairingPreference = isPlainObject(value.pairingPreference)
    ? value.pairingPreference
    : {};

  return {
    searchType:
      typeof value.searchType === "string" ? value.searchType : undefined,
    primaryDomain:
      typeof value.primaryDomain === "string" ? value.primaryDomain : undefined,
    needsRestaurant:
      typeof value.needsRestaurant === "boolean"
        ? value.needsRestaurant
        : undefined,
    needsActivity:
      typeof value.needsActivity === "boolean"
        ? value.needsActivity
        : undefined,
    wantsPairing:
      typeof value.wantsPairing === "boolean" ? value.wantsPairing : undefined,

    restaurantIntent: {
      mealTerms: safeStringArray(restaurantIntent.mealTerms),
      foodTerms: safeStringArray(restaurantIntent.foodTerms),
      cuisineTerms: safeStringArray(restaurantIntent.cuisineTerms),
      categoryTerms: safeStringArray(restaurantIntent.categoryTerms),
      vibeTerms: safeStringArray(restaurantIntent.vibeTerms),
      featureTerms: safeStringArray(restaurantIntent.featureTerms),
      negativeTerms: safeStringArray(restaurantIntent.negativeTerms),
    },

    activityIntent: {
      activityTerms: safeStringArray(activityIntent.activityTerms),
      categoryTerms: safeStringArray(activityIntent.categoryTerms),
      vibeTerms: safeStringArray(activityIntent.vibeTerms),
      featureTerms: safeStringArray(activityIntent.featureTerms),
      negativeTerms: safeStringArray(activityIntent.negativeTerms),
    },

    geo: {
      raw: typeof geo.raw === "string" ? geo.raw : undefined,
      neighborhood:
        typeof geo.neighborhood === "string" ? geo.neighborhood : undefined,
      city: typeof geo.city === "string" ? geo.city : undefined,
      borough: typeof geo.borough === "string" ? geo.borough : undefined,
      county: typeof geo.county === "string" ? geo.county : undefined,
      region: typeof geo.region === "string" ? geo.region : undefined,
      state: typeof geo.state === "string" ? geo.state : undefined,
    },

    pairingPreference: {
      requiresPairing:
        typeof pairingPreference.requiresPairing === "boolean"
          ? pairingPreference.requiresPairing
          : undefined,
      distanceMode:
        typeof pairingPreference.distanceMode === "string"
          ? pairingPreference.distanceMode
          : undefined,
      maxPairDistanceMiles:
        typeof pairingPreference.maxPairDistanceMiles === "number"
          ? pairingPreference.maxPairDistanceMiles
          : null,
      maxPairWalkingMinutes:
        typeof pairingPreference.maxPairWalkingMinutes === "number"
          ? pairingPreference.maxPairWalkingMinutes
          : null,
      requireWalkablePair:
        typeof pairingPreference.requireWalkablePair === "boolean"
          ? pairingPreference.requireWalkablePair
          : undefined,
    },

    occasion: typeof value.occasion === "string" ? value.occasion : undefined,
    vibe:
      typeof value.vibe === "string"
        ? [value.vibe]
        : Array.isArray(value.vibe)
          ? safeStringArray(value.vibe)
          : undefined,
    budget: typeof value.budget === "string" ? value.budget : undefined,
    timeContext:
      typeof value.timeContext === "string" ? value.timeContext : undefined,
  };
}

function mergeLlmWithBaseline(
  query: string,
  baseline: SearchIntent,
  llmValue: unknown,
): SearchIntent {
  const safeLlm = sanitizeLlmIntent(llmValue);

  if (!safeLlm) {
    return baseline;
  }

  const normalizedLlm = normalizeIntent(
    query,
    safeLlm as Partial<SearchIntent>,
  );

  return {
    ...baseline,
    ...normalizedLlm,

    vibe: [
      ...new Set([
        ...(Array.isArray(baseline.vibe) ? baseline.vibe : []),
        ...(Array.isArray(normalizedLlm.vibe)
          ? normalizedLlm.vibe
          : typeof (normalizedLlm as any).vibe === "string"
            ? [(normalizedLlm as any).vibe]
            : []),
      ]),
    ],

    restaurantIntent: {
      ...baseline.restaurantIntent,
      ...normalizedLlm.restaurantIntent,
      mealTerms: [
        ...new Set([
          ...(baseline.restaurantIntent?.mealTerms || []),
          ...(normalizedLlm.restaurantIntent?.mealTerms || []),
        ]),
      ],
      foodTerms: [
        ...new Set([
          ...(baseline.restaurantIntent?.foodTerms || []),
          ...(normalizedLlm.restaurantIntent?.foodTerms || []),
        ]),
      ],
      cuisineTerms: [
        ...new Set([
          ...(baseline.restaurantIntent?.cuisineTerms || []),
          ...(normalizedLlm.restaurantIntent?.cuisineTerms || []),
        ]),
      ],
      categoryTerms: [
        ...new Set([
          ...(baseline.restaurantIntent?.categoryTerms || []),
          ...(normalizedLlm.restaurantIntent?.categoryTerms || []),
        ]),
      ],
      vibeTerms: [
        ...new Set([
          ...(baseline.restaurantIntent?.vibeTerms || []),
          ...(normalizedLlm.restaurantIntent?.vibeTerms || []),
        ]),
      ],
      featureTerms: [
        ...new Set([
          ...(baseline.restaurantIntent?.featureTerms || []),
          ...(normalizedLlm.restaurantIntent?.featureTerms || []),
        ]),
      ],
      negativeTerms: [
        ...new Set([
          ...(baseline.restaurantIntent?.negativeTerms || []),
          ...(normalizedLlm.restaurantIntent?.negativeTerms || []),
        ]),
      ],
    },

    activityIntent: {
      ...baseline.activityIntent,
      ...normalizedLlm.activityIntent,
      activityTerms: [
        ...new Set([
          ...(baseline.activityIntent?.activityTerms || []),
          ...(normalizedLlm.activityIntent?.activityTerms || []),
        ]),
      ],
      categoryTerms: [
        ...new Set([
          ...(baseline.activityIntent?.categoryTerms || []),
          ...(normalizedLlm.activityIntent?.categoryTerms || []),
        ]),
      ],
      vibeTerms: [
        ...new Set([
          ...(baseline.activityIntent?.vibeTerms || []),
          ...(normalizedLlm.activityIntent?.vibeTerms || []),
        ]),
      ],
      featureTerms: [
        ...new Set([
          ...(baseline.activityIntent?.featureTerms || []),
          ...(normalizedLlm.activityIntent?.featureTerms || []),
        ]),
      ],
      negativeTerms: [
        ...new Set([
          ...(baseline.activityIntent?.negativeTerms || []),
          ...(normalizedLlm.activityIntent?.negativeTerms || []),
        ]),
      ],
    },

    geo: {
      ...baseline.geo,
      ...normalizedLlm.geo,
      raw: normalizedLlm.geo?.raw || baseline.geo?.raw || null,
      neighborhood:
        normalizedLlm.geo?.neighborhood || baseline.geo?.neighborhood || null,
      city: normalizedLlm.geo?.city || baseline.geo?.city || null,
      borough: normalizedLlm.geo?.borough || baseline.geo?.borough || null,
      county: normalizedLlm.geo?.county || baseline.geo?.county || null,
      region: normalizedLlm.geo?.region || baseline.geo?.region || null,
      state: normalizedLlm.geo?.state || baseline.geo?.state || null,
      latitude: baseline.geo?.latitude ?? normalizedLlm.geo?.latitude ?? null,
      longitude:
        baseline.geo?.longitude ?? normalizedLlm.geo?.longitude ?? null,
      radiusMiles:
        baseline.geo?.radiusMiles ?? normalizedLlm.geo?.radiusMiles ?? null,
    },

    pairingPreference: {
      requiresPairing:
        normalizedLlm.pairingPreference?.requiresPairing ??
        baseline.pairingPreference?.requiresPairing ??
        false,
      distanceMode:
        normalizedLlm.pairingPreference?.distanceMode ??
        baseline.pairingPreference?.distanceMode ??
        "any",
      maxPairDistanceMiles:
        normalizedLlm.pairingPreference?.maxPairDistanceMiles ??
        baseline.pairingPreference?.maxPairDistanceMiles ??
        null,
      maxPairWalkingMinutes:
        normalizedLlm.pairingPreference?.maxPairWalkingMinutes ??
        baseline.pairingPreference?.maxPairWalkingMinutes ??
        null,
      requireWalkablePair:
        normalizedLlm.pairingPreference?.requireWalkablePair ??
        baseline.pairingPreference?.requireWalkablePair ??
        false,
    },
  };
}

const SYSTEM_PROMPT = `Return JSON only. You are enhancing a pre-parsed search intent for TheOutHaven.

TheOutHaven helps users find restaurants, activities, and paired outings.

Rules:
- Keep obvious preIntent fields unless clearly wrong.
- Add missing nuance, vibe, occasion, pairing preference, and user constraints.
- Do not remove explicit user terms.
- Do not turn activity-only searches into mixed outings unless the user asks for both food and activity.
- Do not turn sports-watch bar searches into rooftop/lounge searches.
- Do not turn drinks/lounge searches into theater unless theater/performance/comedy/show is requested.
- Do not classify churches/places of worship as date-night activities unless explicitly requested.
- Keep geo fields if present.
- If preIntent exists, enhance it. If preIntent is null, parse normally.
- Separate restaurant intent from activity intent.
- Do not put food terms in activity intent.
- Do not put activity terms in restaurant intent.
- "after", "before", "then", "with", "near", "nearby", and "walking distance" are relationship words, not search terms.
- "steak dinner" means restaurant only.
- "rooftop dinner" means restaurant only unless another activity is requested.
- "hookah lounge" can be an activity/nightlife venue unless the user asks for food there.
- "bowling", "karaoke", "museum", "comedy show", "arcade", "spa", "paint and sip" are activities.
- If user asks restaurant + activity, set wantsPairing true.
- If user asks walking distance, nearby, close by, same block, no driving, short walk, or an explicit walking minute limit, set pairingPreference.

Pairing preference:
- walking distance/no driving: distanceMode "walking", maxPairDistanceMiles 3, maxPairWalkingMinutes 60, requireWalkablePair true.
- explicit walking limits like "30 minute walk apart": distanceMode "walking", maxPairDistanceMiles 1.5, maxPairWalkingMinutes 30, requireWalkablePair true. Never set a walking limit above 60 minutes.
- short walk/same block: distanceMode "walking", maxPairDistanceMiles 0.75, maxPairWalkingMinutes 15, requireWalkablePair true.
- nearby/close by/close together: distanceMode "nearby", maxPairDistanceMiles 1.5, maxPairWalkingMinutes 30, requireWalkablePair true.
- same area/neighborhood: distanceMode "same_area", maxPairDistanceMiles 3, requireWalkablePair false.
- no distance phrase: distanceMode "any", maxPairDistanceMiles null, requireWalkablePair false.

Return this JSON shape:
{
  "searchType": "restaurant" | "activity" | "mixed_outing" | "any",
  "primaryDomain": "restaurant" | "activity" | "mixed" | "any",
  "needsRestaurant": boolean,
  "needsActivity": boolean,
  "wantsPairing": boolean,
  "restaurantIntent": {
    "mealTerms": string[],
    "foodTerms": string[],
    "cuisineTerms": string[],
    "categoryTerms": string[],
    "vibeTerms": string[],
    "featureTerms": string[],
    "negativeTerms": string[]
  },
  "activityIntent": {
    "activityTerms": string[],
    "categoryTerms": string[],
    "vibeTerms": string[],
    "featureTerms": string[],
    "negativeTerms": string[]
  },
  "geo": {
    "raw": string | null,
    "neighborhood": string | null,
    "city": string | null,
    "borough": string | null,
    "county": string | null,
    "region": string | null,
    "state": string | null
  },
  "pairingPreference": {
    "requiresPairing": boolean,
    "distanceMode": "walking" | "nearby" | "same_area" | "any",
    "maxPairDistanceMiles": number | null,
    "maxPairWalkingMinutes": number | null,
    "requireWalkablePair": boolean
  },
  "occasion": string | null,
  "vibe": string | null,
  "budget": string | null,
  "timeContext": string | null
}`;

async function enhanceIntentWithLLM(args: {
  rawQuery: string;
  preIntent?: Partial<SearchIntent> | SearchIntent | null;
  model: string;
}) {
  const openai = getOpenAIClient();
  if (!openai) {
    throw new Error("OpenAI client unavailable. Using deterministic baseline.");
  }

  const completion = await openai.chat.completions.create({
    model: args.model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          rawQuery: args.rawQuery,
          preIntent: args.preIntent ?? null,
        }),
      },
    ],
  });

  const rawText = completion.choices[0]?.message?.content ?? "{}";
  const parsed = extractJson(rawText);
  if (!parsed)
    throw new Error("LLM returned invalid JSON. Used deterministic baseline.");
  return parsed;
}

function isUsablePreIntent(
  preIntent: Partial<SearchIntent> | SearchIntent | null | undefined,
) {
  if (!preIntent) return false;

  const hasDomain =
    preIntent.searchType === "restaurant" ||
    preIntent.searchType === "activity" ||
    preIntent.searchType === "mixed_outing";

  const hasNeed =
    Boolean(preIntent.needsRestaurant) || Boolean(preIntent.needsActivity);

  return hasDomain && hasNeed;
}

function getIntentConfidence(intent: any): number | null {
  const confidence =
    intent?.confidence ??
    intent?.parserConfidence ??
    intent?.llmConfidence ??
    null;
  const n = Number(confidence);
  return Number.isFinite(n) ? n : null;
}

function shouldUseFallbackIntentModel(args: {
  fastModelFailed: boolean;
  fastModelConfidence?: number | null;
  hasUsablePreIntent: boolean;
  rawQuery: string;
}) {
  if (args.fastModelFailed && !args.hasUsablePreIntent) return true;
  if ((args.fastModelConfidence ?? 1) < 0.55 && !args.hasUsablePreIntent)
    return true;

  const q = args.rawQuery.toLowerCase();
  const complex =
    /\b(surprise me|plan my night|something different|not too expensive|romantic but fun|low key but upscale|after dinner nearby|before dinner nearby|somewhere unique|make it special)\b/.test(
      q,
    ) || q.split(/\s+/).length >= 18;

  return complex && !args.hasUsablePreIntent;
}

export async function parseEnterpriseIntent(
  query: string,
  options?: {
    useLLM?: boolean;
    useFastPath?: boolean;
    body?: unknown;
    debug?: Record<string, any>;
  },
): Promise<{
  intent: SearchIntent;
  llmIntentRaw: unknown;
  llmError?: string;
  intentParserSource:
    | "fast_path"
    | "llm"
    | "deterministic"
    | "cache"
    | "fast_path_plus_llm"
    | "llm_fast_model"
    | "fast_path_timeout_fallback"
    | "llm_fallback_model"
    | "preintent_fallback"
    | "deterministic_fallback";
  fastPathMatched: boolean;
  fastPathReason: string | null;
  usedLlm: boolean;
  debug: Record<string, any>;
}> {
  const startedAt = Date.now();
  const debug = options?.debug ?? {};
  const baseline = deterministicIntentFromQuery(query);

  debug.intentLlmFastModel = SEARCH_INTENT_FAST_MODEL;
  debug.intentLlmFallbackModel = SEARCH_INTENT_FALLBACK_MODEL;
  debug.intentCacheVersion = SEARCH_INTENT_CACHE_VERSION;

  const useFastPath = options?.useFastPath !== false;
  const fastPathResult = useFastPath
    ? createEnterpriseIntentFastPathResult(query)
    : { intent: null, reason: "fast_path_disabled", confidence: 0 };
  const preIntent = fastPathResult.intent ?? null;
  const hasPreIntent = isUsablePreIntent(preIntent);

  debug.preIntentMatched = Boolean(preIntent);
  debug.preIntentSource = preIntent ? "fast_path" : null;
  debug.preIntentReason = fastPathResult.reason ?? null;

  const highConfidenceFastPathReasons = new Set([
    "matched sports-watch activity fast path",
    "matched relaxed mixed outing fast path",
    "matched activity-only fast path",
    "matched restaurant-only fast path",
  ]);

  if (
    fastPathResult?.reason &&
    highConfidenceFastPathReasons.has(fastPathResult.reason) &&
    (fastPathResult.confidence ?? 0) >= 0.88
  ) {
    const normalized = normalizeIntent(
      query,
      preIntent as Partial<SearchIntent>,
    );

    debug.intentParserSource = "fast_path";
    debug.intentLlmModel = null;
    debug.llmEnhancementUsed = false;
    debug.llmFallbackUsed = false;
    debug.llmTimedOut = false;
    debug.fallbackIntentUsed = false;
    debug.intentCacheHit = false;
    debug.llm_ms = 0;
    debug.fast_llm_ms = 0;
    debug.intent_parse_ms = Date.now() - startedAt;

    return {
      intent: normalized,
      llmIntentRaw: null,
      llmError: undefined,
      intentParserSource: "fast_path",
      fastPathMatched: true,
      fastPathReason: fastPathResult.reason,
      usedLlm: false,
      debug,
    };
  }

  if (options?.useLLM === false) {
    const intent = normalizeIntent(query, preIntent ?? baseline);
    debug.intentParserSource = preIntent ? "fast_path" : "deterministic";
    debug.llmEnhancementUsed = false;
    debug.llmFallbackUsed = false;
    debug.fallbackIntentUsed = !preIntent;
    debug.intent_parse_ms = Date.now() - startedAt;
    return {
      intent,
      llmIntentRaw: null,
      llmError: undefined,
      intentParserSource: debug.intentParserSource,
      fastPathMatched: Boolean(preIntent),
      fastPathReason: fastPathResult.reason,
      usedLlm: false,
      debug,
    };
  }

  const cacheKey = buildSearchIntentCacheKey({
    rawQuery: query,
    geo:
      (options?.body as any)?.geo ?? (options?.body as any)?.location ?? null,
    parserVersion: SEARCH_INTENT_CACHE_VERSION,
    model: SEARCH_INTENT_FAST_MODEL,
  });
  debug.intentCacheKey = cacheKey;
  const cached = await getCachedSearchIntent(cacheKey);
  if (cached) {
    debug.intentCacheHit = true;
    debug.intentParserSource = "cache";
    debug.intent_parse_ms = Date.now() - startedAt;
    debug.llmEnhancementUsed = Boolean(cached.llmEnhancementUsed ?? true);
    debug.intentLlmModel = cached.modelUsed ?? SEARCH_INTENT_FAST_MODEL;
    return {
      intent: cached.intent,
      llmIntentRaw: null,
      intentParserSource: "cache",
      fastPathMatched: Boolean(preIntent),
      fastPathReason: fastPathResult.reason,
      usedLlm: debug.llmEnhancementUsed,
      debug,
    };
  }
  debug.intentCacheHit = false;

  let fastModelError: unknown = null;
  let fastModelConfidence: number | null = null;
  let llmIntentRaw: unknown = null;
  const fastLlmStartedAt = Date.now();

  try {
    const fastIntent = await withTimeout(
      enhanceIntentWithLLM({
        rawQuery: query,
        preIntent,
        model: SEARCH_INTENT_FAST_MODEL,
      }),
      SEARCH_INTENT_LLM_TIMEOUT_MS,
      "search_intent_fast_model_timeout",
    );
    llmIntentRaw = fastIntent;
    fastModelConfidence = getIntentConfidence(fastIntent);
    const merged = mergeLlmIntentWithPreIntent({
      rawQuery: query,
      preIntent,
      llmIntent: fastIntent,
    });
    const normalized = normalizeIntent(query, merged);

    debug.intentParserSource = hasPreIntent
      ? "fast_path_plus_llm"
      : "llm_fast_model";
    debug.intentLlmModel = SEARCH_INTENT_FAST_MODEL;
    debug.llmEnhancementUsed = true;
    debug.llmFallbackUsed = false;
    debug.llmTimedOut = false;
    debug.fallbackIntentUsed = false;
    debug.fast_llm_ms = Date.now() - fastLlmStartedAt;
    debug.llm_ms = debug.fast_llm_ms;
    debug.intent_parse_ms = Date.now() - startedAt;

    await setCachedSearchIntent(cacheKey, {
      intent: normalized,
      modelUsed: SEARCH_INTENT_FAST_MODEL,
      parserVersion: SEARCH_INTENT_CACHE_VERSION,
      llmEnhancementUsed: true,
    });
    return {
      intent: normalized,
      llmIntentRaw,
      intentParserSource: debug.intentParserSource,
      fastPathMatched: Boolean(preIntent),
      fastPathReason: fastPathResult.reason,
      usedLlm: true,
      debug,
    };
  } catch (error) {
    fastModelError = error;
    debug.fast_llm_ms = Date.now() - fastLlmStartedAt;
    debug.llm_ms = debug.fast_llm_ms;
    debug.llmError = error instanceof Error ? error.message : String(error);
    debug.llmTimedOut = String(debug.llmError || "").includes("timeout");

    if (hasPreIntent) {
      const normalizedPreIntent = normalizeIntent(query, preIntent);
      debug.intentParserSource = "fast_path_timeout_fallback";
      debug.intentLlmModel = SEARCH_INTENT_FAST_MODEL;
      debug.llmEnhancementUsed = false;
      debug.llmFallbackUsed = false;
      debug.fallbackIntentUsed = true;
      debug.intent_parse_ms = Date.now() - startedAt;
      await setCachedSearchIntent(cacheKey, {
        intent: normalizedPreIntent,
        modelUsed: "preIntent",
        parserVersion: SEARCH_INTENT_CACHE_VERSION,
        llmEnhancementUsed: false,
      });
      return {
        intent: normalizedPreIntent,
        llmIntentRaw: null,
        llmError: debug.llmError,
        intentParserSource: debug.intentParserSource,
        fastPathMatched: true,
        fastPathReason: fastPathResult.reason,
        usedLlm: false,
        debug,
      };
    }
  }

  if (
    shouldUseFallbackIntentModel({
      fastModelFailed: Boolean(fastModelError),
      fastModelConfidence,
      hasUsablePreIntent: hasPreIntent,
      rawQuery: query,
    })
  ) {
    const fallbackStartedAt = Date.now();
    try {
      const fallbackIntent = await withTimeout(
        enhanceIntentWithLLM({
          rawQuery: query,
          preIntent,
          model: SEARCH_INTENT_FALLBACK_MODEL,
        }),
        SEARCH_INTENT_FALLBACK_TIMEOUT_MS,
        "search_intent_fallback_model_timeout",
      );
      llmIntentRaw = fallbackIntent;
      const merged = mergeLlmIntentWithPreIntent({
        rawQuery: query,
        preIntent,
        llmIntent: fallbackIntent,
      });
      const normalized = normalizeIntent(query, merged);
      debug.intentParserSource = "llm_fallback_model";
      debug.intentLlmModel = SEARCH_INTENT_FALLBACK_MODEL;
      debug.llmEnhancementUsed = true;
      debug.llmFallbackUsed = true;
      debug.fallbackIntentUsed = false;
      debug.fallback_llm_ms = Date.now() - fallbackStartedAt;
      debug.llm_ms = (debug.fast_llm_ms ?? 0) + debug.fallback_llm_ms;
      debug.intent_parse_ms = Date.now() - startedAt;
      await setCachedSearchIntent(cacheKey, {
        intent: normalized,
        modelUsed: SEARCH_INTENT_FALLBACK_MODEL,
        parserVersion: SEARCH_INTENT_CACHE_VERSION,
        llmEnhancementUsed: true,
        fallbackUsed: true,
      });
      return {
        intent: normalized,
        llmIntentRaw,
        intentParserSource: "llm_fallback_model",
        fastPathMatched: Boolean(preIntent),
        fastPathReason: fastPathResult.reason,
        usedLlm: true,
        debug,
      };
    } catch (fallbackError) {
      debug.llmFallbackError =
        fallbackError instanceof Error
          ? fallbackError.message
          : String(fallbackError);
      debug.fallback_llm_ms = Date.now() - fallbackStartedAt;
    }
  }

  const deterministicIntent = normalizeIntent(query, preIntent ?? baseline);
  debug.intentParserSource = preIntent
    ? "preintent_fallback"
    : "deterministic_fallback";
  debug.intentLlmModel = null;
  debug.llmEnhancementUsed = false;
  debug.llmFallbackUsed = false;
  debug.fallbackIntentUsed = true;
  debug.intent_parse_ms = Date.now() - startedAt;

  return {
    intent: deterministicIntent,
    llmIntentRaw,
    llmError: debug.llmError,
    intentParserSource: debug.intentParserSource,
    fastPathMatched: Boolean(preIntent),
    fastPathReason: fastPathResult.reason,
    usedLlm: false,
    debug,
  };
}
