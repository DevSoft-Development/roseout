const SEARCH_INTENT_VERSION = "canonical-intent-v1";

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
  // backward-compatible accessors
  text: string;
  userLat: number | null;
  userLng: number | null;
  maxMiles: number | null;
  wantsBudget: boolean;
  wantsBirthday: boolean;
  wantsBirthdayDinner: boolean;
  wantsBirthdayBrunch: boolean;
  wantsRooftop: boolean;
  wantsHookah: boolean;
  wantsCigar: boolean;
  wantsLounge: boolean;
  wantsNightclub: boolean;

};

export const FOOD_INTENTS: Record<string, string[]> = { steak:["steak"], seafood:["seafood"], sushi:["sushi"], brunch:["brunch"], dinner:["dinner"], restaurant:["restaurant","fine dining"], dessert:["dessert","ice cream","bakery"], coffee:["coffee"], drinks:["drinks"] };
export const ACTIVITY_INTENTS: Record<string, string[]> = { hookah:["hookah"], lounge:["lounge","hookah lounge","cigar lounge","cocktail lounge"], nightlife:["nightlife","bar","rooftop drinks","club"], painting:["painting class"], activity:["activity","things to do"] };
const BOROUGHS=["manhattan","brooklyn","queens","bronx","staten island"];
const MEAL_WORDS=["breakfast","brunch","lunch","dinner","restaurant","date night","fine dining","steak","seafood","sushi"];
const FOOD_ADD_ON_WORDS=["dessert","ice cream","bakery","coffee","drinks"];
const FULL_OUTING_CONNECTORS=[" and "," with "," after ","then"];

const norm=(s:string)=>s.toLowerCase().trim().replace(/\s+/g," ");
const contains=(t:string,w:string)=>t.includes(w);
const detect=(text:string,map:Record<string,string[]>)=>Object.entries(map).filter(([,ks])=>ks.some(k=>contains(text,norm(k)))).map(([k])=>k);

export function isFoodAddOnIntent(i:string){return ["dessert","coffee","drinks"].includes(i);}
export function isLoungeActivityIntent(i:string){return ["hookah","lounge","nightlife"].includes(i);}
export function hasPrimaryMealIntent(intent:CanonicalSearchIntent){return intent.primaryMealIntents.length>0;}

export function enrichIntentWithCandidateLocations(intent:CanonicalSearchIntent,candidates:any[]=[]){
  const extra = new Set(intent.locations);
  for (const c of candidates){[c.city,c.neighborhood,c.borough,c.address].filter(Boolean).forEach((x:any)=>extra.add(norm(String(x))));}
  return { ...intent, locations:Array.from(extra) };
}

export function buildRestaurantSearchInput(intent: CanonicalSearchIntent){
  return [...intent.primaryMealIntents,...intent.vibes,...intent.locations].join(" ").trim();
}
export function buildActivitySearchInput(intent: CanonicalSearchIntent){
  return [...intent.primaryActivityIntents,...intent.secondaryActivityIntents,...intent.vibes,...intent.locations].join(" ").trim();
}
export function shouldSplitIntoRestaurantAndActivity(intent: CanonicalSearchIntent){return intent.routing.shouldSearchRestaurants && intent.routing.shouldSearchActivities;}
export function getSearchIntentVersion(){return SEARCH_INTENT_VERSION;}

export function parseSearchIntent(input:string, body:any = {}, candidates:any[] = []): CanonicalSearchIntent {
  // Canonical intent is the only routing authority. Smart ranking, route filtering, semantic search, cache keys, and  LLM enrichment must consume this object and must not independently re-parse the user query.
  const normalizedInput = norm(input || "");
  let locations = Array.from(new Set(BOROUGHS.filter((b)=>contains(normalizedInput,b))));
  const foodIntents = Array.from(new Set(detect(normalizedInput, FOOD_INTENTS)));
  const activityIntents = Array.from(new Set(detect(normalizedInput, ACTIVITY_INTENTS)));
  const primaryMealIntents = foodIntents.filter((f)=>!isFoodAddOnIntent(f));
  const foodAddOnIntents = foodIntents.filter(isFoodAddOnIntent);
  const primaryActivityIntents = activityIntents.filter((a)=>isLoungeActivityIntent(a) || a !== "activity");
  const secondaryActivityIntents = activityIntents.filter((a)=>!primaryActivityIntents.includes(a));
  const wantsFood = foodIntents.length>0 || MEAL_WORDS.some((w)=>contains(normalizedInput,w));
  const wantsActivity = activityIntents.length>0 || contains(normalizedInput,"activity") || contains(normalizedInput,"things to do");
  const wantsFullOuting = (wantsFood && wantsActivity) || FULL_OUTING_CONNECTORS.some((w)=>contains(normalizedInput,w));
  const mode: CanonicalIntentMode = locations.length>0 && !wantsFood && !wantsActivity ? "location_lookup" : wantsFullOuting ? "full_outing" : wantsFood ? "restaurant_only" : wantsActivity ? "activity_only" : "off_topic";
  const enriched = enrichIntentWithCandidateLocations({} as CanonicalSearchIntent, candidates).locations;
  locations = Array.from(new Set([...locations,...enriched]));
  const base: CanonicalSearchIntent = {
    version: SEARCH_INTENT_VERSION, rawInput: input, normalizedInput, mode,
    wantsFood, wantsActivity, wantsRestaurant: wantsFood || mode==="full_outing", wantsFullOuting,
    foodIntents, primaryMealIntents, foodAddOnIntents,
    activityIntents, primaryActivityIntents, secondaryActivityIntents,
    vibes: [], requestedTags: [], locations, neighborhoods:[], boroughs: BOROUGHS.filter((b)=>locations.includes(b)), cities:[],
    budget:{level:null,maxPrice:null,raw:null},
    distance:{maxMiles: Number(body?.maxMiles ?? body?.max_miles) || null, userLat:Number(body?.lat ?? body?.latitude) || null, userLng:Number(body?.lng ?? body?.longitude) || null},
    multiIntentMode: wantsFullOuting,
    routing:{restaurantQuery:"",activityQuery:"",shouldSearchRestaurants:wantsFood||wantsFullOuting,shouldSearchActivities:wantsActivity||wantsFullOuting,shouldForceRestaurantCards:true,shouldForceActivityCards:wantsActivity||wantsFullOuting,allowTextOnlyFallback:false},
    confidence:{score:0.8,reasons:["deterministic-keyword-parse"]},
    text: normalizedInput,
    userLat: Number(body?.lat ?? body?.latitude) || null,
    userLng: Number(body?.lng ?? body?.longitude) || null,
    maxMiles: Number(body?.maxMiles ?? body?.max_miles) || null,
    wantsBudget:false,
    wantsBirthday: normalizedInput.includes("birthday"),
    wantsBirthdayDinner: normalizedInput.includes("birthday dinner"),
    wantsBirthdayBrunch: normalizedInput.includes("birthday brunch"),
    wantsRooftop: normalizedInput.includes("rooftop"),
    wantsHookah: normalizedInput.includes("hookah"),
    wantsCigar: normalizedInput.includes("cigar"),
    wantsLounge: normalizedInput.includes("lounge"),
    wantsNightclub: normalizedInput.includes("nightclub")
  };
  base.routing.restaurantQuery = buildRestaurantSearchInput(base);
  base.routing.activityQuery = buildActivitySearchInput(base);
  return base;
}
