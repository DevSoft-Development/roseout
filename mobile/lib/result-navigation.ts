import type { MobileOutingResult, MobilePlaceResult } from "@/lib/search-results";

export function placeRouteParams(place: MobilePlaceResult) {
  return {
    pathname: "/location/[id]" as const,
    params: {
      id: place.id,
      name: place.name,
      kind: place.kind,
      category: place.category,
      rating: place.rating == null ? "" : String(place.rating),
      priceLevel: place.priceLevel || "",
      distanceMiles: place.distanceMiles == null ? "" : String(place.distanceMiles),
      publicUrl: place.publicUrl || "",
      reservationUrl: place.reservationUrl || "",
      websiteUrl: place.websiteUrl || "",
      phone: place.phone || "",
      address: place.address || "",
      latitude: place.latitude == null ? "" : String(place.latitude),
      longitude: place.longitude == null ? "" : String(place.longitude),
    },
  };
}

export function outingRouteParams(outing: MobileOutingResult) {
  return {
    pathname: "/outing/[id]" as const,
    params: {
      id: outing.id,
      restaurant: outing.restaurant ? JSON.stringify(outing.restaurant) : "",
      activity: outing.activity ? JSON.stringify(outing.activity) : "",
      distanceMiles: outing.distanceMiles == null ? "" : String(outing.distanceMiles),
      walkMinutes: outing.walkMinutes == null ? "" : String(outing.walkMinutes),
      reason: outing.reason || "",
    },
  };
}
