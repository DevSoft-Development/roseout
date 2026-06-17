#!/usr/bin/env tsx
// Dry run example:
// npx dotenv -e .env.local -- npx tsx scripts/import-outer-market-locations.ts --market LONG_ISLAND --cities "Garden City,Westbury,Rockville Centre" --categories "brunch,seafood,steakhouse" --limit=25 --dry-run
import "dotenv/config";
import { config as loadDotenv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClaimQr } from "../lib/claimQrServer";
import { extractReservationUrl } from "../lib/reservation-links";
import { syncActivityToLocation, syncRestaurantToLocation } from "../lib/sync-location";
import { getMarketDisplayName, inferMarketFromCityStateCounty, type MarketKey } from "../lib/location-markets";

const SUPPORTED_MARKETS = ["LONG_ISLAND", "NORTHERN_NJ", "WESTCHESTER", "STATEN_ISLAND", "BRONX_OUTER"] as const;
type SupportedMarket = (typeof SUPPORTED_MARKETS)[number];
type Table = "restaurants" | "activities";
type Args = Map<string, string | boolean>;
type Place = { place_id?: string; name?: string; formatted_address?: string; vicinity?: string; formatted_phone_number?: string; international_phone_number?: string; website?: string; url?: string; rating?: number; user_ratings_total?: number; business_status?: string; types?: string[]; photos?: { photo_reference?: string }[]; geometry?: { location?: { lat?: number; lng?: number } }; price_level?: number };


const DEFAULT_CITIES: Record<SupportedMarket, string[]> = {
  LONG_ISLAND: ["Garden City", "Westbury", "Rockville Centre", "Huntington", "Farmingdale", "Patchogue"],
  NORTHERN_NJ: ["Jersey City", "Hoboken", "Edgewater", "Fort Lee", "Montclair", "Newark"],
  WESTCHESTER: ["Yonkers", "New Rochelle", "White Plains", "Tarrytown", "Bronxville"],
  STATEN_ISLAND: ["St. George", "Stapleton", "New Dorp", "Tottenville"],
  BRONX_OUTER: ["City Island", "Fordham", "Mott Haven", "Riverdale", "Pelham Bay"],
};

const MARKET_COUNTY: Partial<Record<SupportedMarket, string>> = {
  LONG_ISLAND: "Nassau",
  WESTCHESTER: "Westchester",
  STATEN_ISLAND: "Richmond",
  BRONX_OUTER: "Bronx",
};
const ACTIVITY_HINTS = /lounge|bar|club|karaoke|bowling|arcade|escape|museum|theater|movie|comedy|golf|paint|axe|activity|activities|speakeasy|hookah|cigar|spa|music/i;

function parseArgs(): Args {
  const out: Args = new Map();
  const argv = process.argv.slice(2);
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const equalsIndex = arg.indexOf("=");
    if (equalsIndex >= 0) out.set(arg.slice(2, equalsIndex), arg.slice(equalsIndex + 1));
    else if (argv[index + 1] && !argv[index + 1].startsWith("--")) out.set(arg.slice(2), argv[++index]);
    else out.set(arg.slice(2), true);
  }
  return out;
}

function printHelp() {
  console.log(`Usage: npx dotenv -e .env.local -- npx tsx scripts/import-outer-market-locations.ts --market LONG_ISLAND --cities "Garden City,Westbury,Rockville Centre" --categories "brunch,seafood,steakhouse" --limit=25 --dry-run

Imports real Google Places results into TheOutHaven outer markets. No fake venues are generated.

Markets:
  ${SUPPORTED_MARKETS.join("\n  ")}

Options:
  --market MARKET                 Required. One of the markets above.
  --cities "City A,City B"        Comma-separated cities. Defaults by market when omitted.
  --categories "brunch,lounge"    Comma-separated Google text-search categories.
  --limit 25 / --limit=25         Max created/updated rows (default: 25).
  --dry-run                       Search and dedupe, but do not write to Supabase.
  --force                         Ignore GOOGLE_IMPORT_DAILY_LIMIT.
  --type restaurants|activities|both  Override inferred destination table.
  --help                          Print this usage and exit before clients initialize.`);
}

function csv(value: unknown) { return String(value || "").split(",").map((part) => part.trim()).filter(Boolean); }
function normalize(value: unknown) { return String(value || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " "); }
function stateFor(market: SupportedMarket) { return market === "NORTHERN_NJ" ? "NJ" : "NY"; }
function cleanAddress(address?: string) { return String(address || "").replace(/,\s*(USA|United States)$/i, "").trim(); }
function parseAddress(address: string, fallbackCity: string, fallbackState: string) {
  const cleaned = cleanAddress(address);
  const parts = cleaned.split(",").map((part) => part.trim()).filter(Boolean);
  const stateZip = parts.at(-1) || "";
  const match = stateZip.match(/\b([A-Z]{2})\s+(\d{5})/);
  return { address: cleaned, city: parts.length > 2 ? parts.at(-2)! : fallbackCity, state: match?.[1] || fallbackState, zip_code: match?.[2] || "" };
}
function score(place: Place) { return Math.max(50, Math.min(98, Math.round(Number(place.rating || 0) * 14 + Math.min(25, Math.log10(Number(place.user_ratings_total || 0) + 1) * 10) + (place.photos?.length ? 6 : 0) + (place.website ? 5 : 0)))); }
function googleKey() { const key = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY; if (!key) throw new Error("Missing GOOGLE_PLACES_API_KEY or GOOGLE_MAPS_API_KEY"); return key; }
function photoUrl(ref?: string) { return ref ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=${encodeURIComponent(ref)}&key=${encodeURIComponent(googleKey())}` : null; }
function serviceClient() { const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY; if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"); return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }); }
function inferTable(category: string, type: string): Table { if (type === "restaurants" || type === "activities") return type; return ACTIVITY_HINTS.test(category) ? "activities" : "restaurants"; }
function slugTerm(category: string) { return normalize(category).replace(/ /g, "_") || "restaurant"; }
function serializeError(error: unknown) { return error instanceof Error ? error.message : String(error); }

async function googleTextSearch(query: string) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  url.searchParams.set("key", googleKey());
  const res = await fetch(url);
  const data = await res.json();
  if (!["OK", "ZERO_RESULTS"].includes(data.status)) throw new Error(data.error_message || `Google Places error: ${data.status}`);
  return (data.results || []) as Place[];
}

async function googleDetails(placeId: string) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "place_id,name,formatted_address,formatted_phone_number,international_phone_number,website,url,rating,user_ratings_total,business_status,types,photos,geometry,price_level");
  url.searchParams.set("key", googleKey());
  const res = await fetch(url);
  const data = await res.json();
  return data.status === "OK" ? data.result as Place : null;
}

async function existingByPlaceId(supabase: SupabaseClient, placeId: string) {
  for (const table of ["locations", "restaurants", "activities"] as const) {
    const { data } = await supabase.from(table).select("id").eq("google_place_id", placeId).limit(1);
    if (data?.[0]) return { table, id: data[0].id };
  }
  return null;
}

async function existingByFallback(supabase: SupabaseClient, name: string, address: string, city: string, state: string) {
  for (const table of ["locations", "restaurants", "activities"] as const) {
    const { data } = await supabase.from(table).select("id,name,address,city,state").ilike("city", city).eq("state", state).limit(200);
    const found = data?.find((row: any) => normalize(row.name) === normalize(name) && normalize(row.address) === normalize(address));
    if (found) return { table, id: found.id };
  }
  return null;
}

function unsupportedColumnFromError(error: unknown) {
  const message = serializeError(error);
  return message.match(/Could not find the '([^']+)' column/)?.[1] || message.match(/column \"?([^\" ]+)\"? .*does not exist/i)?.[1] || null;
}

async function insertWithSupportedColumns(supabase: SupabaseClient, table: Table, row: Record<string, unknown>) {
  const payload = { ...row };
  const removedColumns: string[] = [];
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data, error } = await supabase.from(table).insert(payload).select("*").single();
    if (!error) return data;
    const unsupportedColumn = unsupportedColumnFromError(error);
    if (!unsupportedColumn || !(unsupportedColumn in payload)) throw error;
    delete payload[unsupportedColumn];
    removedColumns.push(unsupportedColumn);
  }
  throw new Error(`Unable to insert ${table}; unsupported columns removed: ${removedColumns.join(", ")}`);
}

async function savePlace(supabase: SupabaseClient, table: Table, place: Place, category: string, city: string, market: SupportedMarket, dryRun: boolean) {
  if (!place.place_id || !place.name || place.business_status === "CLOSED_PERMANENTLY") return "failed";
  const addr = parseAddress(place.formatted_address || place.vicinity || "", city, stateFor(market));
  const county = MARKET_COUNTY[market];
  const resolvedMarket = inferMarketFromCityStateCounty({ city: addr.city, state: addr.state, county, address: addr.address, market }) as MarketKey;
  const term = slugTerm(category);
  const qualityScore = score(place);
  const common: Record<string, unknown> = {
    name: place.name, address: addr.address, city: addr.city, state: addr.state, zip_code: addr.zip_code, county,
    market: resolvedMarket, source_market: market, google_place_id: place.place_id, latitude: place.geometry?.location?.lat || null,
    longitude: place.geometry?.location?.lng || null, rating: Number(place.rating || 0), review_count: Number(place.user_ratings_total || 0),
    google_maps_url: place.url || null, google_types: place.types || [], phone: place.formatted_phone_number || place.international_phone_number || null,
    website: place.website || null, image_url: photoUrl(place.photos?.[0]?.photo_reference), photo_url: photoUrl(place.photos?.[0]?.photo_reference),
    source: "google_places", import_source: "outer_market_google_places", status: "approved", quality_score: qualityScore, theouthaven_score: qualityScore,
    popularity_score: Math.min(100, Math.round(Math.log10(Number(place.user_ratings_total || 0) + 1) * 35)), review_score: Number(place.rating || 0) * 20,
    search_keywords: [place.name, category, city, market, ...(place.types || [])].filter(Boolean).map(String), price_level: place.price_level ?? null,
  };
  const row = table === "restaurants"
    ? { ...common, restaurant_name: place.name, location_type: "restaurant", cuisine: term, food_type: term, cuisine_type: term, primary_tag: term, reservation_url: extractReservationUrl(place) }
    : { ...common, activity_name: place.name, location_type: "activity", activity_type: term, primary_tag: term, atmosphere: "TheOutHaven-friendly outing, date-night, social, and group-friendly", date_style_tags: ["date night", "group-friendly", term] };
  if (dryRun) return "created";
  const qr = await createClaimQr(table === "restaurants" ? "restaurant" : "activity");
  Object.assign(row, { claim_status: qr.claim_status, claim_code: qr.claim_code, claim_token: qr.claim_token, claim_url: qr.claim_url, qr_link: qr.claim_url, claim_qr_url: qr.qr_code_data_url, qr_code_data_url: qr.qr_code_data_url });
  const data = await insertWithSupportedColumns(supabase, table, row);
  if (table === "restaurants") await syncRestaurantToLocation(data as any);
  else await syncActivityToLocation(data as any);
  return "created";
}

async function main() {
  const args = parseArgs();
  if (args.has("help")) { printHelp(); return; }
  loadDotenv({ path: ".env.local", override: false });
  const market = String(args.get("market") || "").toUpperCase() as SupportedMarket;
  if (!SUPPORTED_MARKETS.includes(market)) throw new Error(`--market must be one of ${SUPPORTED_MARKETS.join(", ")}`);
  const cities = csv(args.get("cities")).length ? csv(args.get("cities")) : DEFAULT_CITIES[market];
  const categories = csv(args.get("categories")).length ? csv(args.get("categories")) : ["brunch", "seafood", "steakhouse", "lounge"];
  const requestedLimit = Math.max(1, Number(args.get("limit") || 25));
  const dryRun = args.has("dry-run");
  const force = args.has("force");
  const type = String(args.get("type") || "both");
  const dailyLimit = Number(process.env.GOOGLE_IMPORT_DAILY_LIMIT || 0);
  const effectiveLimit = force || !dailyLimit ? requestedLimit : Math.min(requestedLimit, dailyLimit);
  const supabase = serviceClient();
  const counters = { estimated_api_calls: 0, created: 0, updated: 0, skipped_duplicate: 0, failed: 0, errors: [] as string[] };

  outer: for (const city of cities) {
    for (const category of categories) {
      if (counters.created + counters.updated >= effectiveLimit) break outer;
      const query = `${category} in ${city} ${stateFor(market)}`;
      try {
        counters.estimated_api_calls += 1;
        const places = await googleTextSearch(query);
        for (const place of places) {
          if (counters.created + counters.updated >= effectiveLimit) break outer;
          if (!place.place_id) continue;
          try {
            const byPlace = await existingByPlaceId(supabase, place.place_id);
            if (byPlace) { counters.skipped_duplicate += 1; continue; }
            const details = await googleDetails(place.place_id);
            counters.estimated_api_calls += 1;
            const merged = { ...place, ...(details || {}) };
            const addr = parseAddress(merged.formatted_address || merged.vicinity || "", city, stateFor(market));
            const byFallback = await existingByFallback(supabase, merged.name || "", addr.address, addr.city, addr.state);
            if (byFallback) { counters.skipped_duplicate += 1; continue; }
            const result = await savePlace(supabase, inferTable(category, type), merged, category, city, market, dryRun);
            if (result === "created") counters.created += 1;
            else counters.failed += 1;
          } catch (error) {
            counters.failed += 1;
            counters.errors.push(`${query} / ${place.place_id}: ${serializeError(error)}`);
          }
        }
      } catch (error) {
        counters.failed += 1;
        counters.errors.push(`${query}: ${serializeError(error)}`);
      }
    }
  }

  const summary = { market, marketName: getMarketDisplayName(market), cities, categories, requestedLimit, effectiveLimit, dryRun, ...counters };
  if (!dryRun) await supabase.from("import_logs").insert({ job_name: "outer_market_google_places_import", imported_count: counters.created, error: counters.errors.slice(0, 5).join("; ") || null, meta: summary });
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
