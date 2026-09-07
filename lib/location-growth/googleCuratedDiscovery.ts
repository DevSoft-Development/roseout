import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getPlaceDetailsLegacyCompat,
  publicGooglePlacePhotoUrl,
  searchPlacesTextLegacyCompat,
  type GooglePlaceLegacyCompat,
} from "@/lib/google/places-new-client";
import {
  parseGoogleAddressComponents,
  validatePlaceForMarket,
} from "@/lib/location-market-validation";
import {
  normalizeMarketKey,
  type CanonicalMarketKey,
} from "@/lib/location-markets";
import { calculateStagingQuality } from "@/lib/location-growth/stagingQuality";
import { publishReadyStagedLocations } from "@/lib/location-growth/publishReady";
import {
  evaluateGoogleDiscoveryCandidate,
  type GoogleDiscoveryKind,
} from "@/lib/location-growth/googleDiscoveryQuality";
import {
  googleCandidateMemoryKey,
  isGoogleCostControlError,
  readCandidateMemory,
  writeCandidateMemory,
} from "@/lib/google/google-places-cost-control";
import { importOsmActivities } from "@/lib/location-growth/osmActivities";
import { importNycRestaurants } from "@/lib/location-growth/nycOpenData";

const SOURCE = "google_curated_discovery";
const PIPELINE = "gap_driven_v2_enriched";

const MARKET_AREAS: Record<CanonicalMarketKey, string[]> = {
  NYC_CORE: [
    "Harlem",
    "Washington Heights",
    "Upper West Side",
    "Upper East Side",
    "Midtown Manhattan",
    "Hell's Kitchen",
    "Chelsea Manhattan",
    "Greenwich Village",
    "East Village",
    "Lower East Side",
    "SoHo",
    "Tribeca",
    "Financial District Manhattan",
    "Williamsburg Brooklyn",
    "Greenpoint Brooklyn",
    "Bushwick Brooklyn",
    "Downtown Brooklyn",
    "Brooklyn Heights",
    "Park Slope",
    "Prospect Heights Brooklyn",
    "Crown Heights Brooklyn",
    "Bedford-Stuyvesant Brooklyn",
    "Fort Greene Brooklyn",
    "DUMBO Brooklyn",
    "Bay Ridge Brooklyn",
    "Sunset Park Brooklyn",
    "Flatbush Brooklyn",
    "Coney Island Brooklyn",
    "Long Island City Queens",
    "Astoria Queens",
    "Sunnyside Queens",
    "Woodside Queens",
    "Jackson Heights Queens",
    "Elmhurst Queens",
    "Forest Hills Queens",
    "Rego Park Queens",
    "Flushing Queens",
    "Bayside Queens",
    "Jamaica Queens",
    "Kew Gardens Queens",
    "Richmond Hill Queens",
    "Ozone Park Queens",
    "Howard Beach Queens",
    "Mott Haven Bronx",
    "Fordham Bronx",
    "Belmont Bronx",
    "Riverdale Bronx",
    "City Island Bronx",
    "Pelham Bay Bronx",
    "St. George Staten Island",
    "Stapleton Staten Island",
    "New Dorp Staten Island",
    "Great Kills Staten Island",
  ],
  LONG_ISLAND: [
    "Great Neck NY",
    "Mineola NY",
    "Garden City NY",
    "Westbury NY",
    "Hicksville NY",
    "Farmingdale NY",
    "Massapequa NY",
    "Rockville Centre NY",
    "Long Beach NY",
    "Freeport NY",
    "Huntington NY",
    "Melville NY",
    "Commack NY",
    "Smithtown NY",
    "Hauppauge NY",
    "Bay Shore NY",
    "Islip NY",
    "Patchogue NY",
    "Port Jefferson NY",
  ],
  NORTHERN_NJ: [
    "Jersey City NJ",
    "Hoboken NJ",
    "Newark NJ",
    "Montclair NJ",
    "Edgewater NJ",
    "Fort Lee NJ",
    "Englewood NJ",
    "Rutherford NJ",
    "Hackensack NJ",
    "Bloomfield NJ",
    "Clifton NJ",
    "Paramus NJ",
  ],
  WESTCHESTER: [
    "Yonkers NY",
    "New Rochelle NY",
    "Mount Vernon NY",
    "White Plains NY",
    "Scarsdale NY",
    "Mamaroneck NY",
    "Larchmont NY",
    "Rye NY",
    "Port Chester NY",
    "Tarrytown NY",
    "Dobbs Ferry NY",
    "Peekskill NY",
  ],
  CONNECTICUT: ["Stamford CT", "Norwalk CT", "Greenwich CT"],
  UNKNOWN: [],
};

const ACTIVE_DISCOVERY_MARKETS: CanonicalMarketKey[] = [
  "NYC_CORE",
  "LONG_ISLAND",
  "NORTHERN_NJ",
  "WESTCHESTER",
];

type DiscoveryLane = "core" | "curated";

type CatalogEntry = {
  category: string;
  query: string;
  matchTerms: string[];
  targetPerArea: number;
  lane: DiscoveryLane;
};

const RESTAURANT_CATALOG: CatalogEntry[] = [
  { category: "restaurant", query: "restaurant", matchTerms: ["restaurant"], targetPerArea: 8, lane: "core" },
  { category: "rooftop", query: "rooftop restaurant", matchTerms: ["rooftop"], targetPerArea: 3, lane: "core" },
  { category: "waterfront", query: "waterfront restaurant", matchTerms: ["waterfront", "water view"], targetPerArea: 3, lane: "core" },
  { category: "fine_dining", query: "fine dining restaurant", matchTerms: ["fine dining", "fine_dining"], targetPerArea: 4, lane: "core" },
  { category: "birthday", query: "birthday dinner restaurant", matchTerms: ["birthday", "celebration"], targetPerArea: 4, lane: "core" },
  { category: "live_music", query: "live music restaurant", matchTerms: ["live music", "jazz"], targetPerArea: 3, lane: "core" },
  { category: "steakhouse", query: "steakhouse", matchTerms: ["steakhouse", "steak house"], targetPerArea: 4, lane: "core" },
  { category: "seafood", query: "seafood restaurant", matchTerms: ["seafood"], targetPerArea: 4, lane: "core" },
  { category: "japanese", query: "sushi Japanese restaurant", matchTerms: ["sushi", "japanese", "omakase", "izakaya"], targetPerArea: 5, lane: "core" },
  { category: "italian", query: "Italian restaurant", matchTerms: ["italian", "pasta", "trattoria"], targetPerArea: 5, lane: "core" },
  { category: "mexican", query: "Mexican restaurant", matchTerms: ["mexican", "taqueria"], targetPerArea: 4, lane: "core" },
  { category: "korean", query: "Korean restaurant", matchTerms: ["korean"], targetPerArea: 3, lane: "core" },
  { category: "thai", query: "Thai restaurant", matchTerms: ["thai"], targetPerArea: 3, lane: "core" },
  { category: "vietnamese", query: "Vietnamese restaurant", matchTerms: ["vietnamese", "pho"], targetPerArea: 3, lane: "core" },
  { category: "chinese", query: "Chinese restaurant", matchTerms: ["chinese", "szechuan", "sichuan", "cantonese"], targetPerArea: 4, lane: "core" },
  { category: "indian", query: "Indian restaurant", matchTerms: ["indian"], targetPerArea: 3, lane: "core" },
  { category: "mediterranean", query: "Mediterranean restaurant", matchTerms: ["mediterranean", "greek"], targetPerArea: 3, lane: "core" },
  { category: "french", query: "French restaurant", matchTerms: ["french", "bistro", "brasserie"], targetPerArea: 3, lane: "core" },
  { category: "latin", query: "Latin restaurant", matchTerms: ["latin", "peruvian", "cuban", "dominican", "puerto rican"], targetPerArea: 4, lane: "core" },
  { category: "caribbean", query: "Caribbean restaurant", matchTerms: ["caribbean", "jamaican", "haitian"], targetPerArea: 4, lane: "core" },
  { category: "soul_food", query: "soul food restaurant", matchTerms: ["soul food", "southern"], targetPerArea: 3, lane: "core" },
  { category: "bbq", query: "BBQ restaurant", matchTerms: ["bbq", "barbecue"], targetPerArea: 3, lane: "core" },
  { category: "halal", query: "halal restaurant", matchTerms: ["halal"], targetPerArea: 3, lane: "core" },
  { category: "vegan", query: "vegan restaurant", matchTerms: ["vegan", "plant based"], targetPerArea: 3, lane: "core" },
  { category: "brunch", query: "brunch restaurant", matchTerms: ["brunch", "breakfast"], targetPerArea: 4, lane: "core" },
  { category: "wine_bar", query: "wine bar with food", matchTerms: ["wine bar", "wine"], targetPerArea: 3, lane: "core" },
  { category: "hidden_gem", query: "hidden gem neighborhood restaurant", matchTerms: ["hidden gem", "local favorite", "neighborhood favorite"], targetPerArea: 3, lane: "curated" },
  { category: "date_night", query: "date night restaurant", matchTerms: ["date night", "romantic"], targetPerArea: 4, lane: "curated" },
  { category: "private_dining", query: "private dining restaurant", matchTerms: ["private dining", "private room"], targetPerArea: 3, lane: "curated" },
  { category: "chef_driven", query: "chef driven restaurant", matchTerms: ["chef driven", "chef-owned", "chef owned"], targetPerArea: 2, lane: "curated" },
  { category: "intimate", query: "intimate cozy restaurant", matchTerms: ["intimate", "cozy"], targetPerArea: 3, lane: "curated" },
  { category: "tasting_menu", query: "tasting menu restaurant", matchTerms: ["tasting menu", "prix fixe"], targetPerArea: 2, lane: "curated" },
  { category: "cocktail_restaurant", query: "restaurant with craft cocktails", matchTerms: ["cocktail", "mixology"], targetPerArea: 3, lane: "curated" },
];

const ACTIVITY_CATALOG: CatalogEntry[] = [
  { category: "bar", query: "bar", matchTerms: ["bar", "pub"], targetPerArea: 6, lane: "core" },
  { category: "cocktail_bar", query: "cocktail bar", matchTerms: ["cocktail bar", "cocktail", "mixology"], targetPerArea: 4, lane: "core" },
  { category: "lounge", query: "lounge", matchTerms: ["lounge"], targetPerArea: 4, lane: "core" },
  { category: "rooftop_bar", query: "rooftop bar lounge", matchTerms: ["rooftop"], targetPerArea: 3, lane: "core" },
  { category: "hookah", query: "hookah shisha lounge", matchTerms: ["hookah", "shisha"], targetPerArea: 4, lane: "core" },
  { category: "nightclub", query: "nightclub", matchTerms: ["nightclub", "night club", "dance club"], targetPerArea: 3, lane: "core" },
  { category: "sports_bar", query: "sports bar", matchTerms: ["sports bar", "watch sports"], targetPerArea: 3, lane: "core" },
  { category: "wine_bar", query: "wine bar", matchTerms: ["wine bar"], targetPerArea: 3, lane: "core" },
  { category: "cigar_lounge", query: "cigar lounge", matchTerms: ["cigar", "cigar lounge"], targetPerArea: 2, lane: "core" },
  { category: "billiards", query: "billiards pool hall", matchTerms: ["billiards", "pool hall"], targetPerArea: 3, lane: "core" },
  { category: "escape_room", query: "escape room", matchTerms: ["escape room"], targetPerArea: 3, lane: "core" },
  { category: "bowling", query: "bowling alley", matchTerms: ["bowling"], targetPerArea: 3, lane: "core" },
  { category: "arcade", query: "arcade bar", matchTerms: ["arcade"], targetPerArea: 3, lane: "core" },
  { category: "mini_golf", query: "mini golf", matchTerms: ["mini golf"], targetPerArea: 2, lane: "core" },
  { category: "axe_throwing", query: "axe throwing", matchTerms: ["axe throwing"], targetPerArea: 2, lane: "core" },
  { category: "karaoke", query: "karaoke lounge", matchTerms: ["karaoke"], targetPerArea: 3, lane: "core" },
  { category: "comedy", query: "comedy club", matchTerms: ["comedy"], targetPerArea: 2, lane: "core" },
  { category: "live_music", query: "live music jazz venue", matchTerms: ["live music", "jazz", "music venue"], targetPerArea: 4, lane: "core" },
  { category: "spa", query: "spa wellness bath house", matchTerms: ["spa", "wellness", "sauna", "bath house"], targetPerArea: 3, lane: "core" },
  { category: "museum", query: "museum", matchTerms: ["museum"], targetPerArea: 3, lane: "core" },
  { category: "art_gallery", query: "art gallery", matchTerms: ["art gallery", "gallery"], targetPerArea: 3, lane: "core" },
  { category: "indoor_golf", query: "indoor golf simulator", matchTerms: ["indoor golf", "golf simulator"], targetPerArea: 2, lane: "core" },
  { category: "go_kart", query: "go kart racing", matchTerms: ["go kart"], targetPerArea: 2, lane: "core" },
  { category: "speakeasy", query: "speakeasy hidden cocktail bar", matchTerms: ["speakeasy", "hidden bar", "secret bar"], targetPerArea: 3, lane: "curated" },
  { category: "immersive", query: "immersive experience", matchTerms: ["immersive"], targetPerArea: 2, lane: "curated" },
  { category: "paint_and_sip", query: "paint and sip", matchTerms: ["paint and sip"], targetPerArea: 2, lane: "curated" },
  { category: "pottery", query: "pottery class studio", matchTerms: ["pottery", "ceramics"], targetPerArea: 2, lane: "curated" },
  { category: "candle_making", query: "candle making class", matchTerms: ["candle making"], targetPerArea: 2, lane: "curated" },
  { category: "glassblowing", query: "glassblowing class", matchTerms: ["glassblowing", "glass blowing"], targetPerArea: 1, lane: "curated" },
  { category: "tufting", query: "rug tufting workshop", matchTerms: ["tufting", "rug making"], targetPerArea: 1, lane: "curated" },
  { category: "perfume_making", query: "perfume making workshop", matchTerms: ["perfume making", "fragrance workshop"], targetPerArea: 1, lane: "curated" },
  { category: "jewelry_making", query: "jewelry making workshop", matchTerms: ["jewelry making", "jewelry workshop"], targetPerArea: 1, lane: "curated" },
  { category: "cooking_class", query: "cooking class", matchTerms: ["cooking class", "cooking school"], targetPerArea: 2, lane: "curated" },
  { category: "pasta_making", query: "pasta making class", matchTerms: ["pasta making"], targetPerArea: 1, lane: "curated" },
  { category: "sushi_class", query: "sushi making class", matchTerms: ["sushi making"], targetPerArea: 1, lane: "curated" },
  { category: "mixology_class", query: "mixology cocktail class", matchTerms: ["mixology class", "cocktail class"], targetPerArea: 1, lane: "curated" },
  { category: "chocolate_making", query: "chocolate making class", matchTerms: ["chocolate making"], targetPerArea: 1, lane: "curated" },
  { category: "rage_room", query: "rage room", matchTerms: ["rage room"], targetPerArea: 1, lane: "curated" },
  { category: "archery", query: "archery range", matchTerms: ["archery"], targetPerArea: 1, lane: "curated" },
  { category: "virtual_reality", query: "virtual reality experience", matchTerms: ["virtual reality", "vr arcade"], targetPerArea: 2, lane: "curated" },
  { category: "racing_simulator", query: "racing simulator experience", matchTerms: ["racing simulator", "sim racing"], targetPerArea: 1, lane: "curated" },
  { category: "woodworking", query: "woodworking class", matchTerms: ["woodworking"], targetPerArea: 1, lane: "curated" },
  { category: "forging", query: "blacksmith forging class", matchTerms: ["blacksmith", "forging"], targetPerArea: 1, lane: "curated" },
  { category: "floral_workshop", query: "flower arranging workshop", matchTerms: ["flower arranging", "floral workshop"], targetPerArea: 1, lane: "curated" },
  { category: "aerial_class", query: "aerial circus class", matchTerms: ["aerial", "circus class"], targetPerArea: 1, lane: "curated" },
];

export type GoogleCuratedDiscoveryOptions = {
  kind: GoogleDiscoveryKind;
  maxPlans?: number;
  resultsPerPlan?: number;
  maxCandidates?: number;
  maxRuntimeMs?: number;
  autoPublish?: boolean;
};

type InventoryRow = {
  market?: string | null;
  city?: string | null;
  borough?: string | null;
  neighborhood?: string | null;
  location_type?: string | null;
  primary_category?: string | null;
  cuisine?: string | null;
  cuisine_type?: string | null;
  activity_type?: string | null;
  primary_tag?: string | null;
  tags?: string[] | null;
  best_for_tags?: string[] | null;
  vibe_tags?: string[] | null;
};

type DiscoveryPlan = {
  market: CanonicalMarketKey;
  area: string;
  lane: DiscoveryLane;
  category: string;
  query: string;
  existingCount: number;
  target: number;
  gapRatio: number;
};

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function normalize(value: unknown) {
  return cleanText(value)
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => cleanText(value)).filter(Boolean)));
}

function rowSearchText(row: InventoryRow) {
  return normalize([
    row.primary_category,
    row.cuisine,
    row.cuisine_type,
    row.activity_type,
    row.primary_tag,
    ...(row.tags || []),
    ...(row.best_for_tags || []),
    ...(row.vibe_tags || []),
  ].join(" "));
}

function catalogFor(kind: GoogleDiscoveryKind) {
  return kind === "restaurant" ? RESTAURANT_CATALOG : ACTIVITY_CATALOG;
}

function daySeed() {
  return Math.floor(Date.now() / 86_400_000);
}

function areaFor(market: CanonicalMarketKey, offset: number) {
  const areas = MARKET_AREAS[market] || [];
  if (!areas.length) return "";
  return areas[(daySeed() + offset) % areas.length];
}

function areaKey(area: string) {
  return normalize(area)
    .replace(/\b(ny|nj|ct)\b$/g, "")
    .replace(/\bmanhattan\b$/g, "")
    .replace(/\bbrooklyn\b$/g, "")
    .replace(/\bqueens\b$/g, "")
    .replace(/\bbronx\b$/g, "")
    .replace(/\bstaten island\b$/g, "")
    .trim();
}

function rowMatchesArea(row: InventoryRow, area: string) {
  const key = areaKey(area);
  if (!key) return true;
  const geography = normalize([row.neighborhood, row.city, row.borough].filter(Boolean).join(" "));
  return geography.includes(key);
}

async function loadPublishedInventory() {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("market,city,borough,neighborhood,location_type,primary_category,cuisine,cuisine_type,activity_type,primary_tag,tags,best_for_tags,vibe_tags")
    .eq("is_searchable", true)
    .or("is_hidden.is.null,is_hidden.eq.false")
    .or("duplicate_status.is.null,duplicate_status.neq.duplicate")
    .limit(10000);

  if (error) throw new Error(`Unable to read discovery inventory: ${error.message}`);
  return (data || []) as InventoryRow[];
}

function compareGap(a: DiscoveryPlan, b: DiscoveryPlan) {
  return a.gapRatio - b.gapRatio || a.existingCount - b.existingCount || a.category.localeCompare(b.category);
}

export async function buildGoogleDiscoveryPlan(
  kind: GoogleDiscoveryKind,
  maxPlans = 6,
): Promise<DiscoveryPlan[]> {
  const inventory = await loadPublishedInventory();
  const catalog = catalogFor(kind);
  const candidates: DiscoveryPlan[] = [];

  for (const market of ACTIVE_DISCOVERY_MARKETS) {
    const marketRows = inventory.filter((row) => {
      if (normalizeMarketKey(row.market) !== market) return false;
      const rowType = normalize(row.location_type);
      return kind === "restaurant"
        ? rowType === "restaurant"
        : rowType === "activity";
    });

    catalog.forEach((entry, index) => {
      const area = areaFor(market, index);
      const areaRows = marketRows.filter((row) => rowMatchesArea(row, area));
      const existingCount = areaRows.filter((row) => {
        const text = rowSearchText(row);
        return entry.matchTerms.some((term) => text.includes(normalize(term)));
      }).length;
      const gapRatio = existingCount / Math.max(1, entry.targetPerArea);
      candidates.push({
        market,
        area,
        lane: entry.lane,
        category: entry.category,
        query: `${entry.query} in ${area}`,
        existingCount,
        target: entry.targetPerArea,
        gapRatio,
      });
    });
  }

  const limit = Math.max(1, maxPlans);
  const selected: DiscoveryPlan[] = [];
  const openCandidates = candidates.filter((candidate) => candidate.gapRatio < 1);

  for (const market of ACTIVE_DISCOVERY_MARKETS) {
    if (selected.length >= limit) break;
    const coreCandidate = candidates
      .filter((candidate) => candidate.market === market && candidate.lane === "core" && candidate.gapRatio < 1)
      .sort(compareGap)[0];
    if (coreCandidate) selected.push(coreCandidate);
  }

  const curatedGoal = Math.min(
    Math.max(0, limit - selected.length),
    Math.max(1, Math.round(limit * 0.35)),
  );
  let curatedAdded = 0;
  for (const market of ACTIVE_DISCOVERY_MARKETS) {
    if (curatedAdded >= curatedGoal || selected.length >= limit) break;
    const curatedCandidate = candidates
      .filter((candidate) => candidate.market === market && candidate.lane === "curated" && candidate.gapRatio < 1)
      .sort(compareGap)[0];
    if (!curatedCandidate) continue;
    selected.push(curatedCandidate);
    curatedAdded += 1;
  }

  for (const candidate of openCandidates.sort(compareGap)) {
    if (selected.length >= limit) break;
    if (selected.some((item) => item.market === candidate.market && item.category === candidate.category)) continue;
    selected.push(candidate);
  }

  return selected.slice(0, limit);
}

function hasHours(place: GooglePlaceLegacyCompat) {
  const values = [
    place.opening_hours,
    place.current_opening_hours,
    place.regularOpeningHours,
    place.business_hours,
    place.hours,
    place.weekday_text,
  ];
  return values.some((value) => {
    if (!value) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return cleanText(value).length > 0;
  });
}

function inferRestaurantCategory(place: GooglePlaceLegacyCompat, fallback: string) {
  const text = normalize([place.name, ...(place.types || [])].join(" "));
  const categories: Array<[RegExp, string]> = [
    [/steak house|steakhouse/, "steakhouse"],
    [/seafood|oyster|lobster|crab/, "seafood"],
    [/sushi|japanese|omakase|izakaya/, "japanese"],
    [/korean/, "korean"],
    [/thai/, "thai"],
    [/vietnamese|pho/, "vietnamese"],
    [/chinese|szechuan|sichuan|cantonese/, "chinese"],
    [/indian/, "indian"],
    [/italian|pizza|pizzeria|pasta|trattoria/, "italian"],
    [/mexican|taco|taqueria/, "mexican"],
    [/latin|peruvian|cuban|dominican|puerto rican/, "latin"],
    [/caribbean|jamaican|haitian/, "caribbean"],
    [/soul food|southern/, "soul_food"],
    [/bbq|barbecue/, "bbq"],
    [/halal/, "halal"],
    [/vegan|plant based/, "vegan"],
    [/brunch|breakfast/, "brunch"],
    [/french|bistro|brasserie/, "french"],
    [/mediterranean|greek/, "mediterranean"],
  ];
  const inferred = categories.find(([pattern]) => pattern.test(text))?.[1];
  if (inferred) return inferred;
  const cuisineFallbacks = new Set([
    "steakhouse", "seafood", "japanese", "italian", "mexican", "korean", "thai",
    "vietnamese", "chinese", "indian", "mediterranean", "french", "latin",
    "caribbean", "soul_food", "bbq", "halal", "vegan", "brunch",
  ]);
  return cuisineFallbacks.has(fallback) ? fallback : "restaurant";
}

function tagsFor(kind: GoogleDiscoveryKind, category: string, place: GooglePlaceLegacyCompat) {
  const types = (place.types || []).map((type) => type.replace(/_/g, " "));
  const firstTimeCategory = [
    "immersive", "paint_and_sip", "pottery", "candle_making", "glassblowing",
    "tufting", "perfume_making", "jewelry_making", "cooking_class", "pasta_making",
    "sushi_class", "mixology_class", "chocolate_making", "rage_room", "archery",
    "virtual_reality", "racing_simulator", "woodworking", "forging", "floral_workshop",
    "aerial_class",
  ].includes(category);
  const nightlifeCategory = [
    "bar", "cocktail_bar", "lounge", "rooftop_bar", "hookah", "speakeasy",
    "nightclub", "sports_bar", "wine_bar", "cigar_lounge", "billiards", "live_music",
  ].includes(category);

  const bestFor = kind === "restaurant"
    ? unique([
        category.includes("birthday") || category.includes("private") ? "birthday" : null,
        category.includes("date") || category.includes("intimate") || category.includes("hidden") || category.includes("rooftop") || category.includes("waterfront") ? "date night" : null,
        category.includes("brunch") ? "brunch" : null,
        place.goodForGroups ? "group outing" : null,
        "dinner",
      ])
    : unique([
        "date night",
        "group outing",
        firstTimeCategory ? "first time friendly" : null,
        firstTimeCategory ? "try something new" : null,
        category.includes("spa") ? "couples" : null,
        nightlifeCategory || category.includes("comedy") || category.includes("karaoke") ? "night out" : null,
      ]);

  const vibes = unique([
    category.includes("rooftop") ? "rooftop" : null,
    category.includes("waterfront") ? "scenic" : null,
    category.includes("fine") || category.includes("tasting") ? "upscale" : null,
    category.includes("live_music") || place.liveMusic ? "live music" : null,
    category.includes("birthday") ? "celebration" : null,
    category.includes("hidden_gem") ? "hidden gem" : null,
    category.includes("intimate") || category.includes("speakeasy") ? "intimate" : null,
    category.includes("speakeasy") ? "speakeasy" : null,
    category.includes("hookah") ? "hookah" : null,
    firstTimeCategory ? "unique experience" : null,
    kind === "activity" ? "interactive" : null,
  ]);

  const featureTags = unique([
    place.reservable ? "reservations" : null,
    place.outdoorSeating ? "outdoor seating" : null,
    place.liveMusic ? "live music" : null,
    place.goodForGroups ? "group friendly" : null,
    place.goodForWatchingSports ? "watch sports" : null,
    place.servesCocktails ? "cocktails" : null,
    place.servesBeer ? "beer" : null,
    place.servesWine ? "wine" : null,
    place.servesBreakfast ? "breakfast" : null,
    place.servesBrunch ? "brunch" : null,
    place.servesLunch ? "lunch" : null,
    place.servesDinner ? "dinner" : null,
    place.servesVegetarianFood ? "vegetarian" : null,
    place.servesDessert ? "dessert" : null,
    place.servesCoffee ? "coffee" : null,
    place.dineIn ? "dine in" : null,
    place.takeout ? "takeout" : null,
    place.delivery ? "delivery" : null,
    place.allowsDogs ? "dog friendly" : null,
  ]);

  return {
    tags: unique([category, ...types, ...featureTags]).slice(0, 36),
    bestFor,
    vibes,
  };
}

async function findLiveDuplicate(placeId: string) {
  const { data: googleMatch, error: googleError } = await supabaseAdmin
    .from("locations")
    .select("id,name")
    .eq("google_place_id", placeId)
    .limit(1);
  if (googleError) throw new Error(`Google Place duplicate lookup failed: ${googleError.message}`);
  if (googleMatch?.[0]) return googleMatch[0];

  const { data: sourceMatch, error: sourceError } = await supabaseAdmin
    .from("locations")
    .select("id,name")
    .eq("import_source_id", placeId)
    .limit(1);
  if (sourceError) throw new Error(`Import source duplicate lookup failed: ${sourceError.message}`);
  return sourceMatch?.[0] || null;
}

function stageStatus(decision: "auto_import" | "review" | "reject", hasPhoto: boolean) {
  if (decision === "auto_import") return "publish_ready";
  if (decision === "review" && !hasPhoto) return "needs_photo";
  if (decision === "review") return "review";
  return "reject";
}

async function stageCandidate({
  batchId,
  kind,
  plan,
  place,
}: {
  batchId: string;
  kind: GoogleDiscoveryKind;
  plan: DiscoveryPlan;
  place: GooglePlaceLegacyCompat;
}) {
  const placeId = cleanText(place.place_id);
  if (!placeId || !place.name) return { outcome: "rejected" as const, reason: "missing_identity" };

  const duplicate = await findLiveDuplicate(placeId);
  const parsed = parseGoogleAddressComponents(place.address_components);
  const address = cleanText(place.formatted_address || place.vicinity);
  const latitude = Number(place.geometry?.location?.lat || 0) || null;
  const longitude = Number(place.geometry?.location?.lng || 0) || null;
  const validation = validatePlaceForMarket({
    requestedMarket: plan.market,
    requestedArea: plan.area,
    formattedAddress: address,
    addressComponents: place.address_components,
    city: parsed.city,
    state: parsed.state,
    county: parsed.county,
    borough: parsed.borough,
    neighborhood: parsed.neighborhood,
    postalCode: parsed.postalCode,
    latitude,
    longitude,
  });

  const firstPhoto = place.photos?.[0];
  const hasGooglePhoto = Boolean(firstPhoto?.photo_reference || firstPhoto?.name);
  const photoRequiresAttribution = Boolean(firstPhoto?.authorAttributions?.length);
  const hasPhoto = hasGooglePhoto && !photoRequiresAttribution;
  const hasPhone = Boolean(place.formatted_phone_number || place.international_phone_number);
  const hasWebsite = Boolean(place.website || place.websiteUri);
  const usableHours = hasHours(place);
  const hasLocation = Boolean(address && parsed.city && parsed.state && latitude && longitude);
  const rating = Number(place.rating || 0);
  const reviewCount = Number(place.user_ratings_total || place.review_count || 0);
  const primaryCategory = kind === "restaurant"
    ? inferRestaurantCategory(place, plan.category)
    : plan.category;
  const tagData = tagsFor(kind, plan.category, place);
  const quality = evaluateGoogleDiscoveryCandidate({
    kind,
    name: place.name,
    query: plan.query,
    category: plan.category,
    rating,
    reviewCount,
    types: place.types || [],
    editorialSummary: place.editorial_summary?.overview || null,
    hasPhoto,
    hasPhone,
    hasWebsite,
    hasHours: usableHours,
    hasLocation,
  });

  const invalidMarket = !validation.ok;
  const decision = duplicate || invalidMarket ? "reject" : quality.decision;
  const rejectionReasons = unique([
    duplicate ? "duplicate_existing_location" : null,
    invalidMarket ? validation.reason || "wrong_market" : null,
    photoRequiresAttribution ? "google_photo_requires_attribution" : null,
    ...(decision === "reject" ? quality.reasons : []),
  ]);

  const imageUrl = hasPhoto ? publicGooglePlacePhotoUrl(placeId) : null;
  const baseRow: Record<string, unknown> = {
    batch_id: batchId,
    source: SOURCE,
    source_id: placeId,
    source_url: place.url || place.googleMapsUri || null,
    location_type: kind,
    name: place.name,
    restaurant_name: kind === "restaurant" ? place.name : null,
    activity_name: kind === "activity" ? place.name : null,
    address,
    city: parsed.city || null,
    state: parsed.state || null,
    zip_code: parsed.postalCode || null,
    phone: place.formatted_phone_number || place.international_phone_number || null,
    website: place.website || place.websiteUri || null,
    latitude,
    longitude,
    primary_category: primaryCategory,
    cuisine: kind === "restaurant" ? primaryCategory : null,
    cuisine_type: kind === "restaurant" ? primaryCategory : null,
    activity_type: kind === "activity" ? plan.category : null,
    primary_tag: plan.category,
    tags: tagData.tags,
    vibe_tags: tagData.vibes,
    best_for_tags: tagData.bestFor,
    search_keywords: unique([place.name, plan.query, plan.category, primaryCategory, ...tagData.tags, ...tagData.bestFor, ...tagData.vibes]).slice(0, 45),
    google_types: place.types || [],
    rating,
    review_count: reviewCount,
    main_image: imageUrl,
    images: imageUrl ? [imageUrl] : [],
    description: place.editorial_summary?.overview || null,
    raw_payload: {
      provider: "google_places_new",
      query: plan.query,
      market: plan.market,
      area: plan.area,
      lane: plan.lane,
      parsedAddress: parsed,
      photoPolicy: {
        hasGooglePhoto,
        photoRequiresAttribution,
        displayMode: hasPhoto ? "live_place_id_proxy" : "manual_review",
      },
      gap: {
        category: plan.category,
        existingCount: plan.existingCount,
        target: plan.target,
        gapRatio: plan.gapRatio,
      },
      quality: {
        ...quality,
        effectiveDecision: decision,
        marketValidation: validation,
      },
      google: place,
    },
    duplicate_status: duplicate ? "duplicate" : "unique",
    matched_location_id: duplicate?.id || null,
    quality_score: quality.score,
    quality_status: stageStatus(decision, hasPhoto),
    import_status: duplicate ? "duplicate" : decision === "reject" ? "rejected" : "staged",
    rejection_reason: rejectionReasons.length ? rejectionReasons.join(",") : null,
    has_photos: hasPhoto,
    photo_status: hasPhoto
      ? "google_live_proxy"
      : photoRequiresAttribution
        ? "requires_attribution_review"
        : "missing_photo",
    curation_tier: decision === "auto_import" ? "curated" : decision === "review" ? "review" : "rejected",
    public_visibility_tier: decision === "reject" ? "hidden" : "standard",
    is_low_level: decision === "reject" && (quality.quickService || Boolean(quality.chainBrand)),
    low_level_reason: decision === "reject" ? rejectionReasons.join(",") || null : null,
    low_level_detected_at: decision === "reject" ? new Date().toISOString() : null,
    low_level_source: decision === "reject" ? "google_curated_discovery" : null,
    import_confidence: decision === "auto_import" ? "high" : decision === "review" ? "medium" : "low",
    source_quality_status: decision === "auto_import"
      ? "curated_google"
      : decision === "review"
        ? "curated_google_review"
        : "curated_google_rejected",
    updated_at: new Date().toISOString(),
  };

  const normalized = calculateStagingQuality(baseRow);
  const row = {
    ...baseRow,
    normalized_name: normalized.normalized_name,
    normalized_address: normalized.normalized_address,
    normalized_phone: normalized.normalized_phone,
    location_key: normalized.location_key,
  };

  const { error } = await supabaseAdmin
    .from("location_import_staging")
    .upsert(row, { onConflict: "source,source_id", ignoreDuplicates: false });
  if (error) throw new Error(`Unable to stage ${place.name}: ${error.message}`);

  if (duplicate) return { outcome: "duplicate" as const, reason: "duplicate_existing_location" };
  if (decision === "auto_import") return { outcome: "auto_import" as const, score: quality.score };
  if (decision === "review") return { outcome: "review" as const, score: quality.score };
  return { outcome: "rejected" as const, score: quality.score, reason: rejectionReasons.join(",") };
}

async function backfillPublishedGooglePlaceIds() {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("id,import_source_id")
    .eq("import_source", SOURCE)
    .is("google_place_id", null)
    .not("import_source_id", "is", null)
    .limit(100);
  if (error) throw new Error(`Unable to find published Google candidates: ${error.message}`);

  let updated = 0;
  for (const row of data || []) {
    const { error: updateError } = await supabaseAdmin
      .from("locations")
      .update({ google_place_id: row.import_source_id })
      .eq("id", row.id)
      .is("google_place_id", null);
    if (!updateError) updated += 1;
  }
  return updated;
}

async function runNonGoogleBudgetFallback(kind: GoogleDiscoveryKind) {
  try {
    if (kind === "activity") {
      const result = await importOsmActivities({
        limit: 25,
        categoryGroup: "all",
        filterIndex: daySeed() % 8,
      });
      return { provider: "openstreetmap", success: true, result };
    }
    const result = await importNycRestaurants({
      limit: 100,
      offset: (daySeed() % 20) * 100,
    });
    return { provider: "nyc_open_data", success: true, result };
  } catch (error) {
    return {
      provider: kind === "activity" ? "openstreetmap" : "nyc_open_data",
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runGoogleCuratedDiscovery(
  options: GoogleCuratedDiscoveryOptions,
) {
  const kind = options.kind;
  const maxPlans = Math.min(10, Math.max(1, Number(options.maxPlans || 6)));
  const resultsPerPlan = Math.min(12, Math.max(1, Number(options.resultsPerPlan || 8)));
  const maxCandidates = Math.min(80, Math.max(1, Number(options.maxCandidates || 40)));
  const maxRuntimeMs = Math.min(270_000, Math.max(30_000, Number(options.maxRuntimeMs || 240_000)));
  const autoPublish = options.autoPublish !== false;
  const startedAtMs = Date.now();
  const jobKey = `curated-location-discovery-${kind}`;
  const plans = await buildGoogleDiscoveryPlan(kind, maxPlans);

  const { data: batch, error: batchError } = await supabaseAdmin
    .from("location_import_batches")
    .insert({
      source: SOURCE,
      source_label: `Curated Google ${kind} discovery`,
      status: "running",
      metadata: { kind, plans, autoPublish, pipeline: PIPELINE },
    })
    .select("id")
    .single();
  if (batchError || !batch?.id) {
    throw new Error(`Unable to create Google discovery batch: ${batchError?.message || "missing batch id"}`);
  }

  const counts = {
    checked: 0,
    staged: 0,
    autoImport: 0,
    review: 0,
    rejected: 0,
    duplicates: 0,
    failed: 0,
    published: 0,
    memorySkips: 0,
    paidDetailsAvoided: 0,
    budgetBlocks: 0,
  };
  const errors: string[] = [];
  const seen = new Set<string>();
  let budgetFallbackReason: string | null = null;
  let fallback: Awaited<ReturnType<typeof runNonGoogleBudgetFallback>> | null = null;

  try {
    outer: for (const plan of plans) {
      if (Date.now() - startedAtMs >= maxRuntimeMs) break;
      let searchResults: GooglePlaceLegacyCompat[] = [];
      try {
        searchResults = (await searchPlacesTextLegacyCompat(plan.query, {
          fieldMode: "ids-only",
          pageSize: resultsPerPlan,
          regionCode: "US",
          jobKey,
          priority: "low",
          cacheTtlDays: 14,
        })).slice(0, resultsPerPlan);
      } catch (error) {
        counts.failed += 1;
        errors.push(`${plan.query}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }

      for (const searchResult of searchResults) {
        if (Date.now() - startedAtMs >= maxRuntimeMs || counts.checked >= maxCandidates) break outer;
        const placeId = cleanText(searchResult.place_id);
        if (!placeId || seen.has(placeId)) continue;
        seen.add(placeId);
        counts.checked += 1;

        const memoryKey = googleCandidateMemoryKey({
          placeId,
          jobKey,
          market: plan.market,
          area: plan.area,
          category: plan.category,
        });
        const memory = await readCandidateMemory(memoryKey);
        if (memory) {
          counts.memorySkips += 1;
          counts.paidDetailsAvoided += 1;
          continue;
        }

        try {
          const duplicate = await findLiveDuplicate(placeId);
          if (duplicate) {
            counts.duplicates += 1;
            counts.paidDetailsAvoided += 1;
            await writeCandidateMemory({
              memoryKey, placeId, jobKey, market: plan.market, area: plan.area, category: plan.category,
              outcome: "duplicate", ttlDays: 90, metadata: { matchedLocationId: duplicate.id },
            });
            continue;
          }

          const details = await getPlaceDetailsLegacyCompat(placeId, {
            fieldMode: "rich",
            jobKey,
            priority: "low",
          });
          const place = { ...searchResult, ...details };
          if (place.business_status && place.business_status !== "OPERATIONAL") {
            counts.rejected += 1;
            await writeCandidateMemory({
              memoryKey, placeId, jobKey, market: plan.market, area: plan.area, category: plan.category,
              outcome: "not_operational", ttlDays: 90,
            });
            continue;
          }
          const result = await stageCandidate({ batchId: batch.id, kind, plan, place });
          if (result.outcome === "duplicate") counts.duplicates += 1;
          if (result.outcome === "auto_import") {
            counts.autoImport += 1;
            counts.staged += 1;
          }
          if (result.outcome === "review") {
            counts.review += 1;
            counts.staged += 1;
          }
          if (result.outcome === "rejected") counts.rejected += 1;
          await writeCandidateMemory({
            memoryKey, placeId, jobKey, market: plan.market, area: plan.area, category: plan.category,
            outcome: result.outcome,
            ttlDays: result.outcome === "auto_import" ? 180 : result.outcome === "duplicate" ? 90 : result.outcome === "rejected" ? 30 : 14,
            metadata: { reason: "reason" in result ? result.reason : null },
          });
        } catch (error) {
          if (isGoogleCostControlError(error)) {
            counts.budgetBlocks += 1;
            budgetFallbackReason = error.reason || "google_budget_control";
            break outer;
          }
          counts.failed += 1;
          await writeCandidateMemory({
            memoryKey, placeId, jobKey, market: plan.market, area: plan.area, category: plan.category,
            outcome: "failed", ttlDays: 7, metadata: { error: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300) },
          });
          errors.push(`${searchResult.name || placeId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    if (budgetFallbackReason) {
      fallback = await runNonGoogleBudgetFallback(kind);
    }

    if (autoPublish && counts.autoImport > 0) {
      const publish = await publishReadyStagedLocations({
        limit: Math.min(100, Math.max(1, counts.autoImport)),
        batchId: batch.id,
      });
      counts.published = publish.markedPublished;
      errors.push(...publish.errors);
      await backfillPublishedGooglePlaceIds();
    }

    await supabaseAdmin
      .from("location_import_batches")
      .update({
        status: errors.length && counts.checked === 0 ? "failed" : errors.length ? "completed_with_errors" : "completed",
        total_seen: counts.checked,
        total_staged: counts.staged,
        total_duplicates: counts.duplicates,
        total_rejected: counts.rejected,
        total_publish_ready: counts.autoImport,
        total_published: counts.published,
        completed_at: new Date().toISOString(),
        error_message: errors.length ? errors.slice(0, 8).join("; ") : null,
        metadata: {
          kind,
          plans,
          autoPublish,
          pipeline: PIPELINE,
          counts,
          errors: errors.slice(0, 20),
          budgetFallbackReason,
          fallback,
        },
      })
      .eq("id", batch.id);

    return {
      success: counts.failed === 0 || counts.checked > 0,
      batchId: batch.id,
      kind,
      pipeline: PIPELINE,
      plans,
      counts,
      errors: errors.slice(0, 20),
      budgetFallbackReason,
      fallback,
      durationMs: Date.now() - startedAtMs,
    };
  } catch (error) {
    await supabaseAdmin
      .from("location_import_batches")
      .update({
        status: "failed",
        total_seen: counts.checked,
        total_staged: counts.staged,
        total_duplicates: counts.duplicates,
        total_rejected: counts.rejected,
        total_publish_ready: counts.autoImport,
        total_published: counts.published,
        completed_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : String(error),
        metadata: { kind, plans, counts, errors: errors.slice(0, 20), pipeline: PIPELINE, budgetFallbackReason, fallback },
      })
      .eq("id", batch.id);
    throw error;
  }
}
