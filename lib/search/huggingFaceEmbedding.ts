export const HF_EMBEDDING_PROVIDER = "huggingface";
export const HF_EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5";
export const HF_EMBEDDING_VERSION = "hf-bge-small-en-v1.5:v1";
export const HF_EMBEDDING_DIMENSIONS = 384;

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function hfSemanticShadowEnabled() {
  return !["0", "false", "off", "no"].includes(String(process.env.SEARCH_HF_SEMANTIC_SHADOW_ENABLED ?? "false").toLowerCase());
}

export function hfEmbeddingModel() {
  return process.env.SEARCH_HF_EMBEDDING_MODEL || HF_EMBEDDING_MODEL;
}

export function hfEmbeddingVersion() {
  return process.env.SEARCH_HF_EMBEDDING_VERSION || HF_EMBEDDING_VERSION;
}

export async function fetchHuggingFaceEmbedding(text: string, options: { timeoutMs?: number } = {}) {
  const endpoint = String(process.env.SEARCH_HF_EMBEDDING_ENDPOINT || "").trim();
  const token = String(process.env.SEARCH_HF_EMBEDDING_TOKEN || "").trim();
  if (!endpoint) throw new Error("SEARCH_HF_EMBEDDING_ENDPOINT is not configured");

  const controller = new AbortController();
  const timeoutMs = Math.max(500, Number(options.timeoutMs ?? process.env.SEARCH_HF_EMBEDDING_REQUEST_TIMEOUT_MS ?? 2500));
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${trimTrailingSlash(endpoint)}/embed`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        input: text,
        model: hfEmbeddingModel(),
        normalize: true,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Hugging Face embedding request failed: ${response.status}`);
    const payload = await response.json();
    const embedding = payload?.embedding ?? payload?.data?.[0]?.embedding ?? payload?.embeddings?.[0];
    if (!Array.isArray(embedding) || embedding.length !== HF_EMBEDDING_DIMENSIONS) {
      throw new Error(`Hugging Face embedding response must contain ${HF_EMBEDDING_DIMENSIONS} dimensions`);
    }
    if (!embedding.every((value: unknown) => Number.isFinite(Number(value)))) {
      throw new Error("Hugging Face embedding response contained non-numeric values");
    }
    return embedding.map(Number);
  } finally {
    clearTimeout(timer);
  }
}
