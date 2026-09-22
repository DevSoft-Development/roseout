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
