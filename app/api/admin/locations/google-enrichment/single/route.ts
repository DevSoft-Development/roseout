import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { getPhotoPublishabilityUpdates } from "@/lib/location-growth/repairPhotoPublishability";
import { buildPublishabilityUpdate } from "@/lib/location-publishability";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  primaryType?: string;
  types?: string[];
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
};

const TEXT_MASK = "places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.types,places.rating,places.userRatingCount,places.googleMapsUri,places.websiteUri";
const DETAILS_MASK = "id,displayName,formattedAddress,location,primaryType,types,rating,userRatingCount,googleMapsUri,websiteUri,nationalPhoneNumber";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeName(row: Record<string, any>) {
  return text(row.name || row.restaurant_name || row.activity_name);
}

function buildSearchQuery(row: Record<string, any>) {
  return [normalizeName(row), row.address, row.city, row.state, row.zip_code || row.postal_code]
    .map(text)
    .filter(Boolean)
    .join(", ");
}

function addressSimilarity(localAddress: string, googleAddress: string) {
  const tokens = (value: string) => new Set(value.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((part) => part.length > 2));
  const local = tokens(localAddress);
  const google = tokens(googleAddress);
  if (!local.size || !google.size) return 0;
  const overlap = [...local].filter((token) => google.has(token)).length;
  return overlap / Math.max(local.size, google.size);
}

function chooseBestPlace(row: Record<string, any>, places: GooglePlace[]) {
  const localName = normalizeName(row).toLowerCase();
  const localAddress = [row.address, row.city, row.state].map(text).filter(Boolean).join(" ");
  return places
    .map((place) => {
      const googleName = text(place.displayName?.text).toLowerCase();
      const nameMatch = googleName === localName ? 1 : googleName.includes(localName) || localName.includes(googleName) ? 0.8 : 0;
      const addressMatch = addressSimilarity(localAddress, text(place.formattedAddress));
      return { place, score: nameMatch * 70 + addressMatch * 30 };
    })
    .sort((a, b) => b.score - a.score)[0];
}

async function googleJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `Google Places request failed with ${response.status}.`;
    throw new Error(message);
  }
  return payload;
}

export async function POST(request: Request) {
  const auth = await requireAdminApiRole(["superadmin", "admin", "manager"]);
  if (auth.error) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const locationId = text(body.locationId);
    if (!locationId) return Response.json({ success: false, error: "locationId is required." }, { status: 400 });

    const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) return Response.json({ success: false, error: "GOOGLE_PLACES_API_KEY is not configured." }, { status: 500 });

    const { data: row, error: loadError } = await supabaseAdmin.from("locations").select("*").eq("id", locationId).maybeSingle();
    if (loadError) throw loadError;
    if (!row) return Response.json({ success: false, error: "Location was not found." }, { status: 404 });

    let placeId = text(row.google_place_id);
    let matchedPlace: GooglePlace | null = null;
    let matchConfidence = 100;

    if (!placeId) {
      const query = buildSearchQuery(row);
      if (!query) return Response.json({ success: false, error: "The location needs a name or address before enrichment can run." }, { status: 400 });
      const searchPayload = await googleJson("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": TEXT_MASK },
        body: JSON.stringify({ textQuery: query, maxResultCount: 5 }),
      });
      const best = chooseBestPlace(row, Array.isArray(searchPayload.places) ? searchPayload.places : []);
      if (!best || best.score < 55 || !best.place.id) {
        return Response.json({ success: false, error: "No confident Google Places match was found for this location.", candidates: searchPayload.places || [] }, { status: 422 });
      }
      matchedPlace = best.place;
      placeId = best.place.id;
      matchConfidence = Math.round(best.score);
    }

    const details = await googleJson(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      method: "GET",
      headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": DETAILS_MASK },
    }) as GooglePlace;

    const now = new Date().toISOString();
    const enrichmentUpdate: Record<string, any> = {
      google_place_id: details.id || placeId,
      google_enrichment_status: "completed",
      enrichment_status: "completed",
      google_enriched_at: now,
      last_enriched_at: now,
      google_primary_type: details.primaryType || matchedPlace?.primaryType || null,
      google_types: details.types || matchedPlace?.types || [],
      google_maps_uri: details.googleMapsUri || matchedPlace?.googleMapsUri || null,
      google_website_uri: details.websiteUri || matchedPlace?.websiteUri || null,
      google_rating: details.rating ?? matchedPlace?.rating ?? null,
      google_user_rating_count: details.userRatingCount ?? matchedPlace?.userRatingCount ?? null,
      rating: row.rating || details.rating || matchedPlace?.rating || null,
      review_count: row.review_count || details.userRatingCount || matchedPlace?.userRatingCount || null,
      google_last_error: null,
      updated_at: now,
    };

    if (!row.latitude && details.location?.latitude != null) enrichmentUpdate.latitude = details.location.latitude;
    if (!row.longitude && details.location?.longitude != null) enrichmentUpdate.longitude = details.location.longitude;
    if (!row.website && details.websiteUri) enrichmentUpdate.website = details.websiteUri;
    if (!row.phone && details.nationalPhoneNumber) enrichmentUpdate.phone = details.nationalPhoneNumber;

    const enrichedRow = { ...row, ...enrichmentUpdate };
    const photoRepair = getPhotoPublishabilityUpdates(enrichedRow);
    const publishability = buildPublishabilityUpdate({ ...enrichedRow, ...photoRepair }, { allowApproval: false });
    const finalUpdate = { ...enrichmentUpdate, ...photoRepair, ...publishability.update };

    const { error: updateError } = await supabaseAdmin.from("locations").update(finalUpdate).eq("id", locationId);
    if (updateError) throw updateError;

    return Response.json({
      success: true,
      message: publishability.result.reasons.length
        ? `Google enrichment completed. Still needs: ${publishability.result.reasons.join(", ")}.`
        : "Google enrichment completed and publishability was recalculated.",
      locationId,
      googlePlaceId: details.id || placeId,
      googleDisplayName: details.displayName?.text || matchedPlace?.displayName?.text || null,
      matchConfidence,
      publishability: publishability.result,
    });
  } catch (error) {
    console.error("Single-location Google enrichment failed", error);
    return Response.json({ success: false, error: error instanceof Error ? error.message : "Single-location Google enrichment failed." }, { status: 500 });
  }
}
