export const HF_EMBEDDING_PROVIDER = "huggingface";
export const HF_EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5";
export const HF_EMBEDDING_VERSION = "hf-bge-small-en-v1.5:v2";
export const HF_EMBEDDING_DIMENSIONS = 384;
export const HF_RERANK_MODEL = "cross-encoder/ms-marco-MiniLM-L6-v2";
export const HF_RERANK_VERSION = "hf-msmarco-minilm-l6-v2:v1";

export type HfSearchMode = "disabled" | "shadow" | "enabled";
export type HfRerankResult = { index: number; score: number; rawScore: number | null };

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function normalizedMode(value: unknown, fallback: HfSearchMode): HfSearchMode {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["enabled", "on", "true", "1", "100"].includes(normalized)) return "enabled";
  if (["shadow", "observe", "test"].includes(normalized)) return "shadow";
  if (["disabled", "off", "false", "0", "no"].includes(normalized)) return "disabled";
  return fallback;
}

export function hfSearchMode(): HfSearchMode {
  if (process.env.SEARCH_HF_SEMANTIC_MODE) return normalizedMode(process.env.SEARCH_HF_SEMANTIC_MODE, "disabled");
  const legacyShadow = String(process.env.SEARCH_HF_SEMANTIC_SHADOW_ENABLED ?? "false").toLowerCase();
  return !["0", "false", "off", "no"].includes(legacyShadow) ? "shadow" : "disabled";
}

export function hfRerankMode(): HfSearchMode {
  return normalizedMode(process.env.SEARCH_HF_RERANK_MODE, hfSearchMode());
}

export function hfSemanticShadowEnabled() {
  return hfSearchMode() !== "disabled";
}

export function hfEmbeddingModel() {
  return process.env.SEARCH_HF_EMBEDDING_MODEL || HF_EMBEDDING_MODEL;
}

export function hfEmbeddingVersion() {
  return process.env.SEARCH_HF_EMBEDDING_VERSION || HF_EMBEDDING_VERSION;
}

export function hfRerankModel() {
  return process.env.SEARCH_HF_RERANK_MODEL || HF_RERANK_MODEL;
}

export function hfRerankVersion() {
  return process.env.SEARCH_HF_RERANK_VERSION || HF_RERANK_VERSION;
}

function endpointConfig() {
  const endpoint = String(process.env.SEARCH_HF_EMBEDDING_ENDPOINT || process.env.SEARCH_HF_ML_ENDPOINT || "").trim();
  const token = String(process.env.SEARCH_HF_EMBEDDING_TOKEN || process.env.SEARCH_HF_ML_TOKEN || "").trim();
  if (!endpoint) throw new Error("SEARCH_HF_ML_ENDPOINT is not configured");
  return { endpoint: trimTrailingSlash(endpoint), token };
}

async function postJson(path: string, body: unknown, timeoutMs: number) {
  const { endpoint, token } = endpointConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(250, timeoutMs));
  try {
    const response = await fetch(`${endpoint}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Hugging Face ML request ${path} failed: ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function validateEmbedding(value: unknown) {
  if (!Array.isArray(value) || value.length !== HF_EMBEDDING_DIMENSIONS) {
    throw new Error(`Hugging Face embedding response must contain ${HF_EMBEDDING_DIMENSIONS} dimensions`);
  }
  if (!value.every((item: unknown) => Number.isFinite(Number(item)))) {
    throw new Error("Hugging Face embedding response contained non-numeric values");
  }
  return value.map(Number);
}

export async function fetchHuggingFaceEmbeddings(texts: string[], options: { timeoutMs?: number } = {}) {
  const inputs = texts.map((text) => String(text ?? "").trim()).filter(Boolean);
  if (!inputs.length) return [] as number[][];
  const payload = await postJson(
    "/embed",
    { inputs, model: hfEmbeddingModel(), normalize: true },
    Number(options.timeoutMs ?? process.env.SEARCH_HF_EMBEDDING_REQUEST_TIMEOUT_MS ?? 2500),
  );
  const embeddings = payload?.embeddings ?? (payload?.embedding ? [payload.embedding] : payload?.data?.map?.((row: any) => row?.embedding));
  if (!Array.isArray(embeddings) || embeddings.length !== inputs.length) {
    throw new Error(`Hugging Face embedding response count mismatch: expected ${inputs.length}`);
  }
  return embeddings.map(validateEmbedding);
}

export async function fetchHuggingFaceEmbedding(text: string, options: { timeoutMs?: number } = {}) {
  const [embedding] = await fetchHuggingFaceEmbeddings([text], options);
  if (!embedding) throw new Error("Hugging Face embedding response was empty");
  return embedding;
}

export async function fetchHuggingFaceRerank(
  query: string,
  texts: string[],
  options: { timeoutMs?: number; topN?: number } = {},
): Promise<HfRerankResult[]> {
  const documents = texts.map((text) => String(text ?? "").trim());
  if (!documents.length) return [];
  const payload = await postJson(
    "/rerank",
    {
      query: String(query ?? "").trim(),
      texts: documents,
      model: hfRerankModel(),
      top_n: Math.max(1, Math.min(Number(options.topN ?? documents.length), documents.length)),
    },
    Number(options.timeoutMs ?? process.env.SEARCH_HF_RERANK_REQUEST_TIMEOUT_MS ?? 1800),
  );
  const rows = Array.isArray(payload?.results) ? payload.results : Array.isArray(payload) ? payload : [];
  return rows
    .map((row: any) => ({
      index: Number(row?.index),
      score: Number(row?.score ?? row?.relevance_score ?? 0),
      rawScore: Number.isFinite(Number(row?.raw_score)) ? Number(row.raw_score) : null,
    }))
    .filter((row: HfRerankResult) => Number.isInteger(row.index) && row.index >= 0 && row.index < documents.length && Number.isFinite(row.score));
}
