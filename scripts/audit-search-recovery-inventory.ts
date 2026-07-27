/** Read-only inventory audit for recovery-sensitive public searches. */
import { supabaseAdmin } from "../lib/supabase-admin";
import { qualifyRooftopCandidate } from "../lib/search/enterprise/activityQualification";
import { distanceMiles } from "../lib/search/enterprise/longIslandGeography";

const publishReady = (row: any) =>
  row.is_searchable !== false && row.is_hidden !== true && !row.deleted_at &&
  !["hidden", "unsupported", "duplicate"].includes(String(row.status ?? row.data_status ?? "").toLowerCase());
const photo = (row: any) => Boolean(row.image_url || row.main_image || (Array.isArray(row.images) && row.images.length));
const coordinates = (row: any) => Number.isFinite(Number(row.latitude)) && Number.isFinite(Number(row.longitude));

export function auditManhattanRooftops(rows: any[]) {
  const relevant = rows.filter((row) => /\b(rooftop|roof[ -]?deck|terrace|skyline|city views?)\b/i.test([
    row.name, row.description, row.search_document, ...(row.semantic_tags ?? []), ...(row.search_keywords ?? []),
  ].filter(Boolean).join(" ")));
  return {
    totalRooftopRelatedText: relevant.length,
    searchable: relevant.filter((row) => row.is_searchable !== false).length,
    publishReady: relevant.filter(publishReady).length,
    coordinatesPresent: relevant.filter(coordinates).length,
    photoPresent: relevant.filter(photo).length,
    byLocationType: relevant.reduce<Record<string, number>>((counts, row) => {
      const type = String(row.location_type ?? "unknown");
      counts[type] = (counts[type] ?? 0) + 1;
      return counts;
    }, {}),
    strongRooftopEvidence: relevant.filter((row) => qualifyRooftopCandidate(row).matches).length,
    genericOnlyEvidence: relevant.filter((row) => !qualifyRooftopCandidate(row).matches).length,
    hidden: relevant.filter((row) => row.is_hidden === true).length,
    unsupported: relevant.filter((row) => String(row.status ?? row.data_status).toLowerCase() === "unsupported").length,
    duplicate: relevant.filter((row) => String(row.duplicate_status ?? row.status).toLowerCase() === "duplicate").length,
    missingSemanticTags: relevant.filter((row) => !Array.isArray(row.semantic_tags) || row.semantic_tags.length === 0).length,
  };
}

export function auditGardenCityRestaurants(rows: any[], radiusMiles = 5) {
  const nearby = rows.filter((row) => {
    const miles = distanceMiles(40.7268, -73.6343, row);
    return miles != null && miles <= radiusMiles && String(row.location_type).toLowerCase() === "restaurant";
  });
  return {
    radiusMiles,
    totalRestaurants: nearby.length,
    searchable: nearby.filter((row) => row.is_searchable !== false).length,
    publishReady: nearby.filter(publishReady).length,
    coordinatesPresent: nearby.filter(coordinates).length,
    photosPresent: nearby.filter(photo).length,
    exactGardenCity: nearby.filter((row) => String(row.city).toLowerCase() === "garden city").length,
    nearbyNassauTown: nearby.filter((row) => String(row.county).toLowerCase() === "nassau" && String(row.city).toLowerCase() !== "garden city").length,
    suppressedByMarket: nearby.filter((row) => /queens|suffolk/i.test(`${row.market} ${row.county}`)).length,
    suppressedByCityEquality: nearby.filter((row) => String(row.city).toLowerCase() !== "garden city").length,
    suppressedByVisibility: nearby.filter((row) => row.is_hidden === true || row.is_searchable === false).length,
    suppressedByQuality: nearby.filter((row) => Number(row.quality_score ?? 0) <= 0).length,
    suppressedByIntent: nearby.filter((row) => !/restaurant|food|dining/i.test(`${row.location_type} ${row.search_document}`)).length,
  };
}

async function main() {
  const { data, error } = await supabaseAdmin.from("locations").select("*");
  if (error) throw error;
  const rows = data ?? [];
  const manhattan = rows.filter((row: any) => /manhattan|new york/i.test(`${row.borough} ${row.city} ${row.county}`));
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), manhattanRooftop: auditManhattanRooftops(manhattan), gardenCityRestaurant: auditGardenCityRestaurants(rows) }, null, 2));
}

if (process.argv[1]?.endsWith("audit-search-recovery-inventory.ts")) void main();
