export const NEAR_ME_PATTERN =
  /\b(?:near me|around me|close to me|by me|nearby me|near my location|around my location|close to my location|use my location|current location|near where I am|around where I am)\b/i;

export const PAIR_PROXIMITY_PATTERN =
  /\b(?:nearby|close by|close together|near each other|walking distance|walkable|within walking distance|short walk|quick walk|around the corner|same block|within \d+(?:\.\d+)? minutes?|within \d+(?:\.\d+)? miles?|\d+(?:\.\d+)? minute walk)\b/i;

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
  return TYPED_LOCATION_PATTERN.test(query || "");
}
