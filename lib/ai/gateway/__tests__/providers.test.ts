import { afterEach, describe, expect, it, vi } from "vitest";
import { createAzureFoundryProvider } from "../providers/azure-foundry";
import { createHuggingFaceAiProvider } from "../providers/huggingface";
import { AiProviderError } from "../types";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AI provider adapters", () => {
  it("calls Azure Foundry through the OpenAI-compatible endpoint", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: "azure-ok" } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createAzureFoundryProvider({
      AZURE_AI_ENDPOINT: "https://toh-stg.services.ai.azure.com",
      AZURE_AI_API_KEY: "test-key",
      AZURE_AI_MODEL: "primary-model",
    } as NodeJS.ProcessEnv);

    const result = await provider.invoke({
      capability: "generate",
      input: "hello",
    });

    expect(result.output).toBe("azure-ok");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://toh-stg.services.ai.azure.com/openai/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "api-key": "test-key" }),
      }),
    );
  });

  it("calls Hugging Face with bearer authentication", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: "hf-ok" } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createHuggingFaceAiProvider({
      HUGGINGFACE_AI_TOKEN: "hf-test",
      HUGGINGFACE_AI_MODEL: "fallback-model",
    } as NodeJS.ProcessEnv);

    const result = await provider.invoke({
      capability: "classify",
      input: "hello",
    });

    expect(result.output).toBe("hf-ok");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://router.huggingface.co/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: "Bearer hf-test" }),
      }),
    );
  });

  it("normalizes throttling as a retryable provider error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { message: "throttled" } }), {
          status: 429,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const provider = createAzureFoundryProvider({
      AZURE_AI_ENDPOINT: "https://toh-stg.services.ai.azure.com",
      AZURE_AI_API_KEY: "test-key",
      AZURE_AI_MODEL: "primary-model",
    } as NodeJS.ProcessEnv);

    await expect(
      provider.invoke({ capability: "reason", input: "hello" }),
    ).rejects.toMatchObject<Partial<AiProviderError>>({
      code: "rate_limited",
      retryable: true,
      status: 429,
    });
  });

  it("uses the embedding endpoint for embed capability", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createAzureFoundryProvider({
      AZURE_AI_ENDPOINT: "https://toh-stg.services.ai.azure.com",
      AZURE_AI_API_KEY: "test-key",
      AZURE_AI_MODEL: "primary-model",
      AZURE_AI_EMBEDDING_MODEL: "embedding-model",
    } as NodeJS.ProcessEnv);

    const result = await provider.invoke({
      capability: "embed",
      input: ["hello"],
    });

    expect(result.model).toBe("embedding-model");
    expect(result.output).toEqual([[0.1, 0.2]]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://toh-stg.services.ai.azure.com/openai/v1/embeddings",
      expect.any(Object),
    );
  });
});
