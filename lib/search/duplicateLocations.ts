import type { EnterpriseLocation, EnterprisePair } from "@/lib/search/enterprise/types";

export type DuplicateLocationSeverity = "error" | "warning";

export type DuplicateLocationDetail = {
  severity: DuplicateLocationSeverity;
  reason: string;
  key: string;
  id?: string | null;
  name?: string | null;
  address?: string | null;
  appearedIn: string[];
};

export type DuplicateSearchLocationDiagnostics = {
  duplicateLocationShown: boolean;
  duplicateLocationCount: number;
  duplicateLocationErrors: string[];
  duplicateLocationWarnings: string[];
  duplicateLocationKeys: string[];
  duplicateLocationDetails: DuplicateLocationDetail[];
};

type DetectArgs = {
  restaurants?: any[] | null;
  activities?: any[] | null;
  pairs?: any[] | null;
  cards?: any[] | null;
  allowSameLocationCombos?: boolean;
};

type DedupeArgs = {
  restaurants?: EnterpriseLocation[] | null;
  activities?: EnterpriseLocation[] | null;
  pairs?: EnterprisePair[] | null;
  allowSameLocationCombos?: boolean;
};

const EMPTY_DIAGNOSTICS: DuplicateSearchLocationDiagnostics = {
  duplicateLocationShown: false,
  duplicateLocationCount: 0,
  duplicateLocationErrors: [],
  duplicateLocationWarnings: [],
  duplicateLocationKeys: [],
  duplicateLocationDetails: [],
};

function cleanString(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function displayName(item: any): string | null {
  return cleanString(item?.name ?? item?.restaurant_name ?? item?.activity_name ?? item?.business_name);
}

function displayAddress(item: any): string | null {
  return cleanString(item?.address ?? item?.formatted_address ?? item?.street_address);
}

function locationId(item: any): string | null {
  return cleanString(item?.id ?? item?.location_id ?? item?.source_id);
}

function googlePlaceId(item: any): string | null {
  return cleanString(item?.google_place_id ?? item?.place_id);
}

export function normalizeDuplicateLocationText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[.,#]/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/[\s-]+/g, " ")
    .trim();
}

function normalizedNameAddressKey(item: any): string | null {
  const name = normalizeDuplicateLocationText(displayName(item));
  const address = normalizeDuplicateLocationText(displayAddress(item));
  if (name && address) return `name_address:${name}|${address}`;
  return null;
}

function normalizedNameCityStateZipKey(item: any): string | null {
  if (displayAddress(item)) return null;
  const name = normalizeDuplicateLocationText(displayName(item));
  const city = normalizeDuplicateLocationText(item?.city);
  const state = normalizeDuplicateLocationText(item?.state);
  const zip = normalizeDuplicateLocationText(item?.zip_code ?? item?.postal_code ?? item?.zip);
  if (name && city && state && zip) return `name_city_state_zip:${name}|${city}|${state}|${zip}`;
  return null;
}

type PairLocationParts = {
  restaurant: unknown | null;
  activity: unknown | null;
  restaurantId: string | null;
  activityId: string | null;
};

function pairLocations(pair: unknown): PairLocationParts {
  const record = pair && typeof pair === "object" ? (pair as Record<string, unknown>) : {};
  const restaurant =
    record.restaurant ??
    record.restaurants ??
    record.restaurant_location ??
    record.restaurantLocation ??
    null;
  const activity =
    record.activity ??
    record.activities ??
    record.activity_location ??
    record.activityLocation ??
    null;
  const restaurantId =
    locationId(restaurant) ??
    cleanString(record.restaurant_id ?? record.restaurant_location_id ?? record.first_activity_location_id);
  const activityId =
    locationId(activity) ??
    cleanString(record.activity_id ?? record.activity_location_id ?? record.paired_activity_location_id ?? record.second_activity_location_id);
  return { restaurant, activity, restaurantId, activityId };
}

function pairKey(pair: unknown): string | null {
  const { restaurantId, activityId } = pairLocations(pair);
  if (!restaurantId || !activityId) return null;
  return `pair:${restaurantId}->${activityId}`;
}

function samePhysicalLocation(a: any, b: any): boolean {
  const aId = locationId(a);
  const bId = locationId(b);
  if (aId && bId && aId === bId) return true;
  const aGoogle = googlePlaceId(a);
  const bGoogle = googlePlaceId(b);
  if (aGoogle && bGoogle && aGoogle === bGoogle) return true;
  const aNameAddress = normalizedNameAddressKey(a);
  const bNameAddress = normalizedNameAddressKey(b);
  return Boolean(aNameAddress && aNameAddress === bNameAddress);
}

function formatLocation(item: any) {
  const name = displayName(item) ?? "Unknown location";
  const address = displayAddress(item);
  const city = cleanString(item?.city);
  return [name, address, city].filter(Boolean).join(", ");
}

function addDetail(details: DuplicateLocationDetail[], detail: DuplicateLocationDetail) {
  if (details.some((existing) => existing.key === detail.key && existing.reason === detail.reason)) return;
  details.push(detail);
}

export function detectDuplicateSearchLocations(args: DetectArgs): DuplicateSearchLocationDiagnostics {
  const details: DuplicateLocationDetail[] = [];
  const entries: Array<{ item: any; appearedIn: string }> = [];
  (args.restaurants ?? []).forEach((item, index) => entries.push({ item, appearedIn: `restaurants[${index}]` }));
  (args.activities ?? []).forEach((item, index) => entries.push({ item, appearedIn: `activities[${index}]` }));
  (args.cards ?? []).forEach((item, index) => entries.push({ item, appearedIn: `cards[${index}]` }));

  for (const keyName of ["id", "google_place_id"] as const) {
    const seen = new Map<string, typeof entries>();
    for (const entry of entries) {
      const rawKey = keyName === "id" ? locationId(entry.item) : googlePlaceId(entry.item);
      if (!rawKey) continue;
      const key = `${keyName}:${rawKey}`;
      seen.set(key, [...(seen.get(key) ?? []), entry]);
    }
    for (const [key, hits] of seen) {
      if (hits.length < 2) continue;
      const first = hits[0]?.item;
      addDetail(details, {
        severity: "error",
        reason: keyName === "id" ? "duplicate_location_id" : "duplicate_google_place_id",
        key,
        id: locationId(first),
        name: displayName(first),
        address: displayAddress(first),
        appearedIn: hits.map((hit) => hit.appearedIn),
      });
    }
  }

  for (const keyBuilder of [normalizedNameAddressKey, normalizedNameCityStateZipKey]) {
    const seen = new Map<string, typeof entries>();
    for (const entry of entries) {
      const key = keyBuilder(entry.item);
      if (!key) continue;
      seen.set(key, [...(seen.get(key) ?? []), entry]);
    }
    for (const [key, hits] of seen) {
      const distinctIds = new Set(hits.map((hit) => locationId(hit.item)).filter(Boolean));
      if (hits.length < 2 || distinctIds.size < 2) continue;
      const first = hits[0]?.item;
      addDetail(details, {
        severity: "warning",
        reason: key.startsWith("name_address:") ? "possible_duplicate_name_address" : "possible_duplicate_name_city_state_zip",
        key,
        id: locationId(first),
        name: displayName(first),
        address: displayAddress(first),
        appearedIn: hits.map((hit) => hit.appearedIn),
      });
    }
  }

  const pairSeen = new Map<string, any[]>();
  (args.pairs ?? []).forEach((pair, index) => {
    const key = pairKey(pair);
    if (!key) return;
    pairSeen.set(key, [...(pairSeen.get(key) ?? []), { pair, appearedIn: `pairs[${index}]` }]);
  });
  for (const [key, hits] of pairSeen) {
    if (hits.length < 2) continue;
    addDetail(details, {
      severity: "error",
      reason: "duplicate_exact_pair",
      key,
      appearedIn: hits.map((hit) => hit.appearedIn),
    });
  }

  (args.pairs ?? []).forEach((pair, index) => {
    if (args.allowSameLocationCombos || pair?.sameLocationCombo === true) return;
    const { restaurant, activity, restaurantId, activityId } = pairLocations(pair);
    const sameLocationById = Boolean(restaurantId && activityId && restaurantId === activityId);
    if (sameLocationById || samePhysicalLocation(restaurant, activity)) {
      const key = pairKey(pair) ?? `same_location_pair:${index}`;
      addDetail(details, {
        severity: "error",
        reason: "same_location_pair_without_combo_mode",
        key,
        id: locationId(restaurant) ?? locationId(activity) ?? restaurantId ?? activityId,
        name: displayName(restaurant) ?? displayName(activity),
        address: displayAddress(restaurant) ?? displayAddress(activity),
        appearedIn: [`pairs[${index}].restaurant`, `pairs[${index}].activity`],
      });
    }
  });

  const errors = details.filter((d) => d.severity === "error").map((d) => `Duplicate location shown in final results: ${d.name ?? d.key} (${d.reason}) appeared in ${d.appearedIn.join(", ")}.`);
  const warnings = details.filter((d) => d.severity === "warning").map((d) => `Possible duplicate physical location shown: ${[d.name, d.address].filter(Boolean).join(", ") || d.key} appears under multiple ids.`);
  return {
    duplicateLocationShown: details.length > 0,
    duplicateLocationCount: details.length,
    duplicateLocationErrors: errors,
    duplicateLocationWarnings: warnings,
    duplicateLocationKeys: details.map((d) => d.key),
    duplicateLocationDetails: details,
  };
}

function dedupeById<T extends EnterpriseLocation>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const id = locationId(item);
    if (id) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    out.push(item);
  }
  return out;
}

export function dedupeFinalSearchResults(args: DedupeArgs) {
  const duplicateDiagnostics = detectDuplicateSearchLocations(args);
  const restaurants = dedupeById([...(args.restaurants ?? [])]);
  const activities = dedupeById([...(args.activities ?? [])]);
  const seenPairs = new Set<string>();
  const pairs: EnterprisePair[] = [];
  for (const pair of args.pairs ?? []) {
    const { restaurant, activity, restaurantId, activityId } = pairLocations(pair);
    const sameLocationById = Boolean(restaurantId && activityId && restaurantId === activityId);
    if (!args.allowSameLocationCombos && (pair as any)?.sameLocationCombo !== true && (sameLocationById || samePhysicalLocation(restaurant, activity))) continue;
    const key = pairKey(pair);
    if (key) {
      if (seenPairs.has(key)) continue;
      seenPairs.add(key);
    }
    pairs.push(pair);
  }
  return { restaurants, activities, pairs, duplicateDiagnostics };
}

export const noDuplicateSearchLocationDiagnostics = EMPTY_DIAGNOSTICS;
