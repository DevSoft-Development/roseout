import "server-only";

import OpenAIClient, { type ClientOptions } from "openai/index";
import {
  assistantApiBaseUrl,
  assistantApiConfigured,
  assistantSignedFetch,
} from "./assistant-api";

export { assistantApiConfigured };

const UNCONFIGURED_ASSISTANT_BASE_URL = "https://assistant.invalid";

export default class OpenAI extends OpenAIClient {
  constructor(options: ClientOptions = {}) {
    // Next.js may instantiate route-scoped OpenAI clients while collecting build metadata.
    // Keep construction side-effect free so an unrelated route cannot break the web build.
    // assistantSignedFetch remains fail-closed and validates the real AWS URL + shared secret
    // before any model request can leave the process.
    const baseUrl = assistantApiConfigured()
      ? assistantApiBaseUrl()
      : UNCONFIGURED_ASSISTANT_BASE_URL;

    super({
      ...options,
      apiKey: "aws-assistant",
      baseURL: `${baseUrl}/v1/openai`,
      maxRetries: 0,
      timeout: Number(process.env.AWS_PLATFORM_ASSISTANT_API_TIMEOUT_MS || 55_000),
      fetch: assistantSignedFetch,
    });
  }
}