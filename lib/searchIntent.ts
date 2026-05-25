export type CanonicalIntentMode =
  | "restaurant_only"
  | "activity_only"
  | "full_outing"
  | "location_lookup"
  | "off_topic";

export type CanonicalSearchIntent = {
  version: string;
  rawInput: string;
  normalizedInput: string;
  mode: CanonicalIntentMode;
  wantsFood: boolean;
  wantsActivity: boolean;
  wantsRestaurant: boolean;
  wantsFullOuting: boolean;
  foodIntents: string[];
  primaryMealIntents: string[];
  foodAddOnIntents: string[];
  activityIntents: string[];
  primaryActivityIntents: string[];
  secondaryActivityIntents: string[];
  vibes: string[];
  requestedTags: string[];
  locations: string[];
  neighborhoods: string[];
  boroughs: string[];
  cities: string[];
  budget: { level: string | null; maxPrice: number | null; raw: string | null };
  distance: { maxMiles: number | null; userLat: number | null; userLng: number | null };
  multiIntentMode: boolean;
  routing: {
    restaurantQuery: string;
    activityQuery: string;
    shouldSearchRestaurants: boolean;
    shouldSearchActivities: boolean;
    shouldForceRestaurantCards: boolean;
    shouldForceActivityCards: boolean;
    allowTextOnlyFallback: boolean;
  };
  confidence: { score: number; reasons: string[] };
  explicitTerms: string[];
  primaryDomain: "restaurant" | "activity" | "mixed";
  requiresRestaurant: boolean;
  requiresActivity: boolean;
  isHookahOnly: boolean;
  isLoungeOnly: boolean;
  isDessertOnly: boolean;
  isMealPrimary: boolean;
};

const VERSION = "canonical-search-intent-v1";
const FOOD: Record<string, string[]> = { steak:["steak"], seafood:["seafood"], sushi:["sushi"], brunch:["brunch"], dinner:["dinner","restaurant","fine dining"], dessert:["dessert","ice cream","bakery","coffee"] };
const ACT: Record<string, string[]> = { hookah:["hookah"], lounge:["lounge"], nightlife:["nightlife","bar","rooftop drinks","cocktail"], activity:["activity","things to do","painting class"] };
const ADD_ON = new Set(["dessert"]);
const PRIMARY_MEAL = new Set(["steak","seafood","sushi","brunch","dinner"]);
const PRIMARY_ACTIVITY = new Set(["hookah","lounge","nightlife","activity"]);
const BOROUGHS = ["queens","brooklyn","manhattan","bronx","staten island","astoria"];
const MEAL_TERMS = ["steak","seafood","dinner","lunch","brunch","breakfast","restaurant","food","cuisine","eat"];

const norm = (s:string)=>s.toLowerCase().trim().replace(/\s+/g," ");
const has = (t:string,w:string)=>t.includes(w);

export function isFoodAddOnIntent(intent:string){ return ADD_ON.has(intent); }
export function isLoungeActivityIntent(intent:string){ return ["hookah","lounge","nightlife"].includes(intent); }
export function hasPrimaryMealIntent(intent:CanonicalSearchIntent){ return intent.primaryMealIntents.length>0; }
export function shouldSplitIntoRestaurantAndActivity(intent:CanonicalSearchIntent){ return intent.wantsFood && intent.wantsActivity; }
export function getSearchIntentVersion(){ return VERSION; }

function detectFromMap(text:string, map:Record<string,string[]>) { return Object.entries(map).filter(([,v])=>v.some(k=>has(text,k))).map(([k])=>k); }

export function enrichIntentWithCandidateLocations(intent:CanonicalSearchIntent, candidates:any[]=[]){
  const extra = new Set(intent.locations);
  for (const c of candidates) {
    const blob = norm([c?.city,c?.borough,c?.neighborhood,c?.address].filter(Boolean).join(" "));
    for (const b of BOROUGHS) if (has(blob,b) && has(intent.normalizedInput,b)) extra.add(b);
  }
  return { ...intent, locations:[...extra] };
}

export function parseSearchIntent(input:string, body:any = {}, candidates:any[] = []): CanonicalSearchIntent {
  // Canonical intent is the only routing authority. Smart ranking, route filtering, semantic search, cache keys, and LLM enrichment must consume this object and must not independently re-parse the user query.
  const text = norm(input || "");
  const foodIntents = Array.from(new Set(detectFromMap(text, FOOD)));
  const activityIntents = Array.from(new Set(detectFromMap(text, ACT)));
  const primaryMealIntents = foodIntents.filter((k)=>PRIMARY_MEAL.has(k));
  const foodAddOnIntents = foodIntents.filter((k)=>ADD_ON.has(k));
  const primaryActivityIntents = activityIntents.filter((k)=>PRIMARY_ACTIVITY.has(k));
  const secondaryActivityIntents = activityIntents.filter((k)=>!PRIMARY_ACTIVITY.has(k));
  const wantsFood = foodIntents.length>0;
  const wantsActivity = activityIntents.length>0;
  const hasMealTerm = MEAL_TERMS.some((term)=>has(text, term));
  const wantsFullOuting = wantsFood && wantsActivity;
  const locations = BOROUGHS.filter((b)=>has(text,b));
  const mode:CanonicalIntentMode = wantsFullOuting?"full_outing":wantsFood?"restaurant_only":wantsActivity?"activity_only":locations.length?"location_lookup":"off_topic";
  const budget = { level:null, maxPrice:null, raw:null };
  const distance = { maxMiles: body.maxMiles ?? body.max_miles ?? null, userLat: body.lat ?? body.latitude ?? null, userLng: body.lng ?? body.longitude ?? null };
  const restaurantQuery = [primaryMealIntents.join(" "), locations.join(" ")].join(" ").trim();
  const activityQuery = [primaryActivityIntents.join(" "), locations.join(" ")].join(" ").trim();
  const isHookahOnly = activityIntents.includes("hookah") && !wantsFood && !hasMealTerm;
  const isLoungeOnly = activityIntents.includes("lounge") && !wantsFood && !hasMealTerm;
  const isDessertOnly = foodIntents.length > 0 && foodIntents.every((i)=>i === "dessert");
  const requiresRestaurant = wantsFood || hasMealTerm;
  const requiresActivity = wantsActivity;
  const base: CanonicalSearchIntent = {
    version: VERSION, rawInput: input, normalizedInput:text, mode, wantsFood, wantsActivity, wantsRestaurant:wantsFood||wantsFullOuting||!wantsActivity, wantsFullOuting,
    foodIntents, primaryMealIntents, foodAddOnIntents, activityIntents, primaryActivityIntents, secondaryActivityIntents, vibes:[], requestedTags:[], locations, neighborhoods:[], boroughs:locations, cities:[], budget, distance, multiIntentMode:wantsFullOuting,
    routing:{ restaurantQuery, activityQuery, shouldSearchRestaurants: wantsFood||wantsFullOuting||(!wantsFood&&!wantsActivity), shouldSearchActivities:wantsActivity||wantsFullOuting, shouldForceRestaurantCards:wantsFood, shouldForceActivityCards:wantsActivity, allowTextOnlyFallback:false },
    confidence:{ score:0.8, reasons:["deterministic-parser"] },
    explicitTerms: [...new Set([...foodIntents, ...activityIntents, ...locations])],
    primaryDomain: requiresRestaurant && requiresActivity ? "mixed" : requiresRestaurant ? "restaurant" : "activity",
    requiresRestaurant,
    requiresActivity,
    isHookahOnly,
    isLoungeOnly,
    isDessertOnly,
    isMealPrimary: (primaryMealIntents.length > 0 || hasMealTerm) && !isHookahOnly && !isLoungeOnly
  };
  return enrichIntentWithCandidateLocations(base, candidates);
}

export function buildRestaurantSearchInput(intent:CanonicalSearchIntent){ return [intent.primaryMealIntents.join(" "), intent.locations.join(" "), intent.vibes.join(" ")].join(" ").trim() || intent.normalizedInput; }
export function buildActivitySearchInput(intent:CanonicalSearchIntent){ return [intent.primaryActivityIntents.join(" "), intent.locations.join(" "), intent.vibes.join(" ")].join(" ").trim() || intent.normalizedInput; }
