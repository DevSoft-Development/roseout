import { describe, expect, it, vi } from "vitest";
import { TheOutHavenAiGateway } from "../gateway";
import { AiProvider, AiProviderError } from "../types";

function provider(name: "azure" | "huggingface", invoke: AiProvider["invoke"]): AiProvider {
  return { name, invoke };
}

describe("TheOutHavenAiGateway", () => {
  it("uses Azure as the primary provider", async () => {
    const azureInvoke = vi.fn(async () => ({ model: "azure-model", output: "ok" }));
    const hfInvoke = vi.fn(async () => ({ model: "hf-model", output: "fallback" }));

    const gateway = new TheOutHavenAiGateway(
      provider("azure", azureInvoke),
      provider("huggingface", hfInvoke),
    );

    const result = await gateway.invoke({ capability: "generate", input: "hello" });

    expect(result).toEqual({
      provider: "azure",
      model: "azure-model",
      output: "ok",
      failoverUsed: false,
    });
    expect(hfInvoke).not.toHaveBeenCalled();
  });

  it.each([
    ["timeout", null],
    ["rate_limited", 429],
    ["provider_unavailable", 503],
    ["capacity_exhausted", null],
  ])("fails over to Hugging Face for %s", async (code, status) => {
    const gateway = new TheOutHavenAiGateway(
      provider("azure", async () => {
        throw new AiProviderError({
          provider: "azure",
          code,
          status,
          message: code,
        });
      }),
      provider("huggingface", async () => ({ model: "hf-model", output: "ok" })),
    );

    await expect(
      gateway.invoke({ capability: "reason", input: { prompt: "test" } }),
    ).resolves.toMatchObject({
      provider: "huggingface",
      failoverUsed: true,
      output: "ok",
    });
  });

  it("does not fail over merely because structured output is invalid", async () => {
    const azureInvoke = vi.fn(async () => ({ model: "azure-model", output: { invalid: true } }));
    const hfInvoke = vi.fn(async () => ({ model: "hf-model", output: { valid: true } }));

    const gateway = new TheOutHavenAiGateway(
      provider("azure", azureInvoke),
      provider("huggingface", hfInvoke),
    );

    await expect(
      gateway.invoke(
        { capability: "extract", input: "extract me" },
        {
          validateOutput: (output: any) => output?.valid === true,
          primaryValidationRetries: 1,
        },
      ),
    ).rejects.toMatchObject({ code: "invalid_structured_output" });

    expect(azureInvoke).toHaveBeenCalledTimes(2);
    expect(hfInvoke).not.toHaveBeenCalled();
  });

  it("does not fail over for non-retryable provider errors", async () => {
    const hfInvoke = vi.fn(async () => ({ model: "hf-model", output: "fallback" }));
    const gateway = new TheOutHavenAiGateway(
      provider("azure", async () => {
        throw new AiProviderError({
          provider: "azure",
          code: "invalid_request",
          status: 400,
          message: "bad request",
        });
      }),
      provider("huggingface", hfInvoke),
    );

    await expect(
      gateway.invoke({ capability: "classify", input: "test" }),
    ).rejects.toMatchObject({ code: "invalid_request" });

    expect(hfInvoke).not.toHaveBeenCalled();
  });
});
