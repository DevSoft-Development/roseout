import { normalizeGeoTerm } from "../../enterprise/geo-taxonomy";

const WORD_REWRITES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bsuhsi\b/gi, "sushi"],
  [/\bsushi?i\b/gi, "sushi"],
  [/\bitalain\b/gi, "italian"],
  [/\bbolwing\b/gi, "bowling"],
  [/\bcaribean\b/gi, "caribbean"],
  [/\bkaroke\b/gi, "karaoke"],
  [/\bromntic\b/gi, "romantic"],
  [/\bdiner\b/gi, "dinner"],
  [/\bescap(?:e)?\s+room\b/gi, "escape room"],
  [/\bnite\b/gi, "night"],
  [/\blowkey\b/gi, "low key"],
  [/\bbk\b/gi, "brooklyn"],
  [/\bquick bite\b/gi, "quick bite restaurant"],
];

const CUISINE_ALIASES: ReadonlyArray<readonly [string, RegExp]> = [
  ["italian", /\bitalian\b/i],
  ["mexican", /\bmexican\b/i],
  ["thai", /\bthai\b/i],
  ["indian", /\bindian\b/i],
  ["chinese", /\bchinese\b/i],
  ["japanese", /\bjapanese\b/i],
  ["korean", /\bkorean\b/i],
  ["caribbean", /\bcaribbean|west indian\b/i],
  ["jamaican", /\bjamaican\b/i],
  ["haitian", /\bhaitian\b/i],
  ["seafood", /\bseafood\b/i],
  ["sushi", /\bsushi\b/i],
  ["steakhouse", /\bsteakhouse\b/i],
  ["peruvian", /\bperuvian\b/i],
  ["vegan", /\bvegan\b/i],
  ["dominican", /\bdominican\b/i],
  ["puerto_rican", /\bpuerto rican\b/i],
  ["cuban", /\bcuban\b/i],
  ["vietnamese", /\bvietnamese\b/i],
  ["mediterranean", /\bmediterranean\b/i],
  ["greek", /\bgreek\b/i],
  ["middle_eastern", /\bmiddle eastern\b/i],
  ["soul_food", /\bsoul food\b/i],
];

const ACTIVITY_ALIASES: ReadonlyArray<readonly [string, RegExp]> = [
  ["bowling", /\bbowling\b/i],
  ["karaoke", /\bkaraoke\b/i],
  ["comedy", /\bcomedy(?: show| club)?\b/i],
  ["escape_room", /\bescape room\b/i],
  ["mini_golf", /\bmini(?:ature)?[- ]?golf\b/i],
  ["arcade", /\barcade\b/i],
  ["live_music", /\blive music|\bjazz\b/i],
  ["rooftop", /\brooftop(?: lounge| bar| drinks?)?\b/i],
];

const PLACE_ALIASES: ReadonlyArray<readonly [string, RegExp]> = [
  ["Brooklyn", /\bbrooklyn\b/i],
  ["Queens", /\bqueens\b/i],
  ["Manhattan", /\bmanhattan\b/i],
  ["Bronx", /\b(?:the )?bronx\b/i],
  ["Astoria", /\bastoria\b/i],
  ["Flushing", /\bflushing\b/i],
  ["Forest Hills", /\bforest hills\b/i],
  ["Long Island City", /\blong island city\b/i],
  ["Harlem", /\bharlem\b/i],
  ["Williamsburg", /\bwilliamsburg\b/i],
  ["Bushwick", /\bbushwick\b/i],
  ["Jackson Heights", /\bjackson heights\b/i],
  ["Huntington", /\bhuntington\b/i],
  ["Patchogue", /\bpatchogue\b/i],
];

export function normalizeNoisySearchLanguage(query: string) {
  let normalized = String(query || "");
  for (const [pattern, replacement] of WORD_REWRITES) normalized = normalized.replace(pattern, replacement);
  return normalized.replace(/\s+/g, " ").trim();
}

export function inferNoisyLanguageSignals(query: string) {
  const normalizedQuery = normalizeNoisySearchLanguage(query);
  const cuisines = CUISINE_ALIASES.filter(([, pattern]) => pattern.test(normalizedQuery)).map(([id]) => id);
  const restaurantSignal = cuisines.length > 0 || /\b(?:restaurant|dinner|brunch|lunch|breakfast|food|eat|eats|dining|takeout|fast casual|quick bite|deli)\b/i.test(normalizedQuery);
  const explicitRooftopSecondStop = /\b(?:then|after|afterward|afterwards|followed by|and)\b[^.?!]{0,60}\brooftop(?: lounge| bar| drinks?)?\b/i.test(normalizedQuery)
    || /\brooftop(?: lounge| bar| drinks?)\b/i.test(normalizedQuery);
  const activityCategories = ACTIVITY_ALIASES
    .filter(([id, pattern]) => pattern.test(normalizedQuery) && (id !== "rooftop" || !restaurantSignal || explicitRooftopSecondStop))
    .map(([id]) => id);
  const placeName = PLACE_ALIASES.find(([, pattern]) => pattern.test(normalizedQuery))?.[0] ?? null;
  const geo = placeName ? normalizeGeoTerm(placeName) : null;
  const openEndedActivity = /\b(?:something|somewhere|anything)\s+(?:fun|chill|relaxing|interesting|different|active|creative)?\s*(?:nearby\s+)?(?:to do)?\b/i.test(normalizedQuery) && /\b(?:then|after|afterward|afterwards|and|activity|fun|chill|relaxing|to do)\b/i.test(normalizedQuery);
  const activitySignal = activityCategories.length > 0 || /\bactivities?\b/i.test(normalizedQuery) || openEndedActivity;
  const sameVenueRequired = /\b(?:same (?:venue|place)|one (?:venue|place)|under one roof|all in one place)\b/i.test(normalizedQuery);
  const sequential = /\b(?:then|and then|after|afterward|afterwards|followed by)\b/i.test(normalizedQuery);
  return {
    normalizedQuery,
    cuisines: [...new Set(cuisines)],
    activityCategories: [...new Set(activityCategories)],
    geo,
    restaurantSignal,
    activitySignal,
    sameVenueRequired,
    sequential,
  };
}