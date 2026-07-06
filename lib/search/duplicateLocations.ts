export type DuplicateLocationHealth = {
  duplicateLocationShown: boolean;
  duplicateLocationCount: number;
  duplicateLocationErrors: string[];
  duplicateLocationWarnings: string[];
  duplicateLocationKeys: string[];
};

type DuplicateInput = {
  restaurants?: unknown[] | null;
  activities?: unknown[] | null;
  pairs?: unknown[] | null;
  sameLocationAllowed?: boolean;
};

const EMPTY_DUPLICATE_HEALTH: DuplicateLocationHealth = {
  duplicateLocationShown: false,
  duplicateLocationCount: 0,
  duplicateLocationErrors: [],
  duplicateLocationWarnings: [],
  duplicateLocationKeys: [],
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function normalize(value: unknown) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function locationName(item: any) {
  return clean(item?.name ?? item?.restaurant_name ?? item?.activity_name ?? item?.business_name);
}

function locationAddress(item: any) {
  return clean([item?.address, item?.city, item?.state, item?.zip_code].filter(Boolean).join(" "));
}

function locationId(item: any) {
  const id = clean(item?.id ?? item?.source_id);
  return id || null;
}

function googlePlaceId(item: any) {
  const id = clean(item?.google_place_id ?? item?.place_id);
  return id || null;
}

function locationKey(item: any) {
  return locationId(item) ?? googlePlaceId(item) ?? `${normalize(locationName(item))}|${normalize(locationAddress(item))}`;
}

function pairKey(pair: any) {
  return `${locationKey(pair?.restaurant)}=>${locationKey(pair?.activity)}`;
}

function addIssue(target: string[], keys: Set<string>, key: string, message: string) {
  target.push(message);
  keys.add(key);
}

function checkDuplicateLocations(
  items: any[],
  label: "restaurants" | "activities",
  errors: string[],
  warnings: string[],
  keys: Set<string>,
) {
  const ids = new Map<string, any>();
  const googleIds = new Map<string, any>();
  const physical = new Map<string, any>();

  for (const item of items) {
    const id = locationId(item);
    if (id) {
      const key = `${label}:id:${id}`;
      if (ids.has(id)) addIssue(errors, keys, key, `Duplicate ${label} id shown: ${id}`);
      else ids.set(id, item);
    }

    const placeId = googlePlaceId(item);
    if (placeId) {
      const key = `${label}:google_place_id:${placeId}`;
      if (googleIds.has(placeId)) addIssue(errors, keys, key, `Duplicate ${label} google_place_id shown: ${placeId}`);
      else googleIds.set(placeId, item);
    }

    const name = normalize(locationName(item));
    const address = normalize(locationAddress(item));
    if (name && address) {
      const physicalKey = `${name}|${address}`;
      const existing = physical.get(physicalKey);
      if (existing && locationId(existing) !== locationId(item)) {
        addIssue(warnings, keys, `${label}:name_address:${physicalKey}`, `Likely duplicate ${label} location shown with same name and address: ${locationName(item)} @ ${locationAddress(item)}`);
      } else if (!existing) {
        physical.set(physicalKey, item);
      }
    }
  }
}

export function detectDuplicateSearchLocations(input: DuplicateInput): DuplicateLocationHealth {
  const restaurants = Array.isArray(input.restaurants) ? input.restaurants : [];
  const activities = Array.isArray(input.activities) ? input.activities : [];
  const pairs = Array.isArray(input.pairs) ? input.pairs : [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const keys = new Set<string>();

  checkDuplicateLocations(restaurants, "restaurants", errors, warnings, keys);
  checkDuplicateLocations(activities, "activities", errors, warnings, keys);

  const pairKeys = new Set<string>();
  for (const pair of pairs) {
    const key = pairKey(pair);
    if (pairKeys.has(key)) addIssue(errors, keys, `pairs:${key}`, `Duplicate pair shown: ${key}`);
    else pairKeys.add(key);

    const restaurantKey = locationKey((pair as any)?.restaurant);
    const activityKey = locationKey((pair as any)?.activity);
    if (!input.sameLocationAllowed && restaurantKey && restaurantKey === activityKey) {
      addIssue(errors, keys, `pairs:same_side:${restaurantKey}`, `Same location shown on both sides of a pair: ${restaurantKey}`);
    }
  }

  const duplicateLocationKeys = Array.from(keys).sort();
  return {
    ...EMPTY_DUPLICATE_HEALTH,
    duplicateLocationShown: errors.length > 0 || warnings.length > 0,
    duplicateLocationCount: duplicateLocationKeys.length,
    duplicateLocationErrors: errors,
    duplicateLocationWarnings: warnings,
    duplicateLocationKeys,
  };
}

export function emptyDuplicateLocationHealth(): DuplicateLocationHealth {
  return { ...EMPTY_DUPLICATE_HEALTH };
}
