export type WalkingArea = "manhattan" | "queens" | "new_jersey";

type WalkingLocation = {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  borough?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  location_tags?: string[] | string | null;
  neighborhood_tags?: string[] | string | null;
  area_tags?: string[] | string | null;
};

const MANHATTAN_LOCATION_ALIASES = [
  "manhattan",
  "new york",
  "new york city",
  "soho",
  "tribeca",
  "chelsea",
  "midtown",
  "midtown east",
  "midtown west",
  "upper east side",
  "upper west side",
  "harlem",
  "east harlem",
  "west harlem",
  "washington heights",
  "inwood",
  "hells kitchen",
  "hudson yards",
  "times square",
  "theater district",
  "flatiron",
  "gramercy",
  "kips bay",
  "noho",
  "nolita",
  "lower east side",
  "les",
  "east village",
  "west village",
  "greenwich village",
  "financial district",
  "fidi",
  "battery park",
  "battery park city",
  "chinatown",
  "little italy",
  "union square",
];

const QUEENS_LOCATION_ALIASES = [
  "queens",
  "astoria",
  "long island city",
  "lic",
  "sunnyside",
  "woodside",
  "jackson heights",
  "elmhurst",
  "east elmhurst",
  "corona",
  "flushing",
  "bayside",
  "whitestone",
  "college point",
  "forest hills",
  "rego park",
  "kew gardens",
  "fresh meadows",
  "jamaica",
  "ozone park",
  "ridgewood",
  "maspeth",
  "ditmars",
  "ditmars steinway",
];

const NEW_JERSEY_LOCATION_ALIASES = [
  "new jersey",
  "north jersey",
  "jersey city",
  "hoboken",
  "newark",
  "edgewater",
  "fort lee",
  "union city",
  "weehawken",
  "secaucus",
  "hackensack",
  "paramus",
  "englewood",
  "bayonne",
  "kearny",
  "harrison",
  "elizabeth",
  "union",
  "maplewood",
  "montclair",
  "bloomfield",
  "clifton",
  "paterson",
  "teaneck",
  "ridgefield",
  "ridgefield park",
  "north bergen",
  "west new york",
  "guttenberg",
  "fairview",
  "palisades park",
  "leonia",
];

function normalizeLocationText(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function toArray(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function locationSearchText(item: WalkingLocation) {
  return normalizeLocationText(
    [
      item.city,
      item.borough,
      item.state,
      item.zip_code,
      item.address,
      ...toArray(item.location_tags),
      ...toArray(item.neighborhood_tags),
      ...toArray(item.area_tags),
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function textIncludesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(normalizeLocationText(term)));
}

function coordinateWalkingArea(item: WalkingLocation): WalkingArea | null {
  const latitude = Number(item.latitude);
  const longitude = Number(item.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  if (
    latitude >= 40.65 &&
    latitude <= 40.95 &&
    longitude >= -74.35 &&
    longitude <= -74.02
  ) {
    return "new_jersey";
  }

  if (
    latitude >= 40.68 &&
    latitude <= 40.9 &&
    longitude >= -74.03 &&
    longitude <= -73.9
  ) {
    return "manhattan";
  }

  if (
    latitude >= 40.48 &&
    latitude <= 40.82 &&
    longitude >= -73.96 &&
    longitude <= -73.68
  ) {
    return "queens";
  }

  return null;
}

export function inferWalkingArea(item: WalkingLocation): WalkingArea | null {
  const text = locationSearchText(item);
  const city = normalizeLocationText(String(item.city || ""));
  const state = normalizeLocationText(String(item.state || ""));
  const borough = normalizeLocationText(String(item.borough || ""));

  if (
    state === "nj" ||
    state === "new jersey" ||
    textIncludesAny(text, NEW_JERSEY_LOCATION_ALIASES)
  ) {
    return "new_jersey";
  }

  if (
    borough.includes("queens") ||
    textIncludesAny(text, QUEENS_LOCATION_ALIASES)
  ) {
    return "queens";
  }

  if (
    borough.includes("manhattan") ||
    city === "new york" ||
    textIncludesAny(text, MANHATTAN_LOCATION_ALIASES)
  ) {
    return "manhattan";
  }

  return coordinateWalkingArea(item);
}

export function isCrossAreaWalkingPair(
  firstLocation: WalkingLocation | null,
  secondLocation: WalkingLocation | null
) {
  if (!firstLocation || !secondLocation) return false;

  const firstArea = inferWalkingArea(firstLocation);
  const secondArea = inferWalkingArea(secondLocation);

  return Boolean(firstArea && secondArea && firstArea !== secondArea);
}
