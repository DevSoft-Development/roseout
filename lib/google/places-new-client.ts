export type PlacesNewPhoto = {
  name?: string;
  widthPx?: number;
  heightPx?: number;
  authorAttributions?: unknown[];
};

export type PlacesNewAddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
  languageCode?: string;
};

export type PlacesNewPlace = {
  id?: string;
  displayName?: { text?: string; languageCode?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  types?: string[];
  photos?: PlacesNewPhoto[];
  addressComponents?: PlacesNewAddressComponent[];
  currentOpeningHours?: Record<string, unknown>;
  regularOpeningHours?: Record<string, unknown>;
  priceLevel?: string;
  editorialSummary?: { text?: string; languageCode?: string };
};

export type GooglePlaceLegacyCompat = {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  vicinity?: string;
  formatted_phone_number?: string;
  international_phone_number?: string;
  website?: string;
  url?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  rating?: number;
  user_ratings_total?: number;
  review_count?: number;
  business_status?: string;
  types?: string[];
  photos?: Array<{ photo_reference?: string; name?: string }>;
  geometry?: { location?: { lat?: number; lng?: number } };
  address_components?: Array<{
    long_name?: string;
    short_name?: string;
    types?: string[];
  }>;
  opening_hours?: Record<string, unknown>;
  current_opening_hours?: Record<string, unknown>;
  regularOpeningHours?: Record<string, unknown>;
  business_hours?: Record<string, unknown>;
  hours?: Record<string, unknown>;
  weekday_text?: unknown;
  price_level?: number;
  editorial_summary?: { overview?: string };
};

const TEXT_SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
  "places.types",
  "places.photos",
].join(",");

const DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "websiteUri",
  "googleMapsUri",
  "rating",
  "userRatingCount",
  "businessStatus",
  "types",
  "photos",
  "addressComponents",
  "currentOpeningHours",
  "regularOpeningHours",
  "priceLevel",
  "editorialSummary",
].join(",");

const PHOTO_FIELD_MASK = "photos";

function clean(value: unknown) {
  return String(value || "").trim();
}

export function getGooglePlacesServerKey() {
  const key = clean(process.env.GOOGLE_PLACES_API_KEY);
  if (!key) {
    throw new Error("Missing GOOGLE_PLACES_API_KEY.");
  }
  return key;
}

async function googleJson<T>(response: Response, label: string): Promise<T> {
  const data = (await response.json().catch(() => null)) as
    | (T & { error?: { message?: string } })
    | null;

  if (!response.ok) {
    throw new Error(
      data?.error?.message || `${label} failed with HTTP ${response.status}.`,
    );
  }

  if (!data) {
    throw new Error(`${label} returned an empty response.`);
  }

  return data;
}

export async function searchPlacesTextNew(
  textQuery: string,
  options: { pageSize?: number; regionCode?: string } = {},
) {
  const query = clean(textQuery);
  if (!query) return [] as PlacesNewPlace[];

  const pageSize = Math.max(1, Math.min(20, Math.floor(options.pageSize || 20)));
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": getGooglePlacesServerKey(),
      "X-Goog-FieldMask": TEXT_SEARCH_FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery: query,
      pageSize,
      regionCode: options.regionCode || "US",
    }),
    cache: "no-store",
  });

  const data = await googleJson<{ places?: PlacesNewPlace[] }>(
    response,
    "Google Places Text Search (New)",
  );
  return data.places || [];
}

export async function getPlaceDetailsNew(placeId: string) {
  const id = clean(placeId);
  if (!id) throw new Error("Missing Google Place ID.");

  const response = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`,
    {
      headers: {
        "X-Goog-Api-Key": getGooglePlacesServerKey(),
        "X-Goog-FieldMask": DETAILS_FIELD_MASK,
      },
      cache: "no-store",
    },
  );

  return googleJson<PlacesNewPlace>(response, "Google Place Details (New)");
}

export async function getPlacePhotoNameNew(placeId: string) {
  const id = clean(placeId);
  if (!id) throw new Error("Missing Google Place ID.");

  const response = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`,
    {
      headers: {
        "X-Goog-Api-Key": getGooglePlacesServerKey(),
        "X-Goog-FieldMask": PHOTO_FIELD_MASK,
      },
      cache: "no-store",
    },
  );

  const place = await googleJson<PlacesNewPlace>(
    response,
    "Google Place Details photos (New)",
  );
  const photoName = clean(place.photos?.[0]?.name);
  if (!photoName) {
    throw new Error("Google Place Details (New) returned no photo resource name.");
  }
  return photoName;
}

export async function fetchPlacePhotoNew(
  photoName: string,
  options: { maxWidthPx?: number; cache?: RequestCache; revalidateSeconds?: number } = {},
) {
  const name = clean(photoName).replace(/^\/+/, "");
  if (!name || !name.startsWith("places/") || !name.includes("/photos/")) {
    throw new Error("Invalid Google Places photo resource name.");
  }

  const maxWidthPx = Math.max(
    1,
    Math.min(4800, Math.floor(options.maxWidthPx || 1200)),
  );
  const url = new URL(`https://places.googleapis.com/v1/${name}/media`);
  url.searchParams.set("maxWidthPx", String(maxWidthPx));

  const next = options.revalidateSeconds
    ? { revalidate: options.revalidateSeconds }
    : undefined;

  return fetch(url.toString(), {
    redirect: "follow",
    headers: {
      "X-Goog-Api-Key": getGooglePlacesServerKey(),
      "User-Agent": "TheOutHaven/1.0",
      Accept: "image/jpeg,image/webp,image/png;q=0.9,image/gif;q=0.8",
    },
    cache: options.cache || "no-store",
    ...(next ? { next } : {}),
  } as RequestInit & { next?: { revalidate: number } });
}

function priceLevelNumber(value?: string) {
  switch (value) {
    case "PRICE_LEVEL_FREE":
      return 0;
    case "PRICE_LEVEL_INEXPENSIVE":
      return 1;
    case "PRICE_LEVEL_MODERATE":
      return 2;
    case "PRICE_LEVEL_EXPENSIVE":
      return 3;
    case "PRICE_LEVEL_VERY_EXPENSIVE":
      return 4;
    default:
      return undefined;
  }
}

export function toLegacyGooglePlace(place: PlacesNewPlace): GooglePlaceLegacyCompat {
  const regularHours = place.regularOpeningHours || undefined;
  const currentHours = place.currentOpeningHours || undefined;
  const weekdayDescriptions =
    (regularHours?.weekdayDescriptions as unknown) ||
    (currentHours?.weekdayDescriptions as unknown);

  return {
    place_id: place.id,
    name: place.displayName?.text,
    formatted_address: place.formattedAddress,
    vicinity: place.formattedAddress,
    formatted_phone_number: place.nationalPhoneNumber,
    international_phone_number: place.internationalPhoneNumber,
    website: place.websiteUri,
    websiteUri: place.websiteUri,
    url: place.googleMapsUri,
    googleMapsUri: place.googleMapsUri,
    rating: place.rating,
    user_ratings_total: place.userRatingCount,
    review_count: place.userRatingCount,
    business_status: place.businessStatus,
    types: place.types || [],
    photos: (place.photos || []).map((photo) => ({
      // Keep the legacy property name so older import code can carry the
      // resource through without exposing an API key in a public URL.
      photo_reference: photo.name,
      name: photo.name,
    })),
    geometry: {
      location: {
        lat: place.location?.latitude,
        lng: place.location?.longitude,
      },
    },
    address_components: (place.addressComponents || []).map((component) => ({
      long_name: component.longText,
      short_name: component.shortText,
      types: component.types || [],
    })),
    opening_hours: regularHours
      ? {
          ...regularHours,
          ...(weekdayDescriptions ? { weekday_text: weekdayDescriptions } : {}),
        }
      : currentHours,
    current_opening_hours: currentHours,
    regularOpeningHours: regularHours,
    business_hours: regularHours,
    hours: regularHours,
    weekday_text: weekdayDescriptions,
    price_level: priceLevelNumber(place.priceLevel),
    editorial_summary: place.editorialSummary?.text
      ? { overview: place.editorialSummary.text }
      : undefined,
  };
}

export async function searchPlacesTextLegacyCompat(textQuery: string) {
  return (await searchPlacesTextNew(textQuery)).map(toLegacyGooglePlace);
}

export async function getPlaceDetailsLegacyCompat(placeId: string) {
  return toLegacyGooglePlace(await getPlaceDetailsNew(placeId));
}

export function publicGooglePlacePhotoUrl(placeId: string, maxwidth = 1200) {
  const id = clean(placeId);
  if (!id) return null;
  const width = Math.max(1, Math.min(4800, Math.floor(Number(maxwidth) || 1200)));
  return `/api/public/google-place-photo?placeId=${encodeURIComponent(id)}&maxwidth=${width}`;
}
