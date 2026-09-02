import "server-only";

import OpenAIClient, { type ClientOptions } from "openai";
import {
  assistantApiBaseUrl,
  assistantApiConfigured,
  assistantSignedFetch,
} from "./assistant-api";

export { assistantApiConfigured };

export default class OpenAI extends OpenAIClient {
  constructor(options: ClientOptions = {}) {
    if (!assistantApiConfigured()) {
      throw new Error("AWS Assistant API is not configured.");
    }
    super({
      ...options,
      apiKey: "aws-assistant",
      baseURL: `${assistantApiBaseUrl()}/v1/openai`,
      maxRetries: 0,
      timeout: Number(process.env.AWS_PLATFORM_ASSISTANT_API_TIMEOUT_MS || 55_000),
      fetch: assistantSignedFetch,
    });
  }
}
