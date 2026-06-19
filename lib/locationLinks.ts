export type TheOutHavenLocationType =
  | "restaurant"
  | "restaurants"
  | "activity"
  | "activities"
  | "bar"
  | "bars"
  | "lounge"
  | "lounges"
  | "venue"
  | "venues";

type LocationTypeFields = {
  type?: string | null;
  source_table?: string | null;
  sourceTable?: string | null;
  location_type?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  name?: string | null;
  category?: string | null;
  primary_category?: string | null;
  cuisine?: string | null;
  cuisine_type?: string | null;
  activity_type?: string | null;
  tags?: string[] | string | null;
  vibes?: string[] | string | null;
  atmosphere?: string[] | string | null;
  best_for?: string[] | string | null;
  date_style_tags?: string[] | string | null;
  search_keywords?: string[] | string | null;
  search_document?: string | null;
};

export type PublicLocationLinkFields = LocationTypeFields & {
  id?: string | number | null;
  location_id?: string | number | null;
};

export function normalizeLocationType(
  type?: string | null,
  options?: {
    sourceTable?: string | null;
    location?: LocationTypeFields | null;
  },
) {
  const cleanType = String(type || "").toLowerCase().trim();
  const sourceTable = String(
    options?.sourceTable ||
      options?.location?.source_table ||
      options?.location?.sourceTable ||
      "",
  )
    .toLowerCase()
    .trim();
  const location = options?.location;

  if (cleanType === "restaurant" || cleanType === "restaurants") {
    return "restaurants";
  }

  if (cleanType === "activity" || cleanType === "activities") {
    return "activities";
  }

  if (cleanType === "bar" || cleanType === "bars") {
    return "bars";
  }

  if (cleanType === "lounge" || cleanType === "lounges") {
    return "lounges";
  }

  if (cleanType === "venue" || cleanType === "venues") {
    return "venues";
  }

  if (sourceTable === "restaurants" || sourceTable === "restaurant") {
    return "restaurants";
  }

  if (sourceTable === "activities" || sourceTable === "activity") {
    return "activities";
  }

  if (sourceTable === "bars" || sourceTable === "bar") {
    return "bars";
  }

  if (sourceTable === "lounges" || sourceTable === "lounge") {
    return "lounges";
  }

  if (sourceTable === "venues" || sourceTable === "venue") {
    return "venues";
  }

  if (location && appearsRestaurantLike(location)) {
    return "restaurants";
  }

  if (location && appearsActivityLike(location)) {
    return "activities";
  }

  return "activities";
}

export function getLocationDetailHref({
  id,
  type,
  sourceTable,
  location,
}: {
  id?: string | number | null;
  type?: string | null;
  sourceTable?: string | null;
  location?: LocationTypeFields | null;
}) {
  if (!id) return "/create";

  const normalizedType = normalizeLocationType(type, { sourceTable, location });

  return `/locations/${normalizedType}/${id}`;
}

export function getPublicLocationHref(location?: PublicLocationLinkFields | null) {
  const id = location?.id ?? location?.location_id;

  if (id == null || String(id).trim() === "") return null;

  return getLocationDetailHref({
    id,
    type: location?.location_type ?? location?.type,
    sourceTable: location?.source_table ?? location?.sourceTable,
    location,
  });
}

function appearsRestaurantLike(location: LocationTypeFields) {
  const text = searchableTypeText(location);

  return (
    Boolean(location.restaurant_name) ||
    text.includes("restaurant") ||
    text.includes("dinner") ||
    text.includes("food") ||
    text.includes("cuisine") ||
    text.includes("brunch") ||
    text.includes("steak") ||
    text.includes("seafood") ||
    text.includes("cafe") ||
    text.includes("bakery")
  );
}

function appearsActivityLike(location: LocationTypeFields) {
  const text = searchableTypeText(location);

  return (
    Boolean(location.activity_name) ||
    text.includes("activity") ||
    text.includes("bowling") ||
    text.includes("arcade") ||
    text.includes("museum") ||
    text.includes("comedy") ||
    text.includes("escape room") ||
    text.includes("sip and paint") ||
    text.includes("karaoke")
  );
}

function searchableTypeText(location: LocationTypeFields) {
  return [
    location.type,
    location.source_table,
    location.sourceTable,
    location.location_type,
    location.name,
    location.restaurant_name,
    location.activity_name,
    location.category,
    location.primary_category,
    location.cuisine,
    location.cuisine_type,
    location.activity_type,
    location.search_document,
    ...toList(location.tags),
    ...toList(location.vibes),
    ...toList(location.atmosphere),
    ...toList(location.best_for),
    ...toList(location.date_style_tags),
    ...toList(location.search_keywords),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function toList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [String(value)];
}
