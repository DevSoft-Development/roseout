import { AiGatewayRequest, AiProvider, AiProviderError, AiProviderName } from "../types";

type OpenAiCompatibleProviderConfig = {
  name: AiProviderName;
  endpoint: string;
  apiKey: string;
  defaultModel: string;
  embeddingModel?: string;
  authHeader: "api-key" | "authorization";
};

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function errorCodeForStatus(status: number) {
  if (status === 408) return "timeout";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_unavailable";
  return "provider_error";
}

function serializeInput(input: unknown) {
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}

function capabilityInstruction(capability: AiGatewayRequest["capability"]) {
  switch (capability) {
    case "reason":
      return "Reason carefully, but return only the final answer and concise supporting explanation.";
    case "extract":
      return "Extract the requested structured information. Preserve facts and do not invent missing values.";
    case "classify":
      return "Classify the input according to the supplied categories or instructions.";
    case "rerank":
      return "Rerank the supplied candidates against the query and return the requested ordering.";
    case "moderate":
      return "Assess the supplied content against the requested safety policy and return the requested classification.";
    case "vision":
      return "Analyze the supplied visual content according to the user request.";
    default:
      return "Follow the user request accurately.";
  }
}

function normalizeMessages(request: AiGatewayRequest) {
  const candidate = request.input as { messages?: unknown } | null;
  if (candidate && typeof candidate === "object" && Array.isArray(candidate.messages)) {
    return candidate.messages;
  }

  return [
    { role: "system", content: capabilityInstruction(request.capability) },
    { role: "user", content: serializeInput(request.input) },
  ];
}

export class OpenAiCompatibleProvider implements AiProvider {
  readonly name: AiProviderName;
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private readonly embeddingModel: string;
  private readonly authHeader: "api-key" | "authorization";

  constructor(config: OpenAiCompatibleProviderConfig) {
    this.name = config.name;
    this.endpoint = trimTrailingSlash(config.endpoint);
    this.apiKey = config.apiKey;
    this.defaultModel = config.defaultModel;
    this.embeddingModel = config.embeddingModel || config.defaultModel;
    this.authHeader = config.authHeader;
  }

  async invoke<TInput = unknown, TOutput = unknown>(
    request: AiGatewayRequest<TInput>,
  ) {
    if (!this.endpoint || !this.apiKey) {
      throw new AiProviderError({
        provider: this.name,
        code: "provider_not_configured",
        message: `${this.name} AI provider is not configured.`,
      });
    }

    const controller = new AbortController();
    const timeoutMs = Math.max(250, request.timeoutMs ?? 30_000);
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const model =
      request.model ||
      (request.capability === "embed" ? this.embeddingModel : this.defaultModel);

    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (this.authHeader === "api-key") headers["api-key"] = this.apiKey;
    else headers.authorization = `Bearer ${this.apiKey}`;

    const path = request.capability === "embed" ? "/embeddings" : "/chat/completions";
    const body =
      request.capability === "embed"
        ? { model, input: request.input }
        : { model, messages: normalizeMessages(request as AiGatewayRequest) };

    try {
      const response = await fetch(`${this.endpoint}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new AiProviderError({
          provider: this.name,
          code: errorCodeForStatus(response.status),
          status: response.status,
          message:
            payload?.error?.message ||
            payload?.message ||
            `${this.name} AI request failed with HTTP ${response.status}.`,
          retryable: response.status === 408 || response.status === 429 || response.status >= 500,
        });
      }

      if (request.capability === "embed") {
        const rows = Array.isArray(payload?.data) ? payload.data : [];
        const embeddings = rows.map((row: any) => row?.embedding).filter(Array.isArray);
        if (!embeddings.length) {
          throw new AiProviderError({
            provider: this.name,
            code: "invalid_provider_response",
            message: `${this.name} embedding response contained no embeddings.`,
          });
        }
        return { model, output: embeddings as TOutput };
      }

      const content = payload?.choices?.[0]?.message?.content;
      if (content === undefined || content === null) {
        throw new AiProviderError({
          provider: this.name,
          code: "invalid_provider_response",
          message: `${this.name} chat response contained no message content.`,
        });
      }

      return { model, output: content as TOutput };
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new AiProviderError({
          provider: this.name,
          code: "timeout",
          message: `${this.name} AI request timed out.`,
          retryable: true,
          cause: error,
        });
      }
      throw new AiProviderError({
        provider: this.name,
        code: "network_error",
        message: `${this.name} AI request failed before receiving a response.`,
        retryable: true,
        cause: error,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
