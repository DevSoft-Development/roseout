export const NEAR_ME_PATTERN =
  /\b(?:near me|around me|close to me|by me|nearby me|near my location|around my location|close to my location|use my location|current location|near where I am|around where I am)\b/i;

export const PAIR_PROXIMITY_PATTERN =
  /\b(?:nearby|close by|close together|near each other|not far apart|very close|right near each other|walking distance|walkable|walking|walk apart|walk away|within walking distance|within a walk|short walk|quick walk|easy walk|brief walk|few minute walk|a few minutes'? walk|stroll|short stroll|easy stroll|on foot|by foot|foot distance|pedestrian[- ]friendly|walk[- ]friendly|can walk to|can walk between|can walk from|walk from|walk to|walk between|no driving|without driving|don'?t have to drive|do not have to drive|no car needed|without a car|around the corner|same block|a block away|one block away|two blocks away|few blocks away|a few blocks away|within \d+(?:\.\d+)? minutes?|within \d+(?:\.\d+)? miles?|\d+(?:\.\d+)? minute walk)\b/i;

export function hasNearMeIntent(query: string) {
  return NEAR_ME_PATTERN.test(query || "");
}

export function hasPairProximityIntent(query: string) {
  return PAIR_PROXIMITY_PATTERN.test(query || "");
}

export function stripNearMeIntent(query: string) {
  return (query || "")
    .replace(NEAR_ME_PATTERN, "")
    .replace(/\s+/g, " ")
    .trim();
}


const TYPED_LOCATION_PATTERN =
  /\b(queens|brooklyn|manhattan|bronx|staten island|long island|astoria|lic|long island city|williamsburg|bushwick|flushing|forest hills|jamaica|bayside|elmhurst|jackson heights|harlem|soho|tribeca|chelsea|midtown|downtown|uptown|hoboken|jersey city|newark|yonkers|nyc|new york|nassau|suffolk)\b/i;

export function hasTypedLocationIntent(query: string) {
  return TYPED_LOCATION_PATTERN.test(query || "") || /(?:^|\D)\d{5}(?:-\d{4})?(?=\D|$)/.test(query || "");
}
