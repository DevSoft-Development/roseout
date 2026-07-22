import { describe, expect, it } from "vitest";
import {
  normalizePublicSearchRequest,
  parseJsonBody,
} from "./normalizeRequest";
import {
  createPublicSearchResponse,
  serializePublicSearchResponse,
} from "./normalizeResponse";
import {
  PublicSearchError,
  resolveRequestId,
  withStageDeadline,
} from "./errors";

function request(body: unknown = {}, headers?: HeadersInit) {
  return new Request("https://example.test/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("public search API contract", () => {
  it("normalizes query/input aliases, location fields, radius, timezone, debug, and IDs", () => {
    const normalized = normalizePublicSearchRequest(
      {
        input: "dinner near me",
        user_location: { lat: "40.7", lng: "-73.9" },
        radius_miles: "8",
        timezone: "America/Chicago",
        use_current_location: true,
        debug: true,
        anonymous_id: "anon-1",
        beta_assignment_id: "assign-1",
        beta_tester_id: "tester-1",
      },
      request(),
    );
    expect(normalized).toMatchObject({
      query: "dinner near me",
      latitude: 40.7,
      longitude: -73.9,
      radiusMiles: 8,
      timezone: "America/Chicago",
      useCurrentLocation: true,
      debug: true,
      anonymousId: "anon-1",
      betaAssignmentId: "assign-1",
      betaTesterId: "tester-1",
    });
  });

  it.each([
    [{}, "QUERY_REQUIRED"],
    [{ query: "" }, "QUERY_REQUIRED"],
    [{ query: "x".repeat(501) }, "QUERY_TOO_LONG"],
    [{ query: "pizza", latitude: 91 }, "INVALID_LATITUDE"],
    [{ query: "pizza", longitude: -181 }, "INVALID_LONGITUDE"],
    [{ query: "pizza", radius: 0 }, "INVALID_RADIUS"],
  ])("rejects invalid request %#", (body, code) => {
    expect(() => normalizePublicSearchRequest(body, request())).toThrowError(
      PublicSearchError,
    );
    try {
      normalizePublicSearchRequest(body, request());
    } catch (error) {
      expect((error as PublicSearchError).code).toBe(code);
      expect((error as PublicSearchError).status).toBe(400);
    }
  });

  it("rejects malformed JSON", async () => {
    await expect(parseJsonBody(request("{"))).rejects.toMatchObject({
      code: "MALFORMED_JSON",
      status: 400,
    });
  });

  it("keeps stable response keys across success, empty, and failure cases", () => {
    for (const response of [
      createPublicSearchResponse({
        requestId: "req-success",
        status: "success",
        payload: {
          restaurants: [{ id: 1 }],
          activities: [],
          pairs: [],
          cards: [],
        },
      }),
      createPublicSearchResponse({ requestId: "req-empty", status: "empty" }),
      createPublicSearchResponse({
        requestId: "req-fail",
        status: "temporarily_unavailable",
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "Temporarily unavailable.",
          retryable: true,
        },
      }),
    ]) {
      expect(Object.keys(response)).toEqual(
        expect.arrayContaining([
          "success",
          "status",
          "requestId",
          "restaurants",
          "activities",
          "pairs",
          "cards",
          "counts",
          "error",
        ]),
      );
    }
  });

  it("propagates request ID in JSON and X-Request-ID header", async () => {
    const response = serializePublicSearchResponse(
      createPublicSearchResponse({
        requestId: "trusted-req-1",
        status: "empty",
      }),
      { status: 200 },
    );
    expect(response.headers.get("X-Request-ID")).toBe("trusted-req-1");
    await expect(response.json()).resolves.toMatchObject({
      requestId: "trusted-req-1",
    });
  });

  it("prefers incoming valid request IDs and rejects invalid ones", () => {
    expect(
      resolveRequestId(new Headers({ "x-request-id": "trusted-req-123" })),
    ).toBe("trusted-req-123");
    expect(
      resolveRequestId(new Headers({ "x-request-id": "bad id with spaces" })),
    ).not.toBe("bad id with spaces");
  });

  it("enforces stage timeout", async () => {
    process.env.PUBLIC_SEARCH_PARSE_TIMEOUT_MS = "100";
    await expect(
      withStageDeadline(
        "parse",
        new Promise((resolve) => setTimeout(resolve, 200)),
      ),
    ).rejects.toMatchObject({ code: "SEARCH_TIMEOUT", status: 503 });
    delete process.env.PUBLIC_SEARCH_PARSE_TIMEOUT_MS;
  });
});
