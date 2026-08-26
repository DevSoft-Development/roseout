import type { SupabaseClient } from "@supabase/supabase-js";

export type LearnedLanguageIntent = {
  phraseKey: string;
  relationship: string | null;
  vibes: string[];
  exclusions: string[];
  confidence: number;
  support: number;
  source: "approved_mapping";
};

export function normalizeLearnedPhrase(value: string) {
  return value
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9'\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? [...new Set(value.map(String).map((item) => item.trim()).filter(Boolean))] : [];
}

export async function loadLearnedLanguageIntent(
  supabase: SupabaseClient | null | undefined,
  query: string,
): Promise<LearnedLanguageIntent | null> {
  if (!supabase) return null;
  const phraseKey = normalizeLearnedPhrase(query);
  if (!phraseKey) return null;

  const { data, error } = await supabase
    .from("search_phrase_learning_mappings")
    .select("phrase_key,match_type,approved_intent,vibes,exclusions,confidence_score,support_score,is_active")
    .eq("phrase_key", phraseKey)
    .eq("is_active", true)
    .maybeSingle();
  if (error || !data) return null;

  const approved = data.approved_intent && typeof data.approved_intent === "object"
    ? data.approved_intent as Record<string, unknown>
    : {};

  return {
    phraseKey,
    relationship: typeof approved.relationship === "string" ? approved.relationship : null,
    vibes: stringArray(data.vibes),
    exclusions: stringArray(data.exclusions),
    confidence: Number(data.confidence_score ?? 0),
    support: Number(data.support_score ?? 0),
    source: "approved_mapping",
  };
}

export async function recordAndMaybePromoteLearnedIntent(args: {
  supabase: SupabaseClient | null | undefined;
  query: string;
  relationship: string;
  vibes: string[];
  exclusions: string[];
  confidence: number;
  llmModel: string | null;
  ambiguityReasons: string[];
  successful: boolean;
}) {
  const { supabase } = args;
  if (!supabase || args.confidence < 0.75) return { recorded: false, promoted: false };
  const phraseKey = normalizeLearnedPhrase(args.query);
  if (!phraseKey) return { recorded: false, promoted: false };

  const { data: existing } = await supabase
    .from("search_phrase_learning_suggestions")
    .select("id,query_count,successful_outcome_count,negative_outcome_count,example_queries,suggested_intent,confidence_score")
    .eq("phrase_key", phraseKey)
    .maybeSingle();

  const existingIntent = existing?.suggested_intent && typeof existing.suggested_intent === "object"
    ? existing.suggested_intent as Record<string, unknown>
    : {};
  const previousRelationship = typeof existingIntent.relationship === "string" ? existingIntent.relationship : null;
  const consistent = !previousRelationship || previousRelationship === args.relationship;
  const queryCount = Number(existing?.query_count ?? 0) + 1;
  const successfulCount = Number(existing?.successful_outcome_count ?? 0) + (args.successful ? 1 : 0);
  const negativeCount = Number(existing?.negative_outcome_count ?? 0) + (args.successful ? 0 : 1);
  const examples = [...new Set([...(Array.isArray(existing?.example_queries) ? existing.example_queries.map(String) : []), args.query])].slice(0, 5);
  const confidence = consistent
    ? Math.max(Number(existing?.confidence_score ?? 0), args.confidence)
    : Math.min(Number(existing?.confidence_score ?? args.confidence), args.confidence, 0.6);

  const suggestedIntent = {
    relationship: args.relationship,
    ambiguity_reasons: args.ambiguityReasons,
    parser: "hybrid",
    llm_model: args.llmModel,
    consistent,
  };
  const suggestionPatch = {
    phrase_key: phraseKey,
    display_phrase: args.query.slice(0, 180),
    example_queries: examples,
    query_count: queryCount,
    successful_outcome_count: successfulCount,
    negative_outcome_count: negativeCount,
    suggested_intent: suggestedIntent,
    suggested_vibes: args.vibes,
    suggested_exclusions: args.exclusions,
    confidence_score: confidence,
    support_score: consistent ? queryCount : 0,
    source: "search_nlp_llm_disambiguation",
    status: "pending",
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    await supabase.from("search_phrase_learning_suggestions").update(suggestionPatch).eq("id", existing.id);
  } else {
    await supabase.from("search_phrase_learning_suggestions").insert({
      ...suggestionPatch,
      created_at: new Date().toISOString(),
    });
  }

  const promote = consistent && confidence >= 0.9 && successfulCount >= 3 && negativeCount === 0;
  if (!promote) return { recorded: true, promoted: false };

  const mapping = {
    phrase_key: phraseKey,
    display_phrase: args.query.slice(0, 180),
    match_type: "exact",
    priority: 25,
    approved_intent: {
      relationship: args.relationship,
      learned_from: "llm_repeated_success",
      llm_model: args.llmModel,
      ambiguity_reasons: args.ambiguityReasons,
    },
    vibes: args.vibes,
    exclusions: args.exclusions,
    confidence_score: confidence,
    support_score: successfulCount,
    is_active: true,
    approved_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { error: mappingError } = await supabase
    .from("search_phrase_learning_mappings")
    .upsert(mapping, { onConflict: "phrase_key" });
  if (mappingError) return { recorded: true, promoted: false };

  await supabase
    .from("search_phrase_learning_suggestions")
    .update({ status: "approved", reviewed_at: new Date().toISOString(), review_note: "Automatically promoted after 3 consistent high-confidence successful LLM interpretations." })
    .eq("phrase_key", phraseKey);

  return { recorded: true, promoted: true };
}
