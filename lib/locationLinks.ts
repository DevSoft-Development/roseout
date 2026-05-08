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

export function normalizeLocationType(type?: string | null) {
  const cleanType = String(type || "").toLowerCase().trim();

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

  return "locations";
}

export function getLocationDetailHref({
  id,
  type,
}: {
  id?: string | number | null;
  type?: string | null;
}) {
  if (!id) return "/create";

  const normalizedType = normalizeLocationType(type);

  if (normalizedType === "locations") {
    return `/locations/${id}`;
  }

  return `/locations/${normalizedType}/${id}`;
}