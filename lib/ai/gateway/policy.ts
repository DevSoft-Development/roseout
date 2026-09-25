import { AiProviderError } from "./types";

const RETRYABLE_STATUS_CODES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

const RETRYABLE_CODES = new Set([
  "timeout",
  "network_error",
  "provider_unavailable",
  "capacity_exhausted",
  "rate_limited",
  "quota_exhausted",
]);

export function shouldFailOver(error: unknown) {
  if (error instanceof AiProviderError) {
    if (error.retryable) return true;
    if (error.status && RETRYABLE_STATUS_CODES.has(error.status)) return true;
    return RETRYABLE_CODES.has(error.code);
  }

  if (error instanceof DOMException && error.name === "AbortError") return true;

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("timeout") ||
      message.includes("timed out") ||
      message.includes("econnreset") ||
      message.includes("econnrefused") ||
      message.includes("network")
    );
  }

  return false;
}

export function isStructuredOutputValidationError(error: unknown) {
  return error instanceof AiProviderError && error.code === "invalid_structured_output";
}
