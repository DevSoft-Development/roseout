import type {
  PublicSearchCounts,
  PublicSearchResponse,
  PublicSearchStatus,
} from "./contracts";
import { PublicSearchError, isTimeoutError } from "./errors";

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function countsFrom(
  payload: Record<string, unknown>,
): PublicSearchCounts {
  const restaurants = list(payload.restaurants).length;
  const activities = list(payload.activities).length;
  const pairs = list(payload.pairs).length;
  const cards = list(payload.cards).length;
  return { restaurants, activities, pairs, cards };
}

export function createPublicSearchResponse(args: {
  requestId: string;
  status: PublicSearchStatus;
  payload?: Record<string, unknown>;
  error?: { code: string; message: string; retryable: boolean } | null;
  debug?: Record<string, unknown>;
}): PublicSearchResponse {
  const payload = args.payload ?? {};
  const restaurants = list(payload.restaurants);
  const activities = list(payload.activities);
  const pairs = list(payload.pairs);
  const cards = list(payload.cards);
  const counts = countsFrom({
    ...payload,
    restaurants,
    activities,
    pairs,
    cards,
  });
  return {
    ...payload,
    success: args.status === "success" || args.status === "empty",
    status: args.status,
    requestId: args.requestId,
    restaurants,
    activities,
    pairs,
    cards,
    counts,
    error: args.error ?? null,
    ...(args.debug ? { debug: args.debug } : {}),
  };
}

export function statusFromSuccessfulPayload(
  payload: Record<string, unknown>,
): PublicSearchStatus {
  const counts = countsFrom(payload);
  return counts.restaurants + counts.activities + counts.pairs + counts.cards >
    0
    ? "success"
    : "empty";
}

export function publicErrorFrom(error: unknown): {
  status: PublicSearchStatus;
  code: string;
  message: string;
  retryable: boolean;
} {
  if (isTimeoutError(error))
    return {
      status: "timeout",
      code: error.code,
      message: "Search timed out. Please try again.",
      retryable: true,
    };
  if (error instanceof PublicSearchError) {
    const status: PublicSearchStatus =
      error.status === 429
        ? "limited"
        : error.status === 503
          ? "temporarily_unavailable"
          : error.status === 400
            ? "invalid_request"
            : "failed";
    return {
      status,
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/supabase|database|db|fetch failed|econnreset|etimedout/i.test(message)) {
    return {
      status: "temporarily_unavailable",
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Search is temporarily unavailable. Please try again.",
      retryable: true,
    };
  }
  return {
    status: "failed",
    code: "INTERNAL_ERROR",
    message: "Search is having trouble right now. Please try again.",
    retryable: true,
  };
}

export function serializePublicSearchResponse(
  response: PublicSearchResponse,
  init?: ResponseInit,
): Response {
  const headers = new Headers(init?.headers);
  headers.set("X-Request-ID", response.requestId);
  headers.set("Content-Type", "application/json");
  return Response.json(response, { ...init, headers });
}
