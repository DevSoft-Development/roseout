export const NEAR_ME_PATTERN =
  /\b(near me|nearby|around me|close to me|by me|near my location|around my location)\b/i;

export function hasNearMeIntent(query: string) {
  return NEAR_ME_PATTERN.test(query || "");
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
