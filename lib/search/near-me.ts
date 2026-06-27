export const NEAR_ME_PATTERN =
  /\b(?:near me|around me|close to me|by me|nearby me|near my location|around my location|close to my location|use my location|current location|near where i am|around where i am)\b/i;

export const PAIR_PROXIMITY_PATTERN =
  /\b(?:nearby|close by|close together|near each other|walking distance|walkable|short walk|quick walk|around the corner|same block|within walking distance|within\s+\d+(?:\.\d+)?\s*(?:minutes?|mins?|miles?|mi)|\d+(?:\.\d+)?\s*(?:minute|min)\s+walk)\b/i;

export function hasNearMeIntent(query: string): boolean {
  return NEAR_ME_PATTERN.test(query || "");
}

export function stripNearMeIntent(query: string): string {
  return (query || "")
    .replace(NEAR_ME_PATTERN, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasPairProximityIntent(query: string): boolean {
  return PAIR_PROXIMITY_PATTERN.test(query || "");
}

const TYPED_LOCATION_PATTERN =
  /\b(queens|brooklyn|manhattan|bronx|staten island|long island|astoria|lic|long island city|williamsburg|bushwick|flushing|forest hills|jamaica|bayside|elmhurst|jackson heights|harlem|soho|tribeca|chelsea|midtown|downtown|uptown|hoboken|jersey city|newark|yonkers|nyc|new york|nassau|suffolk)\b/i;

export function hasTypedLocationIntent(query: string) {
  return TYPED_LOCATION_PATTERN.test(query || "");
}
