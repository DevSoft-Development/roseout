export type GeoArea = {
  zipCode: string | null;
  neighborhood: string | null;
  borough: string | null;
  city: string | null;
  county: string | null;
  state: string | null;
  market: string | null;
  latitude: number | null;
  longitude: number | null;
  source: string | null;
  confidence: number | null;
};

export function normalizeZip(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 5 ? digits.slice(0, 5) : null;
}

export function extractZipFromText(value: unknown): string | null {
  const text = String(value ?? "");
  const match = text.match(/(?:^|\D)(\d{5})(?:-\d{4})?(?=\D|$)/);
  return match?.[1] ?? null;
}

export function emptyGeoArea(zipCode: string | null = null): GeoArea {
  return {
    zipCode,
    neighborhood: null,
    borough: null,
    city: null,
    county: null,
    state: null,
    market: null,
    latitude: null,
    longitude: null,
    source: zipCode ? "unresolved" : null,
    confidence: zipCode ? 0 : null,
  };
}

export function geoAreaLabel(area: Partial<GeoArea> | null | undefined): string {
  if (!area) return "";
  return [area.neighborhood, area.borough, area.city, area.county, area.state]
    .filter((value, index, all) => value && all.indexOf(value) === index)
    .join(" · ");
}

export function postalGeoRadiusMiles(area: Partial<GeoArea> | null | undefined): number {
  if (!area) return 8;
  if (area.borough || area.neighborhood) return 5;
  if (area.city) return 7;
  return 10;
}
