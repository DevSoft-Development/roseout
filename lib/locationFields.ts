export type LocationCategoryFields = {
  primary_category?: string | null;
  cuisine?: string | null;
  cuisine_type?: string | null;
  food_type?: string | null;
  activity_type?: string | null;
  primary_tag?: string | null;
  tags?: string[] | null;
  google_types?: string[] | null;
};

export function getPrimaryCategory(location: any) {
  return (
    location?.primary_category ||
    location?.cuisine ||
    location?.cuisine_type ||
    location?.food_type ||
    location?.activity_type ||
    location?.primary_tag ||
    "Experience"
  );
}

export function getCuisine(location: any) {
  return location?.cuisine || location?.cuisine_type || location?.food_type || null;
}

export function getLocationTags(location: any) {
  const tags = [
    ...(Array.isArray(location?.tags) ? location.tags : []),
    ...(Array.isArray(location?.google_types) ? location.google_types : []),
    location?.primary_tag,
    location?.primary_category,
    location?.cuisine,
    location?.cuisine_type,
    location?.food_type,
    location?.activity_type,
  ];

  return Array.from(
    new Set(
      tags
        .filter(Boolean)
        .map((tag) => String(tag).trim().toLowerCase())
        .filter(Boolean)
    )
  );
}
