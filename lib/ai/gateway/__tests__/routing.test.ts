import { describe, expect, it, vi } from "vitest";
import { TheOutHavenAiGateway } from "../gateway";
import {
  createAiTierRoutingConfig,
  resolveAiServiceTier,
  routeAiRequest,
  TieredAiGateway,
} from "../routing";
import { AiProvider } from "../types";

function provider(
  name: "azure" | "huggingface",
  invoke: AiProvider["invoke"],
): AiProvider {
  return { name, invoke };
}

describe("AI tier routing", () => {
  it("keeps ordinary requests on the standard model", () => {
    const routed = routeAiRequest(
      { capability: "generate", input: "hello" },
      {
        standardAzureModel: "toh-primary",
        reasoningAzureModel: "toh-reasoning",
        standardHuggingFaceModel: "hf-standard",
        reasoningHuggingFaceModel: "hf-reasoning",
      },
    );

    expect(routed.tier).toBe("standard");
    expect(routed.providerModels).toEqual({
      azure: "toh-primary",
      huggingface: "hf-standard",
    });
  });

  it.each(["high_value", "hard_reasoning"] as const)(
    "routes %s requests to the reasoning deployment",
    (tier) => {
      const routed = routeAiRequest(
        { capability: "reason", input: "plan", tier },
        {
          standardAzureModel: "toh-primary",
          reasoningAzureModel: "toh-reasoning",
          standardHuggingFaceModel: "hf-standard",
          reasoningHuggingFaceModel: "hf-reasoning",
        },
      );

      expect(routed.providerModels).toEqual({
        azure: "toh-reasoning",
        huggingface: "hf-reasoning",
      });
    },
  );

  it("falls back to the standard model until reasoning quota is enabled", () => {
    const routed = routeAiRequest(
      { capability: "reason", input: "complex", tier: "hard_reasoning" },
      {
        standardAzureModel: "toh-primary",
        standardHuggingFaceModel: "hf-standard",
      },
    );

    expect(routed.providerModels).toEqual({
      azure: "toh-primary",
      huggingface: "hf-standard",
    });
  });

  it("can infer escalation from deterministic request metadata", () => {
    expect(
      resolveAiServiceTier({
        capability: "generate",
        input: "customer recovery",
        metadata: { highValue: true },
      }),
    ).toBe("high_value");

    expect(
      resolveAiServiceTier({
        capability: "reason",
        input: "multi-step plan",
        metadata: { requiresDeepReasoning: true },
      }),
    ).toBe("hard_reasoning");
  });

  it("uses provider-specific model names across Azure failover", async () => {
    const azureInvoke = vi.fn(async (request: any) => {
      expect(request.model).toBe("toh-reasoning");
      throw new Error("network failure");
    });
    const hfInvoke = vi.fn(async (request: any) => {
      expect(request.model).toBe("hf-reasoning");
      return { model: request.model, output: "fallback-ok" };
    });

    const gateway = new TieredAiGateway(
      new TheOutHavenAiGateway(
        provider("azure", azureInvoke as AiProvider["invoke"]),
        provider("huggingface", hfInvoke as AiProvider["invoke"]),
      ),
      {
        standardAzureModel: "toh-primary",
        reasoningAzureModel: "toh-reasoning",
        standardHuggingFaceModel: "hf-standard",
        reasoningHuggingFaceModel: "hf-reasoning",
      },
    );

    await expect(
      gateway.invoke({
        capability: "reason",
        input: "hard problem",
        tier: "hard_reasoning",
      }),
    ).resolves.toMatchObject({
      provider: "huggingface",
      model: "hf-reasoning",
      output: "fallback-ok",
      failoverUsed: true,
    });

    expect(azureInvoke).toHaveBeenCalledTimes(1);
    expect(hfInvoke).toHaveBeenCalledTimes(1);
  });

  it("loads reasoning models independently from standard models", () => {
    expect(
      createAiTierRoutingConfig({
        AZURE_AI_MODEL: "toh-primary",
        AZURE_AI_REASONING_MODEL: "toh-reasoning",
        HUGGINGFACE_AI_MODEL: "hf-standard",
        HUGGINGFACE_AI_REASONING_MODEL: "hf-reasoning",
      } as NodeJS.ProcessEnv),
    ).toEqual({
      standardAzureModel: "toh-primary",
      reasoningAzureModel: "toh-reasoning",
      standardHuggingFaceModel: "hf-standard",
      reasoningHuggingFaceModel: "hf-reasoning",
    });
  });
});
