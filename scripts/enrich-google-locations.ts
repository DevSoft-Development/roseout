import { createClient } from "@supabase/supabase-js";
import {
  buildApplySuggestionUpdate,
  buildGoogleSuggestionRow,
  enrichLocationFromGoogle,
} from "../lib/google/places";

const VALID_TABLES = new Set(["locations", "restaurants", "activities"]);

type Options = {
  table: "locations" | "restaurants" | "activities";
  limit: number;
  dryRun: boolean;
  applyHighConfidence: boolean;
  onlyMissingPlaceId: boolean;
  onlyWeakSearchTerms: boolean;
  force: boolean;
};

function parseArgs(): Options {
  const args = new Map<string, string | boolean>();
  for (const arg of process.argv.slice(2)) {
    if (!arg.startsWith("--")) continue;
    const [key, value] = arg.slice(2).split("=");
    args.set(key, value ?? true);
  }

  const table = String(args.get("table") || "locations") as Options["table"];
  if (!VALID_TABLES.has(table)) throw new Error("--table must be locations, restaurants, or activities");

  const limit = Math.min(100, Math.max(1, Number(args.get("limit") || 25)));
  return {
    table,
    limit,
    dryRun: args.has("dry-run") || !args.has("apply-high-confidence"),
    applyHighConfidence: args.has("apply-high-confidence"),
    onlyMissingPlaceId: args.has("only-missing-place-id"),
    onlyWeakSearchTerms: args.has("only-weak-search-terms"),
    force: args.has("force"),
  };
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function hasWeakTerms(row: any) {
  return !Array.isArray(row.search_keywords) || row.search_keywords.length === 0 || !Array.isArray(row.semantic_tags) || row.semantic_tags.length === 0 || !Array.isArray(row.intent_tags) || row.intent_tags.length === 0;
}

function needsEnrichment(row: any, options: Options) {
  if (options.force) return true;
  if (options.onlyMissingPlaceId && row.google_place_id) return false;
  if (options.onlyWeakSearchTerms && !hasWeakTerms(row)) return false;
  if (!row.google_place_id) return true;
  if ([null, undefined, "pending", "failed"].includes(row.google_enrichment_status)) return true;
  if (hasWeakTerms(row)) return true;
  if (!row.google_enriched_at) return true;
  return new Date(row.google_enriched_at).getTime() < Date.now() - 90 * 24 * 60 * 60 * 1000;
}

async function main() {
  const options = parseArgs();
  const supabase = serviceClient();
  const counters = {
    scanned: 0,
    matched: 0,
    no_match: 0,
    suggestions_created: 0,
    auto_applied: 0,
    failed: 0,
    estimated_api_calls: 0,
  };

  const { data: rows, error } = await supabase
    .from(options.table)
    .select("*")
    .or("google_enrichment_status.is.null,google_enrichment_status.in.(pending,failed),google_enriched_at.is.null,google_place_id.is.null")
    .limit(options.limit * 3);

  if (error) throw error;

  for (const row of (rows || []).filter((item) => needsEnrichment(item, options)).slice(0, options.limit)) {
    counters.scanned += 1;
    try {
      counters.estimated_api_calls += row.google_place_id ? 1 : 2;
      const result = await enrichLocationFromGoogle(row);
      if (!result.place || result.confidence < 55 || !result.suggestion) {
        counters.no_match += 1;
        if (!options.dryRun) {
          await supabase.from(options.table).update({ google_enrichment_status: "no_match", google_last_error: JSON.stringify(result.evidence || {}) }).eq("id", row.id);
        }
        continue;
      }

      counters.matched += 1;
      const suggestionStatus = !options.dryRun && options.applyHighConfidence && result.confidence >= 85 ? "auto_applied" : result.confidence >= 85 ? "pending" : "pending_review";
      const suggestionRow = buildGoogleSuggestionRow(options.table, row, result.place, result.confidence, result.suggestion, result.evidence, suggestionStatus);
      const { data: inserted, error: insertError } = await supabase
        .from("location_google_food_term_suggestions")
        .insert(suggestionRow)
        .select("id")
        .single();
      if (insertError) throw insertError;
      counters.suggestions_created += 1;

      if (!options.dryRun && options.applyHighConfidence && result.confidence >= 85) {
        const update = {
          ...buildApplySuggestionUpdate(row, suggestionRow),
          google_place_id: result.place.id,
          google_enrichment_status: "auto_applied",
          google_enriched_at: new Date().toISOString(),
          google_primary_type: result.place.primaryType || null,
          google_types: result.place.types || [],
          google_maps_uri: result.place.googleMapsUri || null,
          google_website_uri: result.place.websiteUri || null,
          google_rating: result.place.rating || null,
          google_user_rating_count: result.place.userRatingCount || null,
          google_last_error: null,
        };
        const { error: updateError } = await supabase.from(options.table).update(update).eq("id", row.id);
        if (updateError) throw updateError;
        if (inserted?.id) await supabase.from("location_google_food_term_suggestions").update({ applied_at: new Date().toISOString() }).eq("id", inserted.id);
        counters.auto_applied += 1;
      }
    } catch (error) {
      counters.failed += 1;
      console.error("Failed to enrich row", { table: options.table, id: row.id, error });
      if (!options.dryRun) {
        await supabase.from(options.table).update({ google_enrichment_status: "failed", google_last_error: error instanceof Error ? error.message : String(error) }).eq("id", row.id);
      }
    }
  }

  console.log(JSON.stringify({ options, ...counters }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
