import { ACTIVE_MARKET_STATES, buildPublishabilityUpdate, evaluateLocationPublishability } from "@/lib/location-publishability";
import { getPhotoPublishabilityUpdates } from "@/lib/location-growth/repairPhotoPublishability";
import { supabaseAdmin } from "@/lib/supabase-admin";

type Row = Record<string, any>;
type Component = { longText?: string; shortText?: string; types?: string[] };
type Place = { id?: string; formattedAddress?: string; addressComponents?: Component[]; location?: { latitude?: number; longitude?: number } };

const text = (value: unknown) => String(value ?? "").trim();
const activeState = (value: unknown) => ACTIVE_MARKET_STATES.includes(text(value).toUpperCase() as any);

function component(place: Place, type: string, short = false) {
  const item = place.addressComponents?.find((part) => part.types?.includes(type));
  return text(short ? item?.shortText : item?.longText);
}

async function fetchGooglePlace(row: Row): Promise<Place | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  let placeId = text(row.google_place_id);
  if (!placeId) {
    const query = [row.name || row.restaurant_name || row.activity_name, row.address, row.city, row.state, row.zip_code || row.postal_code].map(text).filter(Boolean).join(", ");
    if (!query) return null;
    const search = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.id" },
      body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
    });
    if (!search.ok) return null;
    const payload = await search.json().catch(() => ({}));
    placeId = text(payload?.places?.[0]?.id);
  }
  if (!placeId) return null;
  const details = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "id,formattedAddress,addressComponents,location" },
  });
  return details.ok ? details.json() : null;
}

async function hasActiveDuplicatePair(locationId: string) {
  const { count, error } = await supabaseAdmin
    .from("location_duplicate_review")
    .select("id", { count: "exact", head: true })
    .or(`location_a_id.eq.${locationId},location_b_id.eq.${locationId}`)
    .in("status", ["pending", "merged"]);
  if (error) throw error;
  return (count || 0) > 0;
}

export async function repairAllPublishability(row: Row) {
  const updates: Row = { ...getPhotoPublishabilityUpdates(row) };
  const needsGeoRepair = !text(row.city) || !activeState(row.state) || !text(row.address) || row.latitude == null || row.longitude == null;
  const place = needsGeoRepair ? await fetchGooglePlace(row) : null;

  if (place) {
    const city = component(place, "locality") || component(place, "postal_town") || component(place, "administrative_area_level_2");
    const state = component(place, "administrative_area_level_1", true).toUpperCase();
    const postalCode = component(place, "postal_code");
    if (city) updates.city = city;
    if (state) updates.state = state;
    if (postalCode) updates.postal_code = postalCode;
    if (place.formattedAddress) updates.address = place.formattedAddress;
    if (place.location?.latitude != null) updates.latitude = place.location.latitude;
    if (place.location?.longitude != null) updates.longitude = place.location.longitude;
    if (place.id) updates.google_place_id = place.id;
  }

  const duplicateStatus = text(row.duplicate_status).toLowerCase();
  if (duplicateStatus === "duplicate" && !(await hasActiveDuplicatePair(text(row.id)))) updates.duplicate_status = "not_duplicate";

  const repaired = { ...row, ...updates };
  const safeStatus = ["approved", "active", ""].includes(text(repaired.status).toLowerCase());
  const canUnhide = safeStatus && text(repaired.duplicate_status).toLowerCase() !== "duplicate" && activeState(repaired.state) && text(repaired.city) && text(repaired.address);
  if (canUnhide) {
    updates.is_hidden = false;
    updates.is_low_level = false;
    updates.public_visibility_tier = "standard";
    updates.data_status = "clean";
    updates.source_quality_status = "enriched";
    updates.import_confidence = "high";
  }

  const finalRow = { ...row, ...updates };
  const publishability = buildPublishabilityUpdate(finalRow, { allowApproval: false });
  const finalUpdate = { ...updates, ...publishability.update };
  const result = evaluateLocationPublishability({ ...row, ...finalUpdate }, { allowApproval: true });
  return { update: finalUpdate, result, repairedFields: Object.keys(updates) };
}
