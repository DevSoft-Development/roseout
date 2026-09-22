import { supabaseAdmin } from "@/lib/supabase-admin";
import { emptyGeoArea, normalizeZip, type GeoArea } from "@/lib/geo/geo-area";

type GeoPostalRow = {
  zip_code?: string | null;
  primary_neighborhood?: string | null;
  borough?: string | null;
  city?: string | null;
  county?: string | null;
  state?: string | null;
  market?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  source?: string | null;
  confidence?: number | string | null;
};

function numberOrNull(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export function geoAreaFromPostalRow(row: GeoPostalRow | null | undefined): GeoArea {
  if (!row?.zip_code) return emptyGeoArea();
  return {
    zipCode: normalizeZip(row.zip_code),
    neighborhood: row.primary_neighborhood ?? null,
    borough: row.borough ?? null,
    city: row.city ?? null,
    county: row.county ?? null,
    state: row.state ?? null,
    market: row.market ?? null,
    latitude: numberOrNull(row.latitude),
    longitude: numberOrNull(row.longitude),
    source: row.source ?? "geo_postal_areas",
    confidence: numberOrNull(row.confidence),
  };
}

export async function resolvePostalArea(
  value: unknown,
  client: any = supabaseAdmin,
): Promise<GeoArea> {
  const zipCode = normalizeZip(value);
  if (!zipCode) return emptyGeoArea();

  const { data, error } = await client
    .from("geo_postal_areas")
    .select("zip_code,primary_neighborhood,borough,city,county,state,market,latitude,longitude,source,confidence")
    .eq("zip_code", zipCode)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("[geo] postal lookup failed", { zipCode, message: error.message });
    return emptyGeoArea(zipCode);
  }
  return data ? geoAreaFromPostalRow(data) : emptyGeoArea(zipCode);
}

export async function getConsumerHomeGeo(
  userId: string | null | undefined,
  client: any = supabaseAdmin,
): Promise<GeoArea | null> {
  if (!userId) return null;
  const { data, error } = await client
    .from("consumer_profiles")
    .select("home_zip_code,home_neighborhood,home_borough,home_city,home_county,home_state,home_market,home_latitude,home_longitude,home_geo_source,home_geo_confidence")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    zipCode: normalizeZip(data.home_zip_code),
    neighborhood: data.home_neighborhood ?? null,
    borough: data.home_borough ?? null,
    city: data.home_city ?? null,
    county: data.home_county ?? null,
    state: data.home_state ?? null,
    market: data.home_market ?? null,
    latitude: numberOrNull(data.home_latitude),
    longitude: numberOrNull(data.home_longitude),
    source: data.home_geo_source ?? "consumer_profile",
    confidence: numberOrNull(data.home_geo_confidence),
  };
}
