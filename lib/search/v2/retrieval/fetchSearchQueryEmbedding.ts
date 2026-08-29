import { fetchHuggingFaceEmbedding } from "../../huggingFaceEmbedding";

const inFlight = new Map<string, Promise<number[]>>();

export function fetchSearchQueryEmbedding(
  text: string,
  options: { timeoutMs?: number } = {},
) {
  const normalized = String(text ?? "").trim();
  if (!normalized) return fetchHuggingFaceEmbedding(text, options);

  const timeoutMs = Number(
    options.timeoutMs ?? process.env.SEARCH_HF_EMBEDDING_REQUEST_TIMEOUT_MS ?? 2500,
  );
  const key = `${timeoutMs}:${normalized.toLowerCase()}`;
  const existing = inFlight.get(key);
  if (existing) return existing;

  const request = fetchHuggingFaceEmbedding(normalized, options).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, request);
  return request;
}
