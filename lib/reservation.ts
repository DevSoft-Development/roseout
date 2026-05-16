export function getExternalReservationUrl(location: any) {
  return (
    location?.external_reservation_url ||
    location?.reservation_url ||
    location?.reservation_link ||
    null
  );
}

export function getInternalReservationHref(
  location: {
    id?: string | null;
    detail_location_type?: string | null;
    location_type?: string | null;
  },
  fallbackType: "restaurant" | "activity" = "restaurant"
) {
  const rawType =
    location?.detail_location_type || location?.location_type || fallbackType;
  const normalizedType =
    rawType === "activities" || rawType === "activity" ? "activity" : "restaurant";

  return location?.id ? `/reserve/${normalizedType}/${location.id}` : null;
}
