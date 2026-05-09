import { createClient } from "@supabase/supabase-js";

type LocationSeoData = {
  name: string;
  type: string;
  city?: string | null;
  state?: string | null;
  cuisine?: string | null;
  category?: string | null;
  description?: string | null;
  image?: string | null;
};

type LocationRecord = {
  name?: string | null;
  restaurant_name?: string | null;
  title?: string | null;
  location_type?: string | null;
  cuisine?: string | null;
  category?: string | null;
  city?: string | null;
  state?: string | null;
  description?: string | null;
  summary?: string | null;
  image_url?: string | null;
  photo_url?: string | null;
};

function serverSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      persistSession: false,
    },
  });
}

function normalizeType(type: string) {
  if (type === "restaurants" || type === "restaurant") return "restaurant";
  if (type === "activities" || type === "activity") return "activity";
  return type;
}

function toSeoData(
  record: LocationRecord | null,
  type: string,
): LocationSeoData | null {
  if (!record) return null;

  const name = record.name || record.restaurant_name || record.title;
  if (!name) return null;

  return {
    name,
    type: normalizeType(record.location_type || type),
    city: record.city,
    state: record.state,
    cuisine: record.cuisine,
    category: record.category,
    description: record.description || record.summary,
    image: record.image_url || record.photo_url,
  };
}

export async function getLocationSeoData(type: string, id: string) {
  const supabase = serverSupabase();
  if (!supabase || !id) return null;

  const { data: location } = await supabase
    .from("locations")
    .select(
      "name,restaurant_name,title,location_type,cuisine,category,city,state,description,summary,image_url,photo_url",
    )
    .eq("id", id)
    .maybeSingle<LocationRecord>();

  if (location) return toSeoData(location, type);

  if (type === "restaurants" || type === "restaurant") {
    const { data: restaurant } = await supabase
      .from("restaurants")
      .select(
        "name,restaurant_name,title,cuisine,category,city,state,description,summary,image_url,photo_url",
      )
      .eq("id", id)
      .maybeSingle<LocationRecord>();

    return toSeoData(restaurant, "restaurant");
  }

  if (type === "activities" || type === "activity") {
    const { data: activity } = await supabase
      .from("activities")
      .select(
        "name,restaurant_name,title,cuisine,category,city,state,description,summary,image_url,photo_url",
      )
      .eq("id", id)
      .maybeSingle<LocationRecord>();

    return toSeoData(activity, "activity");
  }

  return null;
}

export function buildLocationTitle(location: LocationSeoData) {
  const locality = [location.city, location.state].filter(Boolean).join(", ");
  return locality ? `${location.name} in ${locality}` : location.name;
}

export function buildLocationDescription(location: LocationSeoData) {
  if (location.description) return location.description;

  const category = location.cuisine || location.category || location.type;
  const locality = [location.city, location.state].filter(Boolean).join(", ");
  const place = locality ? ` in ${locality}` : "";

  return `Explore ${location.name}${place} on TheOutHaven, including ${category} details, reviews, scores, and outing recommendations.`;
}
