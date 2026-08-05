import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { assignmentScopeSummary, cleanAssignmentFilter, type TeamAssignmentFilters } from "@/lib/team-assignment-utils";

export type SafeAssignmentFacets = {
  markets: string[];
  cities: string[];
  boroughs: string[];
  neighborhoods: string[];
  states: string[];
};

const EMPTY_FACETS: SafeAssignmentFacets = {
  markets: [],
  cities: [],
  boroughs: [],
  neighborhoods: [],
  states: [],
};

function unique(values: unknown[]) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function displayName(row: Record<string, unknown>) {
  return String(row.name || row.location_name || row.restaurant_name || row.activity_name || "Untitled location");
}

function matches(value: unknown, expected: unknown) {
  const cleanExpected = cleanAssignmentFilter(expected);
  if (!cleanExpected) return true;
  return String(value || "").trim().toLowerCase() === cleanExpected.toLowerCase();
}

function textMatches(row: Record<string, unknown>, value: unknown) {
  const q = cleanAssignmentFilter(value).toLowerCase();
  if (!q) return true;
  return [row.name, row.location_name, row.restaurant_name, row.activity_name, row.address, row.city, row.state, row.borough, row.neighborhood, row.market, row.location_type]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(q);
}

async function readLocationsWithOptionalMarket(limit: number) {
  const richColumns = "id,name,location_name,restaurant_name,activity_name,address,city,state,borough,neighborhood,market,category,location_type,updated_at";
  const safeColumns = "id,name,address,city,state,borough,neighborhood,location_type,updated_at";

  const rich = await supabaseAdmin.from("locations").select(richColumns).order("updated_at", { ascending: false }).limit(limit);
  if (!rich.error) return { rows: rich.data || [], marketAvailable: true, warning: null as string | null };

  console.error("TEAM_ASSIGNMENT_RICH_LOCATION_QUERY_FAILED", {
    code: rich.error.code,
    message: rich.error.message,
  });

  const fallback = await supabaseAdmin.from("locations").select(safeColumns).order("updated_at", { ascending: false }).limit(limit);
  if (fallback.error) {
    console.error("TEAM_ASSIGNMENT_SAFE_LOCATION_QUERY_FAILED", {
      code: fallback.error.code,
      message: fallback.error.message,
    });
    return { rows: [], marketAvailable: false, warning: "Location data is temporarily unavailable." };
  }

  return {
    rows: (fallback.data || []).map((row) => ({ ...row, market: null, category: null })),
    marketAvailable: false,
    warning: "Market filtering is unavailable until the locations schema is synchronized.",
  };
}

export async function getSafeAssignmentFacets(): Promise<SafeAssignmentFacets> {
  const result = await readLocationsWithOptionalMarket(5000);
  if (!result.rows.length) return EMPTY_FACETS;
  return {
    markets: unique(result.rows.map((row: any) => row.market)),
    cities: unique(result.rows.map((row: any) => row.city)),
    boroughs: unique(result.rows.map((row: any) => row.borough)),
    neighborhoods: unique(result.rows.map((row: any) => row.neighborhood)),
    states: unique(result.rows.map((row: any) => row.state)),
  };
}

export async function searchSafeAssignmentLocations(filters: TeamAssignmentFilters) {
  const requestedLimit = Math.min(Math.max(Number(filters.limit || 100), 1), 500);
  const readLimit = Math.min(Math.max(requestedLimit * 10, 500), 5000);
  const result = await readLocationsWithOptionalMarket(readLimit);

  let rows = result.rows.filter((row: any) => {
    if (!textMatches(row, filters.q)) return false;
    if (!matches(row.state, filters.state)) return false;
    if (!matches(row.city, filters.city)) return false;
    if (!matches(row.city, filters.town)) return false;
    if (!matches(row.borough, filters.borough)) return false;
    if (!matches(row.neighborhood, filters.neighborhood)) return false;
    if (cleanAssignmentFilter(filters.market)) {
      if (!result.marketAvailable) return false;
      if (!matches(row.market, filters.market)) return false;
    }
    return true;
  });

  const count = rows.length;
  rows = rows.slice(0, requestedLimit);

  return {
    locations: rows.map((row: any) => ({ ...row, display_name: displayName(row) })),
    count,
    limited: count > requestedLimit,
    scope: assignmentScopeSummary(filters),
    warning: result.warning,
  };
}
