import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const VALID_TABLES = new Set(["locations", "restaurants", "activities"]);
const TEXT_MASK = "places.id,places.displayName,places.formattedAddress,places.location,places.primaryType,places.types,places.rating,places.userRatingCount,places.googleMapsUri,places.websiteUri";
const DETAILS_MASK = "id,displayName,formattedAddress,location,primaryType,types,rating,userRatingCount,googleMapsUri,websiteUri,nationalPhoneNumber,currentOpeningHours,regularOpeningHours,editorialSummary,priceLevel";
const TYPE_TERMS: Record<string, any> = {
  restaurant: { categoryTerms: ["restaurant"], semanticTags: ["restaurant"] },
  meal_takeaway: { categoryTerms: ["takeout"], featureTerms: ["takeout"] },
  cafe: { foodTerms: ["coffee", "pastries", "dessert"], categoryTerms: ["cafe", "coffee shop"], featureTerms: ["coffee", "dessert", "pastries"] },
  bakery: { foodTerms: ["pastries", "dessert", "desserts", "cake", "coffee"], categoryTerms: ["bakery", "cafe"], featureTerms: ["coffee", "dessert", "pastries"] },
  bar: { categoryTerms: ["bar"], featureTerms: ["drinks", "cocktails", "beer", "wine"] },
  pub: { categoryTerms: ["pub", "bar"], featureTerms: ["drinks", "beer", "bar food"] },
  night_club: { categoryTerms: ["nightlife", "lounge"], featureTerms: ["dj", "dancing", "drinks"] },
};
const CANONICAL: Record<string, any> = {
  wings: { match: ["wing", "wings", "chicken wing", "chicken wings", "hot chicken", "fried chicken"], foodTerms: ["wings", "chicken wings", "fried chicken", "hot chicken", "chicken"], cuisineTerms: ["american"], categoryTerms: ["wings", "fried chicken"], featureTerms: ["bar food"] },
  burger: { match: ["burger", "burgers", "sliders"], foodTerms: ["burger", "burgers", "sliders"], cuisineTerms: ["american"], categoryTerms: ["burger spot"], featureTerms: ["bar food"] },
  tacos: { match: ["tacos", "taqueria", "mexican", "tex mex"], foodTerms: ["tacos", "tex mex"], cuisineTerms: ["mexican"], categoryTerms: ["taqueria", "mexican restaurant"], featureTerms: ["margaritas"] },
  seafood: { match: ["seafood", "lobster", "crab", "shrimp", "oyster", "raw bar"], foodTerms: ["seafood", "lobster", "crab", "shrimp", "oyster", "raw bar"], cuisineTerms: ["seafood"], categoryTerms: ["seafood restaurant"], featureTerms: [] },
  steak: { match: ["steak", "steakhouse", "steak house", "filet mignon", "prime rib"], foodTerms: ["steak", "steakhouse", "steak house", "filet mignon", "prime rib"], cuisineTerms: ["steakhouse"], categoryTerms: ["steakhouse"], featureTerms: ["wine", "cocktails"] },
  sushi: { match: ["sushi", "omakase", "japanese"], foodTerms: ["sushi", "omakase"], cuisineTerms: ["japanese"], categoryTerms: ["sushi restaurant"], featureTerms: [] },
  ramen: { match: ["ramen"], foodTerms: ["ramen"], cuisineTerms: ["japanese"], categoryTerms: ["ramen spot"], featureTerms: [] },
  pizza: { match: ["pizza", "pizzeria"], foodTerms: ["pizza"], cuisineTerms: ["italian"], categoryTerms: ["pizza place", "pizzeria"], featureTerms: [] },
  pasta: { match: ["pasta", "italian"], foodTerms: ["pasta"], cuisineTerms: ["italian"], categoryTerms: ["italian restaurant"], featureTerms: ["wine"] },
  brunch: { match: ["brunch", "mimosas", "breakfast"], foodTerms: ["brunch", "breakfast"], cuisineTerms: [], categoryTerms: ["brunch spot"], featureTerms: ["mimosas"] },
  vegan: { match: ["vegan", "plant based", "plant-based"], foodTerms: ["vegan", "plant based"], cuisineTerms: ["vegan"], categoryTerms: ["vegan restaurant"], featureTerms: [] },
  vegetarian: { match: ["vegetarian"], foodTerms: ["vegetarian"], cuisineTerms: ["vegetarian"], categoryTerms: ["vegetarian restaurant"], featureTerms: [] },
  halal: { match: ["halal", "halal food", "halal restaurant"], foodTerms: ["halal", "halal food"], cuisineTerms: ["halal"], categoryTerms: ["halal restaurant"], featureTerms: [] },
  cafe: { match: ["cafe", "coffee shop", "coffee", "pastries", "dessert"], foodTerms: ["coffee", "pastries", "dessert"], cuisineTerms: [], categoryTerms: ["cafe", "coffee shop"], featureTerms: ["coffee", "dessert", "pastries"] },
  bakery: { match: ["bakery", "pastries", "cake", "dessert", "coffee"], foodTerms: ["pastries", "dessert", "cake", "coffee"], cuisineTerms: [], categoryTerms: ["bakery", "cafe"], featureTerms: ["coffee", "dessert", "pastries"] },
  hookah: { match: ["hookah", "shisha"], foodTerms: [], cuisineTerms: [], categoryTerms: ["hookah restaurant", "hookah lounge"], featureTerms: ["hookah", "shisha"] },
  drinks: { match: ["drinks", "cocktails", "beer", "wine", "margaritas", "mimosas", "happy hour"], foodTerms: [], cuisineTerms: [], categoryTerms: ["bar", "lounge"], featureTerms: ["drinks", "cocktails", "beer", "wine", "margaritas", "mimosas", "happy hour"] },
  games: { match: ["games", "arcade", "pool", "billiards", "karaoke", "live music"], foodTerms: [], cuisineTerms: [], categoryTerms: [], featureTerms: ["games", "arcade", "pool", "billiards", "karaoke", "live music"] },
};
const BLOCKED = new Set(["plant", "based", "tex", "mex", "raw", "bar", "house", "filet", "mignon", "prime", "rib", "brazilian", "late", "night", "happy", "hour", "shop", "big", "screen", "watch", "party", "game", "day", "live", "viewing", "and", "with", "grill"]);

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const nameOf = (row: any) => row.name || row.restaurant_name || row.activity_name || "";
const addrOf = (row: any) => row.address || row.street_address || "";
const norm = (value: unknown) => String(value || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const clean = (terms: string[]) => Array.from(new Set(terms.map((t) => String(t || "").trim().toLowerCase()).filter(Boolean).filter((t) => !BLOCKED.has(t))));
const has = (haystack: string, term: string) => new RegExp(`(^|\\W)${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/-/g, " ")}(\\W|$)`, "i").test(haystack.replace(/-/g, " "));
function similarity(a: string, b: string) { const left = new Set(norm(a).split(" ").filter(Boolean)); const right = new Set(norm(b).split(" ").filter(Boolean)); if (!left.size || !right.size) return 0; let overlap = 0; for (const token of left) if (right.has(token)) overlap++; return overlap / Math.max(left.size, right.size); }
function confidence(row: any, place: any) { let score = 0; const sim = similarity(nameOf(row), place.displayName?.text || ""); if (sim >= 0.7) score += 35; else if (sim >= 0.45) score += 20; else score -= 30; const localNum = norm(addrOf(row)).match(/\b\d{1,6}\b/)?.[0]; const googleNum = norm(place.formattedAddress).match(/\b\d{1,6}\b/)?.[0]; if (localNum && googleNum && localNum === googleNum) score += 25; else if (localNum && googleNum) score -= 30; if ([row.city, row.borough, row.neighborhood].filter(Boolean).some((x) => norm(place.formattedAddress).includes(norm(x)))) score += 15; return Math.max(0, Math.min(100, score)); }
async function textSearch(row: any, key: string) { const res = await fetch("https://places.googleapis.com/v1/places:searchText", { method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": TEXT_MASK }, body: JSON.stringify({ textQuery: `${nameOf(row)} ${addrOf(row)} ${row.city || ""} ${row.state || ""}`.trim(), maxResultCount: 5 }) }); if (!res.ok) throw new Error(await res.text()); const data = await res.json(); return (data.places || []).map((place: any) => ({ place, confidence: confidence(row, place) })).sort((a: any, b: any) => b.confidence - a.confidence)[0]; }
async function details(placeId: string, key: string) { const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, { headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": DETAILS_MASK } }); if (!res.ok) throw new Error(await res.text()); return res.json(); }
function infer(place: any, row: any) { const patch: any = { foodTerms: [], cuisineTerms: [], categoryTerms: [], featureTerms: [], searchKeywords: [], semanticTags: [], intentTags: [] }; for (const type of [place.primaryType, ...(place.types || [])].filter(Boolean)) { const terms = TYPE_TERMS[type] || {}; for (const key of Object.keys(patch)) patch[key].push(...(terms[key] || [])); } const local = [nameOf(row), row.cuisine, row.primary_category, row.search_document, ...(row.search_keywords || []), ...(row.semantic_tags || []), ...(row.intent_tags || [])].filter(Boolean).join(" "); const strict = norm(`${local} ${place.displayName?.text || ""} ${place.editorialSummary?.text || ""}`); const haystack = norm(`${strict} ${place.primaryType || ""} ${(place.types || []).join(" ")}`); for (const [key, config] of Object.entries(CANONICAL)) { if (!(config as any).match.some((term: string) => has(haystack, term))) continue; if (["wings", "burger", "tacos", "vegan", "halal", "hookah"].includes(key) && !(config as any).match.some((term: string) => has(strict, term))) continue; patch.foodTerms.push(...(config as any).foodTerms); patch.cuisineTerms.push(...(config as any).cuisineTerms); patch.categoryTerms.push(...(config as any).categoryTerms); patch.featureTerms.push(...(config as any).featureTerms); } patch.foodTerms = clean(patch.foodTerms); patch.cuisineTerms = clean(patch.cuisineTerms); patch.categoryTerms = clean(patch.categoryTerms); patch.featureTerms = clean(patch.featureTerms); patch.searchKeywords = clean([...patch.foodTerms, ...patch.cuisineTerms, ...patch.categoryTerms, ...patch.featureTerms]); patch.semanticTags = clean([...patch.searchKeywords, ...(patch.categoryTerms.includes("restaurant") ? ["restaurant"] : [])]); patch.intentTags = clean(patch.searchKeywords); return patch; }
function merge(existing: unknown, add: string[]) { const current = clean(Array.isArray(existing) ? existing as string[] : []); const set = new Set(current); return [...current, ...clean(add).filter((term) => !set.has(term))]; }
function appendDoc(existing: unknown, add: string[]) { const text = typeof existing === "string" ? existing : ""; const lower = ` ${text.toLowerCase()} `; return [text, ...clean(add).filter((term) => !lower.includes(term))].join(" ").trim(); }
function weak(row: any) { return !Array.isArray(row.search_keywords) || !row.search_keywords.length || !Array.isArray(row.semantic_tags) || !row.semantic_tags.length || !Array.isArray(row.intent_tags) || !row.intent_tags.length; }

serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("GOOGLE_LOCATION_ENRICHMENT_CRON_SECRET") && req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return json({ error: "Unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));
  const sourceTable = String(body.sourceTable || "locations");
  if (!VALID_TABLES.has(sourceTable)) return json({ error: "Invalid sourceTable" }, 400);
  const limit = Math.min(100, Math.max(1, Number(body.limit || 25)));
  const dryRun = body.dryRun !== false;
  const applyHigh = Boolean(body.applyHighConfidence);
  const key = Deno.env.get("GOOGLE_MAPS_API_KEY");
  const url = Deno.env.get("NEXT_PUBLIC_SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key || !url || !service) return json({ error: "Missing environment" }, 500);
  const supabase = createClient(url, service);
  const counters: any = { scanned: 0, matched: 0, no_match: 0, suggestions_created: 0, auto_applied: 0, failed: 0, estimated_api_calls: 0 };
  const { data: rows, error } = await supabase.from(sourceTable).select("*").limit(limit * 3);
  if (error) return json({ error: error.message }, 400);
  const eligible = (rows || []).filter((row: any) => !body.onlyMissingPlaceId || !row.google_place_id).filter((row: any) => !body.onlyWeakSearchTerms || weak(row)).slice(0, limit);
  for (const row of eligible) {
    counters.scanned++;
    try {
      let placeId = row.google_place_id;
      if (!placeId) { counters.estimated_api_calls++; const match = await textSearch(row, key); if (!match || match.confidence < 55) { counters.no_match++; if (!dryRun) await supabase.from(sourceTable).update({ google_enrichment_status: "no_match", google_last_error: "No Google match above confidence threshold" }).eq("id", row.id); continue; } placeId = match.place.id; }
      counters.estimated_api_calls++;
      const place = await details(placeId, key);
      const matchConfidence = confidence(row, place);
      if (matchConfidence < 55) { counters.no_match++; continue; }
      counters.matched++;
      const suggested = infer(place, row);
      const suggestionStatus = !dryRun && applyHigh && matchConfidence >= 85 ? "auto_applied" : matchConfidence >= 85 ? "pending" : "pending_review";
      const suggestion = { source_table: sourceTable, source_id: row.id, google_place_id: place.id, location_name: nameOf(row), google_display_name: place.displayName?.text || null, match_confidence: matchConfidence, suggested_food_terms: suggested.foodTerms, suggested_cuisine_terms: suggested.cuisineTerms, suggested_category_terms: suggested.categoryTerms, suggested_feature_terms: suggested.featureTerms, suggested_search_keywords: suggested.searchKeywords, suggested_semantic_tags: suggested.semanticTags, suggested_intent_tags: suggested.intentTags, google_types: place.types || [], google_primary_type: place.primaryType || null, evidence: { googleFormattedAddress: place.formattedAddress || null, googleTypes: place.types || [] }, status: suggestionStatus };
      const { data: inserted, error: insertError } = await supabase.from("location_google_food_term_suggestions").insert(suggestion).select("id").single();
      if (insertError) throw insertError;
      counters.suggestions_created++;
      if (!dryRun && applyHigh && matchConfidence >= 85) { const all = clean([...suggested.foodTerms, ...suggested.cuisineTerms, ...suggested.categoryTerms, ...suggested.featureTerms, ...suggested.searchKeywords]); await supabase.from(sourceTable).update({ search_keywords: merge(row.search_keywords, suggested.searchKeywords), semantic_tags: merge(row.semantic_tags, suggested.semanticTags), intent_tags: merge(row.intent_tags, suggested.intentTags), search_document: appendDoc(row.search_document, all), google_place_id: place.id, google_enrichment_status: "auto_applied", google_enriched_at: new Date().toISOString(), google_primary_type: place.primaryType || null, google_types: place.types || [], google_maps_uri: place.googleMapsUri || null, google_website_uri: place.websiteUri || null, google_rating: place.rating || null, google_user_rating_count: place.userRatingCount || null, google_last_error: null }).eq("id", row.id); await supabase.from("location_google_food_term_suggestions").update({ applied_at: new Date().toISOString() }).eq("id", inserted.id); counters.auto_applied++; }
    } catch (error) { counters.failed++; if (!dryRun) await supabase.from(sourceTable).update({ google_enrichment_status: "failed", google_last_error: error instanceof Error ? error.message : String(error) }).eq("id", row.id); }
  }
  return json(counters);
});
