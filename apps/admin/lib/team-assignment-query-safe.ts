import "server-only";

import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import {
  assignmentScopeSummary,
  cleanAssignmentFilter,
  type TeamAssignmentFilters,
} from "@/lib/team-assignment-utils";

export type SafeAssignmentFacets = {
  markets: string[];
  cities: string[];
  boroughs: string[];
  neighborhoods: string[];
  zips: string[];
  states: string[];
  territories: Array<{ id: string; name: string; borough: string | null }>;
};

const EMPTY_FACETS: SafeAssignmentFacets = {
  markets: [],
  cities: [],
  boroughs: [],
  neighborhoods: [],
  zips: [],
  states: [],
  territories: [],
};

function unique(values: unknown[]) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

function displayName(row: Record<string, unknown>) {
  return String(
    row.name ||
      row.location_name ||
      row.restaurant_name ||
      row.activity_name ||
      "Untitled location",
  );
}

function matches(value: unknown, expected: unknown) {
  const cleanExpected = cleanAssignmentFilter(expected);
  if (!cleanExpected) return true;
  return String(value || "").trim().toLowerCase() === cleanExpected.toLowerCase();
}

function textMatches(row: Record<string, unknown>, value: unknown) {
  const q = (cleanAssignmentFilter(value) || "").toLowerCase();
  if (!q) return true;
  return [
    row.name,
    row.location_name,
    row.restaurant_name,
    row.activity_name,
    row.address,
    row.city,
    row.state,
    row.borough,
    row.neighborhood,
    row.zip_code,
    row.postal_code,
    row.market,
    row.location_type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(q);
}

async function readLocationsWithOptionalMarket(limit: number) {
  const adminDb = getAdminDatabaseClient();
  const richColumns =
    "id,name,location_name,restaurant_name,activity_name,address,city,state,borough,neighborhood,zip_code,postal_code,market,category,location_type,updated_at";
  const safeColumns =
    "id,name,address,city,state,borough,neighborhood,zip_code,postal_code,location_type,updated_at";

  const rich = await adminDb
    .from("locations")
    .select(richColumns)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (!rich.error) {
    return {
      rows: rich.data || [],
      marketAvailable: true,
      warning: null as string | null,
    };
  }

  console.error("TEAM_ASSIGNMENT_RICH_LOCATION_QUERY_FAILED", {
    code: rich.error.code,
    message: rich.error.message,
  });

  const fallback = await adminDb
    .from("locations")
    .select(safeColumns)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (fallback.error) {
    console.error("TEAM_ASSIGNMENT_SAFE_LOCATION_QUERY_FAILED", {
      code: fallback.error.code,
      message: fallback.error.message,
    });
    return {
      rows: [],
      marketAvailable: false,
      warning: "Location data is temporarily unavailable.",
    };
  }

  return {
    rows: (fallback.data || []).map((row) => ({
      ...row,
      market: null,
      category: null,
    })),
    marketAvailable: false,
    warning:
      "Market filtering is unavailable until the locations schema is synchronized.",
  };
}

export async function getSafeAssignmentFacets(): Promise<SafeAssignmentFacets> {
  const adminDb = getAdminDatabaseClient();
  const [result, territoryResult] = await Promise.all([
    readLocationsWithOptionalMarket(25000),
    adminDb
      .from("crm_territories")
      .select("id,name,borough")
      .eq("status", "active")
      .order("name", { ascending: true }),
  ]);
  if (!result.rows.length) {
    return {
      ...EMPTY_FACETS,
      territories: (territoryResult.data || []).map((row) => ({
        id: String(row.id),
        name: String(row.name || "Untitled territory"),
        borough: row.borough || null,
      })),
    };
  }
  return {
    markets: unique(result.rows.map((row) => row.market)),
    cities: unique(result.rows.map((row) => row.city)),
    boroughs: unique(result.rows.map((row) => row.borough)),
    neighborhoods: unique(result.rows.map((row) => row.neighborhood)),
    zips: unique(result.rows.map((row) => row.zip_code || row.postal_code)),
    states: unique(result.rows.map((row) => row.state)),
    territories: (territoryResult.data || []).map((row) => ({
      id: String(row.id),
      name: String(row.name || "Untitled territory"),
      borough: row.borough || null,
    })),
  };
}

export async function searchSafeAssignmentLocations(
  filters: TeamAssignmentFilters & { territory?: string; page?: number },
) {
  const requestedLimit = Math.min(Math.max(Number(filters.limit || 100), 1), 500);
  const page = Math.max(Number(filters.page || 1), 1);
  const readLimit = 25000;
  const result = await readLocationsWithOptionalMarket(readLimit);
  const adminDb = getAdminDatabaseClient();

  let territoryLocationIds: Set<string> | null = null;
  const territory = cleanAssignmentFilter(filters.territory);
  if (territory) {
    const { data: links, error: linkError } = await adminDb
      .from("crm_location_territories")
      .select("location_id")
      .eq("territory_id", territory);
    if (linkError) throw linkError;
    territoryLocationIds = new Set((links || []).map((row) => String(row.location_id)));
  }

  const rows = result.rows.filter((row) => {
    if (territoryLocationIds && !territoryLocationIds.has(String(row.id))) return false;
    if (!textMatches(row, filters.q)) return false;
    if (!matches(row.state, filters.state)) return false;
    if (!matches(row.city, filters.city)) return false;
    if (!matches(row.city, filters.town)) return false;
    if (!matches(row.borough, filters.borough)) return false;
    if (!matches(row.neighborhood, filters.neighborhood)) return false;
    if (
      cleanAssignmentFilter(filters.zip) &&
      !matches(row.zip_code || row.postal_code, filters.zip)
    ) return false;
    if (cleanAssignmentFilter(filters.market)) {
      if (!result.marketAvailable) return false;
      if (!matches(row.market, filters.market)) return false;
    }
    return true;
  });

  const count = rows.length;
  const from = (page - 1) * requestedLimit;
  const pagedRows = rows.slice(from, from + requestedLimit);

  let scope = assignmentScopeSummary(filters);
  if (territory) {
    const { data: territoryRow } = await adminDb
      .from("crm_territories")
      .select("name")
      .eq("id", territory)
      .maybeSingle();
    if (territoryRow?.name) {
      scope = scope === "Selected locations"
        ? `Territory: ${territoryRow.name}`
        : `Territory: ${territoryRow.name} · ${scope}`;
    }
  }

  return {
    locations: pagedRows.map((row) => ({
      ...row,
      display_name: displayName(row),
    })),
    count,
    limited: count > requestedLimit,
    page,
    pageSize: requestedLimit,
    totalPages: Math.max(1, Math.ceil(count / requestedLimit)),
    scope,
    warning:
      readLimit >= 25000 && result.rows.length >= readLimit
        ? "The location universe exceeds the assignment search safety window. Narrow the filters for exact counts."
        : result.warning,
  };
}
