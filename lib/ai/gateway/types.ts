export type AiCapability =
  | "generate"
  | "reason"
  | "extract"
  | "classify"
  | "embed"
  | "rerank"
  | "moderate"
  | "vision";

export type AiProviderName = "azure" | "huggingface";

export type AiServiceTier = "standard" | "high_value" | "hard_reasoning";

export type AiGatewayRequest<TInput = unknown> = {
  capability: AiCapability;
  input: TInput;
  model?: string;
  tier?: AiServiceTier;
  providerModels?: Partial<Record<AiProviderName, string>>;
  timeoutMs?: number;
  metadata?: Record<string, string | number | boolean | null>;
};

export type AiGatewayResponse<TOutput = unknown> = {
  provider: AiProviderName;
  model: string | null;
  output: TOutput;
  failoverUsed: boolean;
};

export type AiProviderResult<TOutput = unknown> = {
  model?: string | null;
  output: TOutput;
};

export interface AiProvider {
  readonly name: AiProviderName;
  invoke<TInput = unknown, TOutput = unknown>(
    request: AiGatewayRequest<TInput>,
  ): Promise<AiProviderResult<TOutput>>;
}

export type AiGatewayOptions<TOutput = unknown> = {
  validateOutput?: (output: TOutput) => boolean;
  primaryValidationRetries?: number;
};

export class AiProviderError extends Error {
  readonly provider: AiProviderName;
  readonly code: string;
  readonly status: number | null;
  readonly retryable: boolean;

  constructor(params: {
    provider: AiProviderName;
    code: string;
    message: string;
    status?: number | null;
    retryable?: boolean;
    cause?: unknown;
  }) {
    super(params.message, { cause: params.cause });
    this.name = "AiProviderError";
    this.provider = params.provider;
    this.code = params.code;
    this.status = params.status ?? null;
    this.retryable = params.retryable ?? false;
  }
}
