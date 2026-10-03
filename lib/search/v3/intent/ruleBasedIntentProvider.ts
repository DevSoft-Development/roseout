import type {
  SearchConstraint,
  SearchDomain,
  SearchIntentGraph,
  SearchIntentProvider,
  SearchV3Request,
} from "@/lib/search-framework";

const CUISINES: Readonly<Record<string, readonly string[]>> = {
  italian: ["italian"],
  mexican: ["mexican"],
  japanese: ["japanese"],
  sushi: ["sushi"],
  korean: ["korean"],
  chinese: ["chinese"],
  thai: ["thai"],
  vietnamese: ["vietnamese"],
  indian: ["indian"],
  seafood: ["seafood"],
  steakhouse: ["steakhouse", "steak house", "steak"],
  caribbean: ["caribbean"],
  jamaican: ["jamaican"],
  haitian: ["haitian"],
  cuban: ["cuban"],
  dominican: ["dominican"],
  "puerto rican": ["puerto rican"],
  peruvian: ["peruvian"],
  halal: ["halal"],
  kosher: ["kosher"],
  vegan: ["vegan"],
  vegetarian: ["vegetarian"],
};

const FOODS: Readonly<Record<string, readonly string[]>> = {
  wings: ["wings", "chicken wings"],
  chicken: ["chicken", "fried chicken"],
  burgers: ["burger", "burgers"],
  ramen: ["ramen"],
  pizza: ["pizza"],
  tacos: ["taco", "tacos"],
  steak: ["steak", "ribeye", "porterhouse", "filet", "tomahawk"],
  sushi: ["sushi", "sashimi", "omakase", "nigiri"],
  seafood: ["seafood", "lobster", "crab", "shrimp", "oyster"],
};

const ACTIVITIES: Readonly<Record<string, readonly string[]>> = {
  bowling: ["bowling"],
  arcade: ["arcade"],
  museum: ["museum"],
  karaoke: ["karaoke"],
  "escape room": ["escape room"],
  "mini golf": ["mini golf", "putt putt"],
  "axe throwing": ["axe throwing"],
  comedy: ["comedy", "stand up", "stand-up"],
  cinema: ["cinema", "movie", "movies"],
  spa: ["spa", "massage"],
  billiards: ["billiards", "pool hall"],
  "live music": ["live music", "jazz"],
  nightclub: ["nightclub", "club"],
  hookah: ["hookah", "shisha"],
  rooftop: ["rooftop", "roof top"],
  lounge: ["lounge"],
  bar: ["bar", "drinks", "cocktails"],
  park: ["park"],
  gallery: ["gallery", "art gallery"],
  theater: ["theater", "theatre", "broadway"],
};

const FEATURES: Readonly<Record<string, readonly string[]>> = {
  rooftop: ["rooftop", "roof top", "roof deck"],
  waterfront: ["waterfront", "water view", "water views"],
  "outdoor seating": ["outdoor seating", "patio", "terrace"],
  "live music": ["live music", "jazz"],
  hookah: ["hookah", "shisha"],
  romantic: ["romantic"],
  "private room": ["private room"],
};

const MEALS: Readonly<Record<string, readonly string[]>> = {
  breakfast: ["breakfast"],
  brunch: ["brunch"],
  lunch: ["lunch"],
  dinner: ["dinner", "dining"],
  dessert: ["dessert"],
  coffee: ["coffee", "cafe"],
  "late night": ["late night", "late-night"],
};

const RESTAURANT_TERMS = [
  "restaurant", "dinner", "dining", "breakfast", "brunch", "lunch",
  "food", "eat", "cuisine", "steakhouse", "seafood", "sushi", "ramen",
];

const ACTIVITY_TERMS = [
  "activity", "things to do", "bowling", "arcade", "museum", "karaoke",
  "escape room", "mini golf", "axe throwing", "comedy", "cinema",
  "movie", "spa", "billiards", "live music", "nightclub", "hookah",
];

export class RuleBasedSearchV3IntentProvider implements SearchIntentProvider {
  readonly providerId = "search-v3.rule-intent.v1";

  async parse(request: SearchV3Request): Promise<SearchIntentGraph> {
    const rawQuery = request.query.trim();
    const q = normalize(rawQuery);
    const constraints: SearchConstraint[] = [];

    const cuisine = detectFirst(q, CUISINES);
    if (cuisine) constraints.push(hard("cuisine", cuisine));

    const food = detectFirst(q, FOODS);
    if (food) constraints.push(hard("food", food));

    const meal = detectFirst(q, MEALS);
    if (meal) constraints.push(hard("meal_period", meal));

    const feature = detectFirst(q, FEATURES);
    if (feature) constraints.push(hard("feature", feature));

    const activity = detectFirst(q, ACTIVITIES);
    if (activity) constraints.push(hard("activity_type", activity));

    const geo = extractGeo(rawQuery);
    if (geo) constraints.push(hard(geo.key, geo.value));

    const domains = detectDomains(q, Boolean(activity));
    const anchorLabel = extractAnchorLabel(rawQuery);

    return {
      contractVersion: "search-intent-v3-alpha.1",
      rawQuery,
      domains,
      primaryDomain: domains[0] ?? null,
      constraints,
      anchor: anchorLabel ? {
        entityId: null,
        label: anchorLabel,
        entityType: "unknown",
        latitude: null,
        longitude: null,
        confidence: 0.7,
      } : null,
      travelMode: /\b(walk|walking|walkable)\b/i.test(rawQuery)
        ? "walking"
        : /\bdrive|driving\b/i.test(rawQuery)
          ? "driving"
          : /\btrain|subway|transit\b/i.test(rawQuery)
            ? "transit"
            : "unspecified",
      maxTravelMinutes: extractTravelMinutes(rawQuery),
      occasion: extractOccasion(q),
      partySize: extractPartySize(q),
      sequencing: detectSequencing(q),
      ambiguity: {
        requiresClarification: domains.length === 0,
        unresolved: domains.length === 0 ? ["domain"] : [],
      },
      metadata: {
        parser: this.providerId,
        parserMode: "deterministic",
        selectedMarketId: request.selectedMarketId ?? null,
      },
    };
  }
}

function hard<T>(key: string, value: T): SearchConstraint<T> {
  return { key, value, strength: "hard", source: "explicit", confidence: 1 };
}

function detectDomains(q: string, activityDetected: boolean): SearchDomain[] {
  const restaurant = RESTAURANT_TERMS.some((term) => hasPhrase(q, term));
  const activity = activityDetected || ACTIVITY_TERMS.some((term) => hasPhrase(q, term));
  const nightlife = /\b(nightlife|nightclub|club|hookah|lounge|bar|cocktails?|drinks?)\b/.test(q);
  const domains: SearchDomain[] = [];
  if (restaurant) domains.push("restaurant");
  if (activity) domains.push("activity");
  if (nightlife) domains.push("nightlife");
  if (domains.length === 0 && /\b(date night|night out|girls night|outing)\b/.test(q)) {
    return ["restaurant", "activity"];
  }
  return [...new Set(domains)];
}

function detectFirst(q: string, dictionary: Readonly<Record<string, readonly string[]>>): string | null {
  for (const [canonical, terms] of Object.entries(dictionary)) {
    if (terms.some((term) => hasPhrase(q, term))) return canonical;
  }
  return null;
}

function hasPhrase(q: string, phrase: string): boolean {
  const padded = " " + q + " ";
  const needle = " " + normalize(phrase) + " ";
  return padded.includes(needle);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s-]+/g, " ").replace(/\s+/g, " ").trim();
}

function extractAnchorLabel(query: string): string | null {
  const match = query.match(/\b(?:near|around|close to|close by|walking distance from|by|before|after)\s+([^,.;!?]+?)(?=\s+(?:for|with|and|then)\b|$)/i);
  return match?.[1]?.trim() || null;
}

function extractTravelMinutes(query: string): number | null {
  const match = query.match(/\b(?:within|under|max(?:imum)?\s*)?(\d{1,2})\s*(?:min|mins|minute|minutes)\b/i);
  return match ? Math.min(60, Math.max(1, Number(match[1]))) : null;
}

function extractPartySize(q: string): number | null {
  const match = q.match(/\b(?:for|party of)\s+(\d{1,2})\b/);
  return match ? Math.min(50, Math.max(1, Number(match[1]))) : null;
}

function extractOccasion(q: string): string | null {
  const match = q.match(/\b(date night|birthday|anniversary|girls night|business dinner|first date)\b/);
  return match?.[1] ?? null;
}

function detectSequencing(q: string): SearchIntentGraph["sequencing"] {
  if (/\b(?:same place|same venue|under one roof)\b/.test(q)) return "same_venue";
  if (/\bbefore\b/.test(q)) return "before";
  if (/\bafter\b/.test(q)) return "after";
  if (/\bthen\b/.test(q)) return "then";
  return "single";
}

function extractGeo(query: string): { key: string; value: string } | null {
  const zip = query.match(/\b(\d{5})\b/);
  if (zip) return { key: "zip_code", value: zip[1] };
  const borough = query.match(/\b(?:in|near|around)\s+(Manhattan|Brooklyn|Queens|Bronx|Staten Island)\b/i);
  return borough ? { key: "borough", value: borough[1] } : null;
}
