import { OpenAiCompatibleProvider } from "./openai-compatible";

function azureOpenAiBaseUrl(endpoint: string) {
  return `${endpoint.replace(/\/+$/, "")}/openai/v1`;
}

export function createAzureFoundryProvider(env: NodeJS.ProcessEnv = process.env) {
  const endpoint = String(env.AZURE_AI_ENDPOINT || "").trim();
  const apiKey = String(env.AZURE_AI_API_KEY || "").trim();
  const model = String(env.AZURE_AI_MODEL || "").trim();
  const embeddingModel = String(env.AZURE_AI_EMBEDDING_MODEL || model).trim();

  return new OpenAiCompatibleProvider({
    name: "azure",
    endpoint: endpoint ? azureOpenAiBaseUrl(endpoint) : "",
    apiKey,
    defaultModel: model,
    embeddingModel,
    authHeader: "api-key",
  });
}
