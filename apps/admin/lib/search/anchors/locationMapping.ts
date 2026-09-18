import { normalizeAnchorText } from "./normalize";
import type { RadiusStrategy, SearchAnchorType } from "./types";

export type RadiusPolicy = { defaultRadiusMiles: number; maxRadiusMiles: number; radiusStrategy: RadiusStrategy };

function text(location: any) {
  return [location.location_type, location.primary_category, location.category, location.activity_type, location.cuisine_type, location.tags]
    .flat()
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function locationDisplayName(location: any): string {
  return String(location.name || location.restaurant_name || location.activity_name || "").trim();
}

export function isEligibleApprovedAnchorLocation(location: any): boolean {
  const name = locationDisplayName(location);
  const lat = Number(location.latitude);
  const lon = Number(location.longitude);
  const status = String(location.status || location.data_status || location.quality_status || "").toLowerCase();
  const visibility = String(location.public_visibility_tier || "").toLowerCase();
  const sourceQuality = String(location.source_quality_status || location.quality_status || "").toLowerCase();
  return Boolean(
    name &&
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      location.is_searchable === true &&
      location.is_hidden !== true &&
      location.deleted_at == null &&
      location.is_deleted !== true &&
      location.demo_only !== true &&
      location.is_demo_only !== true &&
      location.training_only !== true &&
      location.is_training_only !== true &&
      location.is_suppressed !== true &&
      location.suppressed !== true &&
      location.is_low_level !== true &&
      visibility !== "hidden" &&
      !["closed", "archived", "deleted", "duplicate", "rejected"].includes(status) &&
      !["low_level_review", "suppressed", "generic_restaurant"].includes(sourceQuality),
  );
}

export function inferAnchorTypeFromLocation(location: any): SearchAnchorType {
  const haystack = normalizeAnchorText(text(location));
  if (/transit|station|terminal|train|bus/.test(haystack)) return "transit_hub";
  if (/beach/.test(haystack)) return "beach";
  if (/hotel/.test(haystack)) return "hotel";
  if (/universit|college/.test(haystack)) return "university";
  if (/theater|theatre|cinema|perform/.test(haystack)) return "theater";
  if (/stadium|ballpark|field/.test(haystack)) return "stadium";
  if (/arena/.test(haystack)) return "arena";
  if (/mall|shopping/.test(haystack)) return "mall";
  if (/museum|gallery/.test(haystack)) return "museum";
  if (/park/.test(haystack)) return "park";
  if (/arcade|bowling|escape room|nightclub|lounge|karaoke|activity|entertainment|game/.test(haystack)) return "activity";
  if (/restaurant|cafe|coffee|bakery|dessert|dining|food|bar|seafood|sushi/.test(haystack) || location.restaurant_name) return "restaurant";
  if (location.activity_name) return "activity";
  return "attraction";
}

export function inferRadiusPolicyFromLocation(location: any, anchorType = inferAnchorTypeFromLocation(location)): RadiusPolicy {
  const market = String(location.market || "").toUpperCase();
  if (anchorType === "beach") return { defaultRadiusMiles: 4, maxRadiusMiles: 10, radiusStrategy: "beach" };
  if (market.includes("LONG_ISLAND")) return { defaultRadiusMiles: 3, maxRadiusMiles: 8, radiusStrategy: "long_island" };
  if (anchorType === "mall") return { defaultRadiusMiles: 2.5, maxRadiusMiles: 6, radiusStrategy: "mall" };
  if (anchorType === "stadium" || anchorType === "arena") return { defaultRadiusMiles: 2, maxRadiusMiles: 5, radiusStrategy: "stadium" };
  if (anchorType === "park") return { defaultRadiusMiles: 2, maxRadiusMiles: 5, radiusStrategy: "large_park" };
  if (anchorType === "transit_hub") return { defaultRadiusMiles: 1, maxRadiusMiles: 2, radiusStrategy: "transit" };
  return { defaultRadiusMiles: 1.5, maxRadiusMiles: 3, radiusStrategy: "dense_urban" };
}
