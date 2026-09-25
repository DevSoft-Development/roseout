import {
  AiGatewayOptions,
  AiGatewayRequest,
  AiGatewayResponse,
  AiProvider,
  AiProviderError,
} from "./types";
import { shouldFailOver } from "./policy";

export class TheOutHavenAiGateway {
  constructor(
    private readonly primary: AiProvider,
    private readonly fallback: AiProvider,
  ) {
    if (primary.name !== "azure") {
      throw new Error("TheOutHaven AI gateway primary provider must be Azure.");
    }
    if (fallback.name !== "huggingface") {
      throw new Error("TheOutHaven AI gateway fallback provider must be Hugging Face.");
    }
  }

  private async invokeProvider<TInput, TOutput>(
    provider: AiProvider,
    request: AiGatewayRequest<TInput>,
    options: AiGatewayOptions<TOutput>,
  ) {
    const validationRetries = Math.max(0, options.primaryValidationRetries ?? 1);
    let attempt = 0;

    while (true) {
      const providerRequest: AiGatewayRequest<TInput> = {
        ...request,
        model: request.providerModels?.[provider.name] ?? request.model,
      };
      const result = await provider.invoke<TInput, TOutput>(providerRequest);
      if (!options.validateOutput || options.validateOutput(result.output)) return result;

      if (attempt >= validationRetries) {
        throw new AiProviderError({
          provider: provider.name,
          code: "invalid_structured_output",
          message: `${provider.name} returned output that failed validation.`,
          retryable: false,
        });
      }

      attempt += 1;
    }
  }

  async invoke<TInput = unknown, TOutput = unknown>(
    request: AiGatewayRequest<TInput>,
    options: AiGatewayOptions<TOutput> = {},
  ): Promise<AiGatewayResponse<TOutput>> {
    try {
      const result = await this.invokeProvider<TInput, TOutput>(
        this.primary,
        request,
        options,
      );

      return {
        provider: this.primary.name,
        model:
          result.model ?? request.providerModels?.[this.primary.name] ?? request.model ?? null,
        output: result.output,
        failoverUsed: false,
      };
    } catch (error) {
      if (!shouldFailOver(error)) throw error;
    }

    const fallbackResult = await this.invokeProvider<TInput, TOutput>(
      this.fallback,
      request,
      options,
    );

    return {
      provider: this.fallback.name,
      model:
        fallbackResult.model ??
        request.providerModels?.[this.fallback.name] ??
        request.model ??
        null,
      output: fallbackResult.output,
      failoverUsed: true,
    };
  }
}
