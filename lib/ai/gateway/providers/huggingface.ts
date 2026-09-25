import { OpenAiCompatibleProvider } from "./openai-compatible";

const DEFAULT_HF_OPENAI_ENDPOINT = "https://router.huggingface.co/v1";

export function createHuggingFaceAiProvider(env: NodeJS.ProcessEnv = process.env) {
  const endpoint = String(env.HUGGINGFACE_AI_ENDPOINT || DEFAULT_HF_OPENAI_ENDPOINT).trim();
  const token = String(env.HUGGINGFACE_AI_TOKEN || "").trim();
  const model = String(env.HUGGINGFACE_AI_MODEL || "").trim();
  const embeddingModel = String(env.HUGGINGFACE_AI_EMBEDDING_MODEL || model).trim();

  return new OpenAiCompatibleProvider({
    name: "huggingface",
    endpoint,
    apiKey: token,
    defaultModel: model,
    embeddingModel,
    authHeader: "authorization",
  });
}
