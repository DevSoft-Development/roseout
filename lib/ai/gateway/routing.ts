import {
  AiGatewayOptions,
  AiGatewayRequest,
  AiGatewayResponse,
  AiServiceTier,
} from "./types";
import { TheOutHavenAiGateway } from "./gateway";

export type AiTierRoutingConfig = {
  standardAzureModel?: string;
  reasoningAzureModel?: string;
  standardHuggingFaceModel?: string;
  reasoningHuggingFaceModel?: string;
};

function nonEmpty(value: string | undefined) {
  const normalized = String(value || "").trim();
  return normalized || undefined;
}

export function resolveAiServiceTier(request: AiGatewayRequest): AiServiceTier {
  if (request.tier) return request.tier;

  if (request.metadata?.highValue === true) return "high_value";
  if (
    request.metadata?.requiresDeepReasoning === true ||
    request.metadata?.complexity === "high"
  ) {
    return "hard_reasoning";
  }

  return "standard";
}

export function createAiTierRoutingConfig(
  env: NodeJS.ProcessEnv = process.env,
): AiTierRoutingConfig {
  return {
    standardAzureModel: nonEmpty(env.AZURE_AI_MODEL),
    reasoningAzureModel: nonEmpty(env.AZURE_AI_REASONING_MODEL),
    standardHuggingFaceModel: nonEmpty(env.HUGGINGFACE_AI_MODEL),
    reasoningHuggingFaceModel: nonEmpty(env.HUGGINGFACE_AI_REASONING_MODEL),
  };
}

export function routeAiRequest<TInput>(
  request: AiGatewayRequest<TInput>,
  config: AiTierRoutingConfig,
): AiGatewayRequest<TInput> {
  const tier = resolveAiServiceTier(request);
  const reasoningTier = tier === "high_value" || tier === "hard_reasoning";

  const azureModel = reasoningTier
    ? config.reasoningAzureModel || config.standardAzureModel
    : config.standardAzureModel;

  const huggingFaceModel = reasoningTier
    ? config.reasoningHuggingFaceModel || config.standardHuggingFaceModel
    : config.standardHuggingFaceModel;

  return {
    ...request,
    tier,
    providerModels: {
      ...request.providerModels,
      ...(azureModel && !request.providerModels?.azure
        ? { azure: azureModel }
        : {}),
      ...(huggingFaceModel && !request.providerModels?.huggingface
        ? { huggingface: huggingFaceModel }
        : {}),
    },
  };
}

export class TieredAiGateway {
  constructor(
    private readonly gateway: TheOutHavenAiGateway,
    private readonly routing: AiTierRoutingConfig,
  ) {}

  invoke<TInput = unknown, TOutput = unknown>(
    request: AiGatewayRequest<TInput>,
    options: AiGatewayOptions<TOutput> = {},
  ): Promise<AiGatewayResponse<TOutput>> {
    return this.gateway.invoke<TInput, TOutput>(
      routeAiRequest(request, this.routing),
      options,
    );
  }
}
