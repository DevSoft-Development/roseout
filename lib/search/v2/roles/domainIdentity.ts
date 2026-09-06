import type { EnterpriseLocation } from "../../enterprise/types";

const text = (value: unknown) => String(value ?? "").trim().toLowerCase();

export function hasStrongRestaurantIdentity(location: EnterpriseLocation) {
  const storageType = text(location.location_type);
  const category = text(location.primary_category);
  const activityType = text(location.activity_type);
  const restaurantName = text(location.restaurant_name);
  const cuisine = text(location.cuisine || location.cuisine_type);
  const activityStored = storageType === "activity" || storageType === "nightlife" || Boolean(activityType);
  const restaurantCategory = /\b(restaurant|dining|steakhouse|bistro|taqueria|pizzeria|brasserie|bakery|cafe|café|bar and grill|gastropub)\b/.test(category);

  if (restaurantName || storageType === "restaurant" || restaurantCategory) return true;
  if (activityStored && cuisine) return false;
  return Boolean(cuisine && !activityStored);
}

export function hasNightlifeIdentity(location: EnterpriseLocation) {
  const storageType = text(location.location_type);
  const combined = [
    text(location.primary_category),
    text(location.activity_type),
    text(location.activity_name),
    text((location as any).category),
    text((location as any).nightlife_category),
    text((location as any).nightlife_type),
  ].join(" ");
  return storageType === "nightlife" || /\b(nightlife|nightclub|dance club|club|bar|lounge|hookah|shisha|cigar lounge|rooftop bar|sports bar|cocktail|pub|tavern|wine bar|speakeasy)\b/.test(combined);
}

export function hasStrongActivityIdentity(location: EnterpriseLocation) {
  if (hasNightlifeIdentity(location)) return false;
  const storageType = text(location.location_type);
  const category = text(location.primary_category);
  const activityType = text(location.activity_type);
  const activityName = text(location.activity_name);
  return Boolean(
    activityName ||
      activityType ||
      storageType === "activity" ||
      /\b(activity|experience|entertainment|arcade|bowling|museum|gallery|karaoke|theater|theatre|comedy|mini golf|live music venue|concert hall|spa|park|escape room|axe throwing|pottery|workshop|zoo|aquarium|golf|skating|climbing|go kart|raceway|immersive)\b/.test(category),
  );
}

export function isGenericActivityEligible(location: EnterpriseLocation) {
  const storageType = text(location.location_type);
  const category = text(location.primary_category);
  const activityType = text(location.activity_type);
  const combined = [category, activityType, text(location.activity_name), text((location as any).category)].join(" ");
  const diningFirst = storageType === "restaurant" || hasStrongRestaurantIdentity(location);
  const nightlifeFirst = hasNightlifeIdentity(location);
  const trueActivity = storageType === "activity" || /\b(arcade|bowling|museum|gallery|karaoke|theater|theatre|comedy|mini golf|escape room|escape game|axe throwing|pottery|art class|workshop|spa|park|zoo|aquarium|golf|skating|roller rink|trampoline|climbing|go kart|raceway|immersive|activity|experience|entertainment)\b/.test(combined);
  return trueActivity && !diningFirst && !nightlifeFirst;
}

export function isFamilyUnsafeActivity(location: EnterpriseLocation) {
  const value = JSON.stringify(location).toLowerCase();
  return /\b(21\+|adult[- ]only|nightclub|strip club|hookah|cigar lounge)\b/.test(value);
}

export function isCanonicalEventInventory(location: EnterpriseLocation | Record<string, unknown>) {
  return (
    text((location as any).inventory_type) === "event" ||
    text((location as any).location_type) === "event" ||
    String((location as any).id ?? "").startsWith("event:")
  );
}

export function isEventDependentVenue(location: EnterpriseLocation | Record<string, unknown>) {
  if (isCanonicalEventInventory(location)) return false;

  const eventVenuePattern = /\b(stadium|arena|ballpark|amphitheater|amphitheatre|convention center|convention centre|expo center|expo centre|exhibition center|exhibition centre|concert hall)\b/i;
  const categoryValue = [
    (location as any).primary_category,
    (location as any).activity_type,
    (location as any).category,
    (location as any).categories,
    (location as any).activity_categories,
    (location as any).google_types,
    (location as any).types,
  ]
    .flatMap((item) => (Array.isArray(item) ? item : [item]))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (eventVenuePattern.test(categoryValue)) return true;

  const storageType = text((location as any).location_type);
  const hasActivityIdentity =
    storageType === "activity" ||
    storageType === "nightlife" ||
    Boolean(text((location as any).activity_name)) ||
    Boolean(text((location as any).activity_type));
  if (!hasActivityIdentity) return false;

  const nameValue = [
    (location as any).name,
    (location as any).activity_name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return eventVenuePattern.test(nameValue);
}
