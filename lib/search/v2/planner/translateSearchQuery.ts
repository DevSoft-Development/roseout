import { fetchHuggingFaceTranslation, resolveSearchMlRuntimeConfig } from "../../huggingFaceEmbedding";

export type SearchTranslationResult = {
  query: string;
  originalQuery: string;
  translated: boolean;
  sourceLanguage: string | null;
  model: string | null;
  attempted: boolean;
  error: string | null;
};

const NON_ENGLISH_MARKERS = /\b(?:cena|comida|con|cerca|despues|después|romantica|romántica|musica|música|noche|divertido|divertida|brunch con|et|avec|près|pres|apres|après|dîner|diner romantique|soirée|ristorante|vicino|dopocena|abendessen|mit|nähe|nahe|jantar|com|perto|depois|diversão|diversao)\b/i;

function shouldAttemptTranslation(query: string) {
  if (!query.trim()) return false;
  if (/[^\x00-\x7F]/.test(query)) return true;
  return NON_ENGLISH_MARKERS.test(query);
}

export async function translateSearchQuery(query: string): Promise<SearchTranslationResult> {
  const originalQuery = String(query ?? "").trim();
  const base: SearchTranslationResult = {
    query: originalQuery,
    originalQuery,
    translated: false,
    sourceLanguage: null,
    model: null,
    attempted: false,
    error: null,
  };
  if (!shouldAttemptTranslation(originalQuery)) return base;
  try {
    const config = await resolveSearchMlRuntimeConfig();
    if (config.semanticMode === "disabled" && config.intentMode === "disabled") return base;
    const result = await fetchHuggingFaceTranslation(originalQuery, { timeoutMs: Number(process.env.SEARCH_HF_TRANSLATION_TIMEOUT_MS || 3500) });
    const translatedQuery = String(result.text ?? "").trim();
    if (!result.translated || !translatedQuery) return { ...base, attempted: true, sourceLanguage: result.sourceLanguage, model: result.model };
    return {
      query: translatedQuery,
      originalQuery,
      translated: true,
      sourceLanguage: result.sourceLanguage,
      model: result.model,
      attempted: true,
      error: null,
    };
  } catch (error) {
    return { ...base, attempted: true, error: error instanceof Error ? error.message : "translation_failed" };
  }
}
