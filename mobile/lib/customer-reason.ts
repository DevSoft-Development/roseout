import type { MobileOutingResult, MobilePlaceResult } from "@/lib/search-results";

const INTERNAL_REASON = /qualified\s+as|general[_\s-]?activity|nearby options? outside|outside the requested|fallback|candidate pool|search radius|classification|domain qualification|geo relaxation|eligibility|ranking|score|parser|taxonomy|intent|provider|source table|requested locality|matched requested|search v2|retrieval|candidate|domain|filter|confidence|weight|boost|penalty/i;

export function cleanCustomerReason(value: unknown) {
  if (typeof value !== "string") return null;
  const pieces = value
    .split(/[;•]|\s+·\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !INTERNAL_REASON.test(part))
    .filter((part) => !/[A-Za-z]+_[A-Za-z]+|\b(?:true|false|null|undefined)\b/i.test(part));

  const reason = pieces[0];
  if (!reason || reason.length < 10 || reason.length > 150) return null;
  return reason.replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function placeCustomerReason(place: MobilePlaceResult) {
  const reason = cleanCustomerReason(place.whyMatched);
  if (reason) return reason;
  const category = place.category?.trim();
  if (category) return `A ${category.toLowerCase()} pick that lines up well with the experience you asked for.`;
  return place.kind === "restaurant"
    ? "A polished dining option that fits the kind of meal you described."
    : "A strong experience for the kind of outing you described.";
}

export function outingCustomerReason(outing: MobileOutingResult) {
  const reason = cleanCustomerReason(outing.reason)
    || (outing.restaurant ? cleanCustomerReason(outing.restaurant.whyMatched) : null)
    || (outing.activity ? cleanCustomerReason(outing.activity.whyMatched) : null);
  if (reason) return reason;

  if (outing.resultType === "same_venue") {
    return "Dinner and the experience are together in one place, keeping the night simple and seamless.";
  }

  const restaurant = outing.restaurant?.name;
  const activity = outing.activity?.name;
  const distance = outing.walkMinutes != null
    ? `${Math.round(outing.walkMinutes)} min walk`
    : outing.distanceMiles != null
      ? `${outing.distanceMiles.toFixed(1)} ${Math.abs(outing.distanceMiles - 1) < 0.05 ? "mile" : "miles"} apart`
      : null;

  if (restaurant && activity && distance) return `${restaurant} and ${activity} make an easy pairing, with just ${distance} between them.`;
  if (restaurant && activity) return `${restaurant} and ${activity} make a smooth dinner-and-activity pairing for the night you described.`;
  return "A strong option for the outing you described.";
}