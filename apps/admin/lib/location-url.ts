export type CrmLocationUrlRow = {
  id?: string | null;
  location_id?: string | null;
  locations_id?: string | null;
  locationId?: string | null;
  location_type?: string | null;
  source_table?: string | null;
  category?: string | null;
  primary_category?: string | null;
  active?: boolean | null;
  is_searchable?: boolean | null;
};

export function getCrmLocationTypeForPublicHref(row: Partial<CrmLocationUrlRow>) {
  const raw = String(row.location_type || row.source_table || row.category || row.primary_category || "").toLowerCase();
  if (raw.includes("activit")) return "activities";
  return "restaurants";
}

export function getCrmCanonicalLocationId(row: Partial<CrmLocationUrlRow>) {
  return row.location_id || row.locations_id || row.locationId || row.id || null;
}

export function getCrmPublicLocationHref(row: Partial<CrmLocationUrlRow>) {
  const id = getCrmCanonicalLocationId(row);
  if (!id) return null;
  const type = getCrmLocationTypeForPublicHref(row);
  return `/locations/${type}/${encodeURIComponent(String(id))}`;
}

export function canOpenPublicLocationPage(row: Partial<CrmLocationUrlRow>) {
  return row.active !== false && row.is_searchable !== false;
}
