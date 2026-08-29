export const HF_EMBEDDING_PROVIDER = "huggingface";
export const HF_EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5";
export const HF_EMBEDDING_VERSION = "hf-bge-small-en-v1.5:v2";
export const HF_EMBEDDING_DIMENSIONS = 384;
export const HF_RERANK_MODEL = "cross-encoder/ms-marco-MiniLM-L6-v2";
export const HF_RERANK_VERSION = "hf-msmarco-minilm-l6-v2:v1";
export const HF_VISION_MODEL = "google/siglip-base-patch16-224";
export const HF_VISION_VERSION = "hf-siglip-base-patch16-224:v1";
export const HF_VISION_EMBEDDING_DIMENSIONS = 768;

export type HfSearchMode = "disabled" | "enabled";
export type HfRerankResult = { index: number; score: number; rawScore: number | null };
export type HfLabelScore = { label: string; score: number };
export type HfTranslationResult = { text: string; translated: boolean; sourceLanguage: string | null; model: string | null };
export type HfIntentClassification = {
  confidence: number;
  needsRestaurant: boolean;
  needsActivity: boolean;
  wantsPairing: boolean;
  activityTypes: string[];
  vibes: string[];
  scores: Record<string, number>;
};

export type SearchMlRuntimeConfig = {
  endpoint: string;
  token: string;
  semanticMode: HfSearchMode;
  rerankMode: HfSearchMode;
  intentMode: HfSearchMode;
  queryMemoryMode: HfSearchMode;
  learningMode: HfSearchMode;
  menuMode: HfSearchMode;
  locationTagMode: HfSearchMode;
  photoIntelligenceMode: HfSearchMode;
  personalizationMode: HfSearchMode;
  embeddingModel: string;
  embeddingVersion: string;
  rerankModel: string;
  rerankVersion: string;
  visionModel: string;
  visionVersion: string;
};

const RUNTIME_CONFIG_TTL_MS = 60_000;
let runtimeConfigCache: { value: SearchMlRuntimeConfig; expiresAt: number } | null = null;
let runtimeConfigInFlight: Promise<SearchMlRuntimeConfig> | null = null;
const embeddingCache = new Map<string, { vector: number[]; expiresAt: number }>();
const EMBEDDING_CACHE_TTL_MS = 15 * 60_000;
const SHARED_EMBEDDING_CACHE_TTL_MS = 24 * 60 * 60_000;

function trimTrailingSlash(value: string) { return value.replace(/\/+$/, ""); }
function normalizedMode(value: unknown, fallback: HfSearchMode): HfSearchMode {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["enabled", "on", "true", "1", "100"].includes(normalized)) return "enabled";
  if (["shadow", "observe", "test"].includes(normalized)) return "disabled";
  if (["disabled", "off", "false", "0", "no"].includes(normalized)) return "disabled";
  return fallback;
}
function envMode(name: string) { const value = process.env[name]; return value ? normalizedMode(value, "disabled") : null; }
async function loadDatabaseRuntimeConfig() {
  try {
    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    const { data, error } = await supabaseAdmin.rpc("get_search_ml_runtime_config");
    if (error) throw error;
    return (Array.isArray(data) ? data[0] : data) ?? null;
  } catch { return null; }
}

export async function resolveSearchMlRuntimeConfig(): Promise<SearchMlRuntimeConfig> {
  if (runtimeConfigCache && runtimeConfigCache.expiresAt > Date.now()) return runtimeConfigCache.value;
  if (runtimeConfigInFlight) return runtimeConfigInFlight;
  runtimeConfigInFlight = (async () => {
    const db = await loadDatabaseRuntimeConfig();
    const endpoint = String(process.env.SEARCH_HF_EMBEDDING_ENDPOINT || process.env.SEARCH_HF_ML_ENDPOINT || db?.endpoint || "").trim();
    const token = String(process.env.SEARCH_HF_EMBEDDING_TOKEN || process.env.SEARCH_HF_ML_TOKEN || db?.auth_token || "").trim();
    const semanticMode = envMode("SEARCH_HF_SEMANTIC_MODE") ?? normalizedMode(db?.semantic_mode, "disabled");
    const rerankMode = envMode("SEARCH_HF_RERANK_MODE") ?? normalizedMode(db?.rerank_mode, semanticMode);
    const value: SearchMlRuntimeConfig = {
      endpoint: endpoint ? trimTrailingSlash(endpoint) : "", token, semanticMode, rerankMode,
      intentMode: envMode("SEARCH_HF_INTENT_MODE") ?? normalizedMode(db?.intent_mode, "disabled"),
      queryMemoryMode: envMode("SEARCH_HF_QUERY_MEMORY_MODE") ?? normalizedMode(db?.query_memory_mode, "disabled"),
      learningMode: envMode("SEARCH_HF_LEARNING_MODE") ?? normalizedMode(db?.learning_mode, "disabled"),
      menuMode: envMode("SEARCH_HF_MENU_MODE") ?? normalizedMode(db?.menu_mode, "disabled"),
      locationTagMode: envMode("SEARCH_HF_LOCATION_TAG_MODE") ?? normalizedMode(db?.location_tag_mode, "disabled"),
      photoIntelligenceMode: envMode("SEARCH_HF_PHOTO_INTELLIGENCE_MODE") ?? normalizedMode(db?.photo_intelligence_mode, "disabled"),
      personalizationMode: envMode("SEARCH_HF_PERSONALIZATION_MODE") ?? normalizedMode(db?.personalization_mode, "disabled"),
      embeddingModel: process.env.SEARCH_HF_EMBEDDING_MODEL || db?.embedding_model || HF_EMBEDDING_MODEL,
      embeddingVersion: process.env.SEARCH_HF_EMBEDDING_VERSION || db?.embedding_version || HF_EMBEDDING_VERSION,
      rerankModel: process.env.SEARCH_HF_RERANK_MODEL || db?.rerank_model || HF_RERANK_MODEL,
      rerankVersion: process.env.SEARCH_HF_RERANK_VERSION || db?.rerank_version || HF_RERANK_VERSION,
      visionModel: process.env.SEARCH_HF_VISION_MODEL || db?.vision_model || HF_VISION_MODEL,
      visionVersion: process.env.SEARCH_HF_VISION_VERSION || db?.vision_version || HF_VISION_VERSION,
    };
    runtimeConfigCache = { value, expiresAt: Date.now() + RUNTIME_CONFIG_TTL_MS };
    return value;
  })().finally(() => { runtimeConfigInFlight = null; });
  return runtimeConfigInFlight;
}

export function clearSearchMlRuntimeConfigCache() { runtimeConfigCache = null; }
export async function resolveHfSearchMode() { return (await resolveSearchMlRuntimeConfig()).semanticMode; }
export async function resolveHfRerankMode() { return (await resolveSearchMlRuntimeConfig()).rerankMode; }
export function hfSearchMode(): HfSearchMode { return envMode("SEARCH_HF_SEMANTIC_MODE") ?? "disabled"; }
export function hfRerankMode(): HfSearchMode { return envMode("SEARCH_HF_RERANK_MODE") ?? hfSearchMode(); }
export function hfSemanticShadowEnabled() { return hfSearchMode() === "enabled"; }
export function hfEmbeddingModel() { return process.env.SEARCH_HF_EMBEDDING_MODEL || HF_EMBEDDING_MODEL; }
export function hfEmbeddingVersion() { return process.env.SEARCH_HF_EMBEDDING_VERSION || HF_EMBEDDING_VERSION; }
export function hfRerankModel() { return process.env.SEARCH_HF_RERANK_MODEL || HF_RERANK_MODEL; }
export function hfRerankVersion() { return process.env.SEARCH_HF_RERANK_VERSION || HF_RERANK_VERSION; }

async function postJson(path: string, body: unknown, timeoutMs: number) {
  const config = await resolveSearchMlRuntimeConfig();
  if (!config.endpoint) throw new Error("SEARCH_HF_ML_ENDPOINT is not configured");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(250, timeoutMs));
  try {
    const response = await fetch(`${config.endpoint}${path}`, { method: "POST", headers: { "content-type": "application/json", ...(config.token ? { authorization: `Bearer ${config.token}` } : {}) }, body: JSON.stringify(body), signal: controller.signal });
    if (!response.ok) throw new Error(`Hugging Face ML request ${path} failed: ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timer); }
}

function validateEmbedding(value: unknown) {
  if (!Array.isArray(value) || value.length !== HF_EMBEDDING_DIMENSIONS) throw new Error(`Hugging Face embedding response must contain ${HF_EMBEDDING_DIMENSIONS} dimensions`);
  if (!value.every((item: unknown) => Number.isFinite(Number(item)))) throw new Error("Hugging Face embedding response contained non-numeric values");
  return value.map(Number);
}

function validateVisionEmbedding(value: unknown) {
  if (!Array.isArray(value) || value.length !== HF_VISION_EMBEDDING_DIMENSIONS) throw new Error(`Hugging Face vision embedding response must contain ${HF_VISION_EMBEDDING_DIMENSIONS} dimensions`);
  if (!value.every((item: unknown) => Number.isFinite(Number(item)))) throw new Error("Hugging Face vision embedding response contained non-numeric values");
  return value.map(Number);
}

function parseVector(value: unknown) {
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return null;
  const parsed = trimmed.slice(1, -1).split(",").map((part) => Number(part.trim()));
  return parsed.every(Number.isFinite) ? parsed : null;
}

async function digestCacheKey(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readSharedEmbedding(normalized: string, config: SearchMlRuntimeConfig) {
  if (process.env.SEARCH_HF_SHARED_EMBEDDING_CACHE === "false") return null;
  try {
    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    const cacheKey = await digestCacheKey(`${config.embeddingVersion}\n${normalized.toLowerCase()}`);
    const { data, error } = await supabaseAdmin.from("search_ml_query_embedding_cache")
      .select("embedding,expires_at")
      .eq("cache_key", cacheKey)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error || !data) return null;
    const vector = parseVector(data.embedding);
    return vector?.length === HF_EMBEDDING_DIMENSIONS ? vector : null;
  } catch {
    return null;
  }
}

async function writeSharedEmbedding(normalized: string, vector: number[], config: SearchMlRuntimeConfig) {
  if (process.env.SEARCH_HF_SHARED_EMBEDDING_CACHE === "false") return;
  try {
    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    const cacheKey = await digestCacheKey(`${config.embeddingVersion}\n${normalized.toLowerCase()}`);
    await supabaseAdmin.from("search_ml_query_embedding_cache").upsert({
      cache_key: cacheKey,
      normalized_text: normalized.slice(0, 5000),
      embedding: vector,
      embedding_model: config.embeddingModel,
      embedding_version: config.embeddingVersion,
      expires_at: new Date(Date.now() + SHARED_EMBEDDING_CACHE_TTL_MS).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "cache_key" });
  } catch {
    // Shared cache is an optimization only.
  }
}

export async function fetchHuggingFaceEmbeddings(texts: string[], options: { timeoutMs?: number } = {}) {
  const inputs = texts.map((text) => String(text ?? "").trim()).filter(Boolean);
  if (!inputs.length) return [] as number[][];
  const config = await resolveSearchMlRuntimeConfig();
  const payload = await postJson("/embed", { inputs, model: config.embeddingModel, normalize: true }, Number(options.timeoutMs ?? process.env.SEARCH_HF_EMBEDDING_REQUEST_TIMEOUT_MS ?? 2500));
  const embeddings = payload?.embeddings ?? (payload?.embedding ? [payload.embedding] : payload?.data?.map?.((row: any) => row?.embedding));
  if (!Array.isArray(embeddings) || embeddings.length !== inputs.length) throw new Error(`Hugging Face embedding response count mismatch: expected ${inputs.length}`);
  return embeddings.map(validateEmbedding);
}

export async function fetchHuggingFaceEmbedding(text: string, options: { timeoutMs?: number; cache?: boolean; sharedCache?: boolean } = {}) {
  const normalized = String(text ?? "").trim();
  if (!normalized) throw new Error("Hugging Face embedding input was empty");
  const config = await resolveSearchMlRuntimeConfig();
  const localKey = `${config.embeddingVersion}:${normalized.toLowerCase()}`;
  const cached = options.cache === false ? null : embeddingCache.get(localKey);
  if (cached && cached.expiresAt > Date.now()) return cached.vector;
  if (options.cache !== false && options.sharedCache !== false) {
    const shared = await readSharedEmbedding(normalized, config);
    if (shared) {
      embeddingCache.set(localKey, { vector: shared, expiresAt: Date.now() + EMBEDDING_CACHE_TTL_MS });
      return shared;
    }
  }
  const [embedding] = await fetchHuggingFaceEmbeddings([normalized], options);
  if (!embedding) throw new Error("Hugging Face embedding response was empty");
  if (options.cache !== false) {
    embeddingCache.set(localKey, { vector: embedding, expiresAt: Date.now() + EMBEDDING_CACHE_TTL_MS });
    if (options.sharedCache !== false) void writeSharedEmbedding(normalized, embedding, config);
  }
  return embedding;
}

export async function fetchHuggingFaceRerank(query: string, texts: string[], options: { timeoutMs?: number; topN?: number } = {}): Promise<HfRerankResult[]> {
  const documents = texts.map((text) => String(text ?? "").trim());
  if (!documents.length) return [];
  const config = await resolveSearchMlRuntimeConfig();
  const payload = await postJson("/rerank", { query: String(query ?? "").trim(), texts: documents, model: config.rerankModel, top_n: Math.max(1, Math.min(Number(options.topN ?? documents.length), documents.length)) }, Number(options.timeoutMs ?? process.env.SEARCH_HF_RERANK_REQUEST_TIMEOUT_MS ?? 1800));
  const rows = Array.isArray(payload?.results) ? payload.results : Array.isArray(payload) ? payload : [];
  return rows.map((row: any) => ({ index: Number(row?.index), score: Number(row?.score ?? row?.relevance_score ?? 0), rawScore: Number.isFinite(Number(row?.raw_score)) ? Number(row.raw_score) : null })).filter((row: HfRerankResult) => Number.isInteger(row.index) && row.index >= 0 && row.index < documents.length && Number.isFinite(row.score));
}

export async function fetchHuggingFaceTextClassification(text: string, labels: string[], options: { timeoutMs?: number; topN?: number; minScore?: number } = {}): Promise<HfLabelScore[]> {
  if (!labels.length) return [];
  const payload = await postJson("/classify-text", { text, labels, top_n: options.topN ?? labels.length, min_score: options.minScore ?? 0 }, Number(options.timeoutMs ?? 1800));
  return (Array.isArray(payload?.results) ? payload.results : []).map((row: any) => ({ label: String(row?.label ?? ""), score: Number(row?.score ?? 0) })).filter((row: HfLabelScore) => row.label && Number.isFinite(row.score));
}

export async function fetchHuggingFaceIntentClassification(text: string, options: { timeoutMs?: number } = {}): Promise<HfIntentClassification> {
  const payload = await postJson("/classify-intent", { text }, Number(options.timeoutMs ?? 1800));
  return {
    confidence: Number(payload?.confidence ?? 0), needsRestaurant: Boolean(payload?.needs_restaurant), needsActivity: Boolean(payload?.needs_activity), wantsPairing: Boolean(payload?.wants_pairing),
    activityTypes: Array.isArray(payload?.activity_types) ? payload.activity_types.map(String) : [], vibes: Array.isArray(payload?.vibes) ? payload.vibes.map(String) : [],
    scores: payload?.scores && typeof payload.scores === "object" ? Object.fromEntries(Object.entries(payload.scores).map(([key, value]) => [key, Number(value)])) : {},
  };
}

export async function fetchHuggingFaceImageClassification(imageBase64: string, options: { timeoutMs?: number } = {}): Promise<HfLabelScore[]> {
  const payload = await postJson("/classify-image", { image_base64: imageBase64 }, Number(options.timeoutMs ?? 6000));
  return (Array.isArray(payload?.results) ? payload.results : []).map((row: any) => ({ label: String(row?.label ?? ""), score: Number(row?.score ?? 0) })).filter((row: HfLabelScore) => row.label && Number.isFinite(row.score));
}

export async function fetchHuggingFaceImageEmbedding(imageBase64: string, options: { timeoutMs?: number } = {}) {
  const payload = await postJson("/image-embed", { image_base64: imageBase64 }, Number(options.timeoutMs ?? 8000));
  return validateVisionEmbedding(payload?.embedding);
}

export async function fetchHuggingFaceTranslation(text: string, options: { timeoutMs?: number } = {}): Promise<HfTranslationResult> {
  const normalized = String(text ?? "").trim();
  if (!normalized) return { text: normalized, translated: false, sourceLanguage: null, model: null };
  const payload = await postJson("/translate-to-english", { text: normalized }, Number(options.timeoutMs ?? 3500));
  return {
    text: String(payload?.text ?? normalized),
    translated: Boolean(payload?.translated),
    sourceLanguage: payload?.source_language ? String(payload.source_language) : null,
    model: payload?.model ? String(payload.model) : null,
  };
}
