export type LocationNameFields = {
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  business_name?: string | null;
};

export function getLocationName(
  location: LocationNameFields | null | undefined,
  fallback = "Unknown Location"
) {
  return (
    location?.name ||
    location?.restaurant_name ||
    location?.activity_name ||
    location?.business_name ||
    fallback
  );
}
