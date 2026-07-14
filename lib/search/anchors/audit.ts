import { supabaseAdmin } from "@/lib/supabase-admin";

type Row = Record<string, any>;

export type AnchorAuditIssue = {
  type: "missing_coordinates" | "invalid_coordinates" | "duplicate_location" | "duplicate_linked_anchor" | "conflicting_anchor" | "alias_conflict" | "missing_anchor" | "excluded";
  severity: "critical" | "high" | "medium" | "low";
  locationId?: string;
  anchorId?: string;
  name: string;
  market?: string | null;
  reason: string;
  relatedIds?: string[];
};

async function fetchAll(table: string) {
  const rows: Row[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabaseAdmin.from(table).select("*").range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalized(value: unknown) {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function coordinateState(row: Row): "valid" | "missing" | "invalid" {
  const lat = Number(row.latitude ?? row.lat);
  const lng = Number(row.longitude ?? row.lng ?? row.lon);
  if (row.latitude == null && row.lat == null || row.longitude == null && row.lng == null && row.lon == null) return "missing";
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180 || (lat === 0 && lng === 0)) return "invalid";
  return "valid";
}

function locationName(row: Row) {
  return text(row.name ?? row.location_name ?? row.title) || "Unnamed location";
}

function marketOf(row: Row) {
  return text(row.market ?? row.market_key ?? row.region) || null;
}

function isSearchable(row: Row) {
  const status = text(row.status ?? row.publication_status).toLowerCase();
  if (["deleted", "archived", "permanently_closed", "rejected"].includes(status)) return false;
  if (row.is_searchable === false || row.searchable === false || row.is_published === false || row.published === false) return false;
  return row.is_searchable === true || row.searchable === true || row.is_published === true || row.published === true || ["published", "approved", "active"].includes(status);
}

function duplicateKey(row: Row) {
  const placeId = text(row.google_place_id ?? row.place_id);
  if (placeId) return `place:${placeId}`;
  const name = normalized(locationName(row));
  const address = normalized(row.formatted_address ?? row.address ?? row.street_address);
  const city = normalized(row.city);
  return name && (address || city) ? `name:${name}|${address}|${city}` : "";
}

export async function buildSearchAnchorCoverageAudit() {
  const [locations, anchors] = await Promise.all([fetchAll("locations"), fetchAll("search_anchors")]);
  const issues: AnchorAuditIssue[] = [];
  const searchable = locations.filter(isSearchable);
  const valid = searchable.filter((row) => coordinateState(row) === "valid");
  const missingCoordinates = searchable.filter((row) => coordinateState(row) === "missing");
  const invalidCoordinates = searchable.filter((row) => coordinateState(row) === "invalid");
  const linkedAnchors = anchors.filter((row) => row.linked_location_id);
  const linkedByLocation = new Map<string, Row[]>();
  for (const anchor of linkedAnchors) {
    const id = String(anchor.linked_location_id);
    linkedByLocation.set(id, [...(linkedByLocation.get(id) ?? []), anchor]);
  }

  const missingAnchors = valid.filter((row) => !linkedByLocation.has(String(row.id)));
  for (const row of missingCoordinates) issues.push({ type: "missing_coordinates", severity: "high", locationId: row.id, name: locationName(row), market: marketOf(row), reason: "Searchable location has no complete latitude/longitude pair." });
  for (const row of invalidCoordinates) issues.push({ type: "invalid_coordinates", severity: "critical", locationId: row.id, name: locationName(row), market: marketOf(row), reason: "Searchable location has invalid or zero coordinates." });
  for (const row of missingAnchors) issues.push({ type: "missing_anchor", severity: "medium", locationId: row.id, name: locationName(row), market: marketOf(row), reason: "Eligible searchable location has no linked search anchor." });

  const duplicateLinked = [...linkedByLocation.entries()].filter(([, rows]) => rows.length > 1);
  for (const [locationId, rows] of duplicateLinked) issues.push({ type: "duplicate_linked_anchor", severity: "critical", locationId, name: rows[0]?.canonical_name ?? "Linked location", market: rows[0]?.market ?? null, reason: `${rows.length} anchors point to the same location.`, relatedIds: rows.map((row) => row.id) });

  const duplicateGroups = new Map<string, Row[]>();
  for (const row of locations) {
    const key = duplicateKey(row);
    if (key) duplicateGroups.set(key, [...(duplicateGroups.get(key) ?? []), row]);
  }
  const potentialDuplicates = [...duplicateGroups.values()].filter((rows) => rows.length > 1);
  for (const rows of potentialDuplicates) issues.push({ type: "duplicate_location", severity: "high", locationId: rows[0]?.id, name: locationName(rows[0]), market: marketOf(rows[0]), reason: `${rows.length} location rows share the same place identifier or normalized name/address.`, relatedIds: rows.map((row) => row.id) });

  const aliasOwners = new Map<string, Row[]>();
  for (const anchor of anchors.filter((row) => row.is_active !== false)) {
    for (const alias of Array.isArray(anchor.aliases) ? anchor.aliases : []) {
      const key = `${normalized(alias)}|${normalized(anchor.market)}`;
      if (key.startsWith("|")) continue;
      aliasOwners.set(key, [...(aliasOwners.get(key) ?? []), anchor]);
    }
  }
  const aliasConflicts = [...aliasOwners.entries()].filter(([, rows]) => new Set(rows.map((row) => row.id)).size > 1);
  for (const [alias, rows] of aliasConflicts) issues.push({ type: "alias_conflict", severity: "high", anchorId: rows[0]?.id, name: alias.split("|")[0], market: rows[0]?.market ?? null, reason: `Alias is assigned to ${rows.length} active anchors in the same market.`, relatedIds: rows.map((row) => row.id) });

  const locationById = new Map(locations.map((row) => [String(row.id), row]));
  const conflictingAnchors = linkedAnchors.filter((anchor) => {
    const location = locationById.get(String(anchor.linked_location_id));
    if (!location) return true;
    const anchorPlace = text(anchor.google_place_id);
    const locationPlace = text(location.google_place_id ?? location.place_id);
    if (anchorPlace && locationPlace && anchorPlace !== locationPlace) return true;
    const aLat = Number(anchor.latitude); const aLng = Number(anchor.longitude);
    const lLat = Number(location.latitude ?? location.lat); const lLng = Number(location.longitude ?? location.lng ?? location.lon);
    return [aLat, aLng, lLat, lLng].every(Number.isFinite) && (Math.abs(aLat - lLat) > 0.02 || Math.abs(aLng - lLng) > 0.02);
  });
  for (const anchor of conflictingAnchors) issues.push({ type: "conflicting_anchor", severity: "high", anchorId: anchor.id, locationId: anchor.linked_location_id, name: anchor.canonical_name, market: anchor.market ?? null, reason: "Linked anchor conflicts with its location record or references a missing location." });

  const excluded = locations.filter((row) => !isSearchable(row));
  const markets = new Map<string, { total: number; searchable: number; eligible: number; linked: number; missing: number }>();
  for (const row of locations) {
    const market = marketOf(row) ?? "Unassigned";
    const current = markets.get(market) ?? { total: 0, searchable: 0, eligible: 0, linked: 0, missing: 0 };
    current.total += 1;
    if (isSearchable(row)) current.searchable += 1;
    if (isSearchable(row) && coordinateState(row) === "valid") current.eligible += 1;
    if (linkedByLocation.has(String(row.id))) current.linked += 1;
    if (isSearchable(row) && coordinateState(row) === "valid" && !linkedByLocation.has(String(row.id))) current.missing += 1;
    markets.set(market, current);
  }

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalLocations: locations.length,
      searchableLocations: searchable.length,
      eligibleLocations: valid.length,
      validCoordinates: valid.length,
      missingCoordinates: missingCoordinates.length,
      invalidCoordinates: invalidCoordinates.length,
      existingLinkedAnchors: linkedAnchors.length,
      missingLinkedAnchors: missingAnchors.length,
      duplicateLinkedAnchors: duplicateLinked.length,
      conflictingAnchors: conflictingAnchors.length,
      potentialDuplicateLocations: potentialDuplicates.length,
      aliasConflicts: aliasConflicts.length,
      excludedLocations: excluded.length,
    },
    markets: [...markets.entries()].map(([market, counts]) => ({ market, ...counts })).sort((a, b) => b.searchable - a.searchable),
    issues,
  };
}
