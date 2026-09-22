import type { MobileOutingResult, MobilePlaceResult } from "@/lib/search-results";

const INTERNAL_REASON = /qualified\s+as|general[_\s-]?activity|nearby options? outside|outside the requested|fallback|candidate pool|search radius|classification|domain qualification|geo relaxation|eligibility|ranking|score|parser|taxonomy|intent|provider|source table|requested locality|matched requested|search v2|retrieval|candidate|domain|filter|confidence|weight|boost|penalty|neutralized|verified dinner evidence|deterministic ranking|query-driven ranking adjustment|canonical profile evidence|distance unavailable/i;

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

function ratingCopy(place: MobilePlaceResult) {
  if (place.rating == null) return null;
  const reviews = Number(place.reviewCount ?? 0);
  if (place.rating >= 4.6 && reviews >= 500) {
    return `Highly rated at ${place.rating.toFixed(1)} with ${Math.round(reviews).toLocaleString()} reviews.`;
  }
  if (place.rating >= 4.4 && reviews >= 100) {
    return `Well rated at ${place.rating.toFixed(1)} with strong guest feedback.`;
  }
  return null;
}

function categoryCopy(place: MobilePlaceResult) {
  const category = place.category?.trim().toLowerCase();
  if (!category) return null;
  if (place.kind === "restaurant") {
    if (/steak/.test(category)) return "A steakhouse that fits a full dinner out.";
    if (/sushi|japanese/.test(category)) return "A strong sushi/Japanese dinner option for the outing you described.";
    if (/italian/.test(category)) return "An Italian dinner option that fits the meal you asked for.";
    if (/seafood/.test(category)) return "A seafood-focused dinner pick that matches your plan.";
    return `A ${category} restaurant that fits the meal you asked for.`;
  }
  if (/nightlife|bar|lounge/.test(category)) return "A lively after-dinner option for keeping the night going.";
  if (/comedy/.test(category)) return "A comedy option that adds an easy second stop to the night.";
  if (/bowling/.test(category)) return "A casual, social activity that works well after dinner.";
  if (/museum|gallery/.test(category)) return "A relaxed cultural stop that fits the outing you described.";
  return `A ${category} option that fits the experience you asked for.`;
}

export function customerFacingReasons(place: MobilePlaceResult) {
  const cleaned = [
    ...(Array.isArray(place.matchReasons) ? place.matchReasons : []),
    place.whyMatched,
  ]
    .map(cleanCustomerReason)
    .filter((reason): reason is string => Boolean(reason));

  const unique = [...new Set(cleaned)];
  const category = categoryCopy(place);
  const rating = ratingCopy(place);

  if (category && !unique.includes(category)) unique.push(category);
  if (rating && !unique.includes(rating)) unique.push(rating);

  if (!unique.length) {
    unique.push(
      place.kind === "restaurant"
        ? "A dining option that fits the kind of meal you described."
        : "An activity that fits the kind of outing you described.",
    );
  }
  return unique.slice(0, 3);
}

export function placeCustomerReason(place: MobilePlaceResult) {
  return customerFacingReasons(place)[0] ?? null;
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