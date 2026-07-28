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

export function hasStrongActivityIdentity(location: EnterpriseLocation) {
  const storageType = text(location.location_type);
  const category = text(location.primary_category);
  const activityType = text(location.activity_type);
  const activityName = text(location.activity_name);
  return Boolean(
    activityName ||
      activityType ||
      storageType === "activity" ||
      storageType === "nightlife" ||
      /\b(activity|experience|entertainment|arcade|bowling|museum|gallery|karaoke|hookah|sports bar|theater|theatre|comedy|mini golf|live music|music venue|jazz|concert|nightclub|lounge|rooftop|spa|park)\b/.test(category),
  );
}

export function isFamilyUnsafeActivity(location: EnterpriseLocation) {
  const value = JSON.stringify(location).toLowerCase();
  return /\b(21\+|adult[- ]only|nightclub|strip club|hookah|cigar lounge)\b/.test(value);
}
