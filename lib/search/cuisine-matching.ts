export const CANONICAL_CUISINES = [
  "steak","seafood","italian","mexican","caribbean","soul_food","american","asian","chinese","japanese","korean","thai","indian","mediterranean","french","spanish","latin","african","brunch","vegan","bbq","dessert","cafe","bars_with_food","hookah",
] as const;

export const CUISINE_SYNONYMS: Record<string, string[]> = {
steak:["steak","steakhouse","steak house","ribeye","filet mignon","porterhouse","sirloin","tomahawk","churrasco","brazilian steakhouse"],
seafood:["seafood","fish","lobster","crab","shrimp","oyster","raw bar","clam","salmon"], italian:["italian","pasta","pizza","trattoria","osteria","pizzeria","lasagna","ravioli"], mexican:["mexican","tacos","taco","burrito","quesadilla","taqueria","tequila bar"], caribbean:["caribbean","jamaican","trinidadian","haitian","west indian","jerk chicken","oxtail","curry goat","roti"], soul_food:["soul food","southern","fried chicken","mac and cheese","collard greens","comfort food"], american:["american","new american","burgers","burger","grill","gastropub","diner"], asian:["asian","pan asian","fusion","noodle","noodles"], chinese:["chinese","dim sum","dumplings","szechuan","sichuan","cantonese"], japanese:["japanese","sushi","ramen","izakaya","omakase","hibachi","teppanyaki"], korean:["korean","korean bbq","kbbq","bulgogi","bibimbap"], thai:["thai","pad thai","curry","tom yum"], indian:["indian","biryani","curry","tandoori","tikka","masala"], mediterranean:["mediterranean","greek","turkish","middle eastern","falafel","gyro","kebab","shawarma","hummus"], french:["french","bistro","brasserie","crepe","steak frites"], spanish:["spanish","tapas","paella"], latin:["latin","latin american","peruvian","colombian","dominican","cuban","puerto rican","empanada","arepa"], african:["african","nigerian","ethiopian","senegalese","ghanaian","jollof","injera","suya"], brunch:["brunch","breakfast","pancakes","waffles","eggs","cafe brunch"], vegan:["vegan","vegetarian","plant based","plant-based","veggie"], bbq:["bbq","barbecue","barbeque","smokehouse","smoked meat","ribs","brisket"], dessert:["dessert","bakery","cake","pastries","ice cream","gelato","donuts","sweets"], cafe:["cafe","coffee","espresso","latte","coffee shop"], bars_with_food:["wine bar","cocktail bar","gastropub","sports bar","bar and grill"], hookah:["hookah","hookah lounge","lounge","shisha"]
};
export const RESTAURANT_CATEGORY_SYNONYMS = CUISINE_SYNONYMS;
const FOOD_SIGNALS=["restaurant","bistro","grill","kitchen","food","dining","cuisine","menu"];
const norm=(v:string)=>v.toLowerCase().replace(/[^a-z0-9\s-]/g," ").replace(/\s+/g," ").trim();
const arr=(v:unknown)=>Array.isArray(v)?v:[v];

export function normalizeFoodText(input: string){return norm(input).replace(/\brestaurants\b/g,"restaurant").replace(/\bcafes\b/g,"cafe").replace(/\btacos\b/g,"taco");}
export function buildLocationFoodText(location:any){return normalizeFoodText([location?.name,location?.restaurant_name,location?.activity_name,location?.primary_category,location?.category,...(arr(location?.categories)),location?.cuisine,location?.cuisine_type,location?.restaurant_type,location?.activity_type,location?.location_type,...(arr(location?.tags)),...(arr(location?.vibe_tags)),location?.description,location?.search_document,location?.address,location?.neighborhood,location?.borough,location?.city].filter(Boolean).join(" "));}

function detect(query:string, map:Record<string,string[]>) { const q=normalizeFoodText(query); return Object.entries(map).filter(([,syn])=>syn.some(s=>q.includes(normalizeFoodText(s)))).map(([k])=>k); }

export function detectRequestedCuisines(query:string){ return detect(query, CUISINE_SYNONYMS).filter((k)=>k!=="hookah"); }
export function detectRequestedRestaurantCategories(query:string){ return detect(query, RESTAURANT_CATEGORY_SYNONYMS); }

export function locationMatchesCuisineOrCategory(location:any, requested:string[]){
  const hay=buildLocationFoodText(location);
  return requested.some((k)=> (CUISINE_SYNONYMS[k]||[k]).some((s)=>hay.includes(normalizeFoodText(s))));
}

export function scoreCuisineCategoryMatch(location:any, query:string, forRestaurantSlot=true){
  const requested=detectRequestedRestaurantCategories(query); const hay=buildLocationFoodText(location); let score=0; const reasons:string[]=[];
  for (const key of requested){ const syn=CUISINE_SYNONYMS[key]||[key]; if (syn.some(s=>normalizeFoodText(String(location?.primary_category||"")).includes(normalizeFoodText(s))||normalizeFoodText(String(location?.cuisine||"")).includes(normalizeFoodText(s))||normalizeFoodText(String(location?.cuisine_type||"")).includes(normalizeFoodText(s))||normalizeFoodText(String(location?.restaurant_type||"")).includes(normalizeFoodText(s)))) {score+=100;reasons.push(`exact:${key}`);} else if (syn.some(s=>normalizeFoodText(String(location?.name||location?.restaurant_name||"")).includes(normalizeFoodText(s)))) {score+=85;reasons.push(`name:${key}`);} else if (syn.some(s=>hay.includes(normalizeFoodText(s)))) {score+=70;reasons.push(`doc:${key}`);} }
  const isActivity=hay.includes("activity")||hay.includes("event")||hay.includes("entertainment");
  const isHookahOnly=(hay.includes("hookah")||hay.includes("shisha")||hay.includes("lounge")) && !FOOD_SIGNALS.some(s=>hay.includes(s));
  if (forRestaurantSlot && isActivity) score-=60;
  if (forRestaurantSlot && isHookahOnly && requested.some((r)=>r!=="hookah")) score-=80;
  if (forRestaurantSlot && requested.some((r)=>["steak","seafood"].includes(r)) && ["bakery","dessert","cafe","coffee"].some(t=>hay.includes(t)) && !requested.some(r=>CUISINE_SYNONYMS[r]?.some(s=>hay.includes(normalizeFoodText(s))))) score-=70;
  if (forRestaurantSlot && !FOOD_SIGNALS.some(s=>hay.includes(s))) score-=40;
  return { score, reasons, requested };
}
