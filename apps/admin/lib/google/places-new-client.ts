import {
  fetchGooglePlacePhotoViaIntegrationApi,
  getGooglePlaceDetailsViaIntegrationApi,
  getGooglePlacePhotosViaIntegrationApi,
  platformIntegrationApiConfigured,
  searchGooglePlacesTextViaIntegrationApi,
} from "@/lib/aws/integration-api";
import {
  enforceGoogleOperation,
  googleSearchCacheKey,
  readIdSearchCache,
  recordGoogleOperation,
  writeIdSearchCache,
  type GoogleCostPriority,
} from "@/lib/google/google-places-cost-control";

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
  primaryType?: string;
  types?: string[];
  photos?: PlacesNewPhoto[];
  addressComponents?: PlacesNewAddressComponent[];
  currentOpeningHours?: Record<string, unknown>;
  regularOpeningHours?: Record<string, unknown>;
  regularSecondaryOpeningHours?: Array<Record<string, unknown>>;
  utcOffsetMinutes?: number;
  priceLevel?: string;
  priceRange?: Record<string, unknown>;
  editorialSummary?: { text?: string; languageCode?: string };
  reservable?: boolean;
  outdoorSeating?: boolean;
  liveMusic?: boolean;
  goodForGroups?: boolean;
  goodForWatchingSports?: boolean;
  servesCocktails?: boolean;
  servesBeer?: boolean;
  servesWine?: boolean;
  servesBreakfast?: boolean;
  servesBrunch?: boolean;
  servesLunch?: boolean;
  servesDinner?: boolean;
  servesVegetarianFood?: boolean;
  servesDessert?: boolean;
  servesCoffee?: boolean;
  dineIn?: boolean;
  takeout?: boolean;
  delivery?: boolean;
  curbsidePickup?: boolean;
  allowsDogs?: boolean;
  restroom?: boolean;
  parkingOptions?: Record<string, unknown>;
  accessibilityOptions?: Record<string, unknown>;
  paymentOptions?: Record<string, unknown>;
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
  primaryType?: string;
  types?: string[];
  photos?: Array<{ photo_reference?: string; name?: string; authorAttributions?: unknown[] }>;
  geometry?: { location?: { lat?: number; lng?: number } };
  address_components?: Array<{ long_name?: string; short_name?: string; types?: string[] }>;
  opening_hours?: Record<string, unknown>;
  current_opening_hours?: Record<string, unknown>;
  regularOpeningHours?: Record<string, unknown>;
  regularSecondaryOpeningHours?: Array<Record<string, unknown>>;
  business_hours?: Record<string, unknown>;
  hours?: Record<string, unknown>;
  weekday_text?: unknown;
  utcOffsetMinutes?: number;
  price_level?: number;
  priceRange?: Record<string, unknown>;
  editorial_summary?: { overview?: string };
  reservable?: boolean;
  outdoorSeating?: boolean;
  liveMusic?: boolean;
  goodForGroups?: boolean;
  goodForWatchingSports?: boolean;
  servesCocktails?: boolean;
  servesBeer?: boolean;
  servesWine?: boolean;
  servesBreakfast?: boolean;
  servesBrunch?: boolean;
  servesLunch?: boolean;
  servesDinner?: boolean;
  servesVegetarianFood?: boolean;
  servesDessert?: boolean;
  servesCoffee?: boolean;
  dineIn?: boolean;
  takeout?: boolean;
  delivery?: boolean;
  curbsidePickup?: boolean;
  allowsDogs?: boolean;
  restroom?: boolean;
  parkingOptions?: Record<string, unknown>;
  accessibilityOptions?: Record<string, unknown>;
  paymentOptions?: Record<string, unknown>;
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function requireIntegrationApi() {
  if (!platformIntegrationApiConfigured()) {
    throw new Error("AWS Integration API is required for Google Places.");
  }
}

function rethrowPlaceDetailsError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (/Place ID is no longer valid/i.test(message) || /\bNOT_FOUND\b/i.test(message)) {
    throw new Error(`Google Place Details failed: 404 ${message}`);
  }
  throw error;
}

export type GooglePlacesRequestOptions = {
  jobKey?: string;
  priority?: GoogleCostPriority;
};

export async function searchPlacesTextNew(
  textQuery: string,
  options: GooglePlacesRequestOptions & {
    pageSize?: number;
    regionCode?: string;
    fieldMode?: "ids-only" | "rich";
    cacheTtlDays?: number;
    bypassIdCache?: boolean;
  } = {},
): Promise<PlacesNewPlace[]> {
  const query = clean(textQuery);
  if (!query) return [];
  const regionCode = clean(options.regionCode || "US").toUpperCase();
  const fieldMode = options.fieldMode || "rich";
  const operation = fieldMode === "ids-only" ? "text_search_ids_only" : "text_search_rich";
  const queryKey = googleSearchCacheKey(query, regionCode);
  const context = {
    jobKey: options.jobKey || "unknown",
    priority: options.priority,
    queryKey,
    metadata: { fieldMode, pageSize: options.pageSize || null, regionCode },
  };

  if (fieldMode === "ids-only" && options.bypassIdCache !== true) {
    const cached = await readIdSearchCache(query, regionCode);
    if (cached.placeIds) {
      await recordGoogleOperation(operation, context, { cacheHit: true, reason: "id_search_cache_hit" });
      return cached.placeIds.map((id) => ({ id }));
    }
  }

  await enforceGoogleOperation(operation, context);
  requireIntegrationApi();
  const places = await searchGooglePlacesTextViaIntegrationApi<PlacesNewPlace>(query, {
    pageSize: options.pageSize,
    regionCode,
    fieldMode,
  });
  await recordGoogleOperation(operation, context, { reason: "provider_call" });

  if (fieldMode === "ids-only") {
    await writeIdSearchCache(
      query,
      regionCode,
      places.map((place) => clean(place.id)).filter(Boolean),
      options.cacheTtlDays ?? 14,
      { jobKey: context.jobKey },
    );
  }
  return places;
}

export async function getPlaceDetailsNew(
  placeId: string,
  options: GooglePlacesRequestOptions & { fieldMode?: "address" | "rich"; sessionToken?: string } = {},
) {
  const id = clean(placeId);
  if (!id) throw new Error("Missing Google Place ID.");
  const fieldMode = options.fieldMode || "rich";
  const operation = fieldMode === "address" ? "place_details_address" : "place_details_rich";
  const context = { jobKey: options.jobKey || "unknown", priority: options.priority, placeId: id, metadata: { fieldMode } };
  await enforceGoogleOperation(operation, context);
  requireIntegrationApi();
  try {
    const result = await getGooglePlaceDetailsViaIntegrationApi<PlacesNewPlace>(id, { sessionToken: options.sessionToken, fieldMode });
    await recordGoogleOperation(operation, context, { reason: "provider_call" });
    return result;
  } catch (error) {
    rethrowPlaceDetailsError(error);
  }
}

export async function getPlacePhotosNew(placeId: string, options: GooglePlacesRequestOptions = {}) {
  const id = clean(placeId);
  if (!id) throw new Error("Missing Google Place ID.");
  const context = { jobKey: options.jobKey || "unknown", priority: options.priority, placeId: id };
  await enforceGoogleOperation("photo_metadata", context);
  requireIntegrationApi();
  const photos = await getGooglePlacePhotosViaIntegrationApi<PlacesNewPhoto>(id);
  await recordGoogleOperation("photo_metadata", context, { reason: "provider_call" });
  return photos;
}

export async function getPlacePhotoMetadataNew(placeId: string) {
  const photos = await getPlacePhotosNew(placeId);
  const photo = photos[0];
  const photoName = clean(photo?.name);
  if (!photoName) throw new Error("Google Place Details (New) returned no photo resource name.");
  return {
    name: photoName,
    authorAttributions: Array.isArray(photo?.authorAttributions) ? photo.authorAttributions : [],
  };
}

export async function getPlacePhotoNameNew(placeId: string) {
  return (await getPlacePhotoMetadataNew(placeId)).name;
}

export async function fetchPlacePhotoNew(
  photoName: string,
  options: GooglePlacesRequestOptions & { maxWidthPx?: number; cache?: RequestCache; revalidateSeconds?: number } = {},
) {
  const name = clean(photoName).replace(/^\/+/, "");
  if (!name || !name.startsWith("places/") || !name.includes("/photos/")) {
    throw new Error("Invalid Google Places photo resource name.");
  }
  const maxWidthPx = Math.max(1, Math.min(4800, Math.floor(options.maxWidthPx || 1200)));
  const placeId = name.split("/")[1] || null;
  const context = {
    jobKey: options.jobKey || "public-google-place-photo",
    priority: (options.priority || "high") as GoogleCostPriority,
    placeId,
    metadata: { maxWidthPx },
  };
  await enforceGoogleOperation("photo_media", context);
  requireIntegrationApi();
  const response = await fetchGooglePlacePhotoViaIntegrationApi(name, maxWidthPx);
  await recordGoogleOperation("photo_media", context, { reason: "provider_call" });
  return response;
}

function priceLevelNumber(value?: string) {
  switch (value) {
    case "PRICE_LEVEL_FREE": return 0;
    case "PRICE_LEVEL_INEXPENSIVE": return 1;
    case "PRICE_LEVEL_MODERATE": return 2;
    case "PRICE_LEVEL_EXPENSIVE": return 3;
    case "PRICE_LEVEL_VERY_EXPENSIVE": return 4;
    default: return undefined;
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
    primaryType: place.primaryType,
    types: place.types || [],
    photos: (place.photos || []).map((photo) => ({ photo_reference: photo.name, name: photo.name, authorAttributions: photo.authorAttributions || [] })),
    geometry: { location: { lat: place.location?.latitude, lng: place.location?.longitude } },
    address_components: (place.addressComponents || []).map((component) => ({ long_name: component.longText, short_name: component.shortText, types: component.types || [] })),
    opening_hours: regularHours ? { ...regularHours, ...(weekdayDescriptions ? { weekday_text: weekdayDescriptions } : {}) } : currentHours,
    current_opening_hours: currentHours,
    regularOpeningHours: regularHours,
    regularSecondaryOpeningHours: place.regularSecondaryOpeningHours,
    business_hours: regularHours,
    hours: regularHours,
    weekday_text: weekdayDescriptions,
    utcOffsetMinutes: place.utcOffsetMinutes,
    price_level: priceLevelNumber(place.priceLevel),
    priceRange: place.priceRange,
    editorial_summary: place.editorialSummary?.text ? { overview: place.editorialSummary.text } : undefined,
    reservable: place.reservable,
    outdoorSeating: place.outdoorSeating,
    liveMusic: place.liveMusic,
    goodForGroups: place.goodForGroups,
    goodForWatchingSports: place.goodForWatchingSports,
    servesCocktails: place.servesCocktails,
    servesBeer: place.servesBeer,
    servesWine: place.servesWine,
    servesBreakfast: place.servesBreakfast,
    servesBrunch: place.servesBrunch,
    servesLunch: place.servesLunch,
    servesDinner: place.servesDinner,
    servesVegetarianFood: place.servesVegetarianFood,
    servesDessert: place.servesDessert,
    servesCoffee: place.servesCoffee,
    dineIn: place.dineIn,
    takeout: place.takeout,
    delivery: place.delivery,
    curbsidePickup: place.curbsidePickup,
    allowsDogs: place.allowsDogs,
    restroom: place.restroom,
    parkingOptions: place.parkingOptions,
    accessibilityOptions: place.accessibilityOptions,
    paymentOptions: place.paymentOptions,
  };
}

export async function searchPlacesTextLegacyCompat(textQuery: string, options: Parameters<typeof searchPlacesTextNew>[1] = {}) {
  return (await searchPlacesTextNew(textQuery, options)).map(toLegacyGooglePlace);
}

export async function getPlaceDetailsLegacyCompat(placeId: string, options: Parameters<typeof getPlaceDetailsNew>[1] = {}) {
  return toLegacyGooglePlace(await getPlaceDetailsNew(placeId, options));
}

export function publicGooglePlacePhotoUrl(placeId: string, maxwidth = 1200) {
  const id = clean(placeId);
  if (!id) return null;
  const width = Math.max(1, Math.min(4800, Math.floor(Number(maxwidth) || 1200)));
  return `/api/public/google-place-photo?placeId=${encodeURIComponent(id)}&maxwidth=${width}`;
}
