import { describe, expect, it } from "vitest";
import { handleGeneratePost } from "./controller";
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

describe("public controller bowling regression", () => {
  it("preserves qualified activity counts and fast-path parser source from injected enterprise results", async () => {
    const analyticsPayloads: any[] = [];
    const response = await handleGeneratePost(
      request({ query: "steak and bowling in manhattan", debug: true }),
      {
        getIdentity: async () => ({ user: null, authUser: null, identity: { key: "anon", type: "anonymous" as const } } as any),
        checkLimit: async () => ({ allowed: true, plan: { planKey: "free" } } as any),
        recordUsage: async () => undefined,
        logAnalytics: async (payload: any) => { analyticsPayloads.push(payload); return { ok: true }; },
        logSearchHealth: async () => ({ ok: true }),
        logRouteTiming: () => undefined,
        now: (() => { let t = 0; return () => ++t; })(),
        runSearch: async () => ({
          reply: "Found steak and bowling.",
          render_mode: "pairs",
          restaurants: [{ id: "r1", name: "Keens Steakhouse", location_type: "restaurant", primary_category: "steakhouse", market: "NYC_CORE", state: "NY" }],
          activities: [
            { id: "a1", name: "Lucky Strike Times Square", location_type: "activity", activity_type: "bowling", market: "NYC_CORE", state: "NY" },
            { id: "a2", name: "The Gutter L.E.S.", location_type: "activity", primary_category: "bowling", market: "NYC_CORE", state: "NY" },
            { id: "a3", name: "Lucky Strike Chelsea Piers", location_type: "activity", google_types: ["bowling_alley"], market: "NYC_CORE", state: "NY" },
          ],
          pairs: [{ restaurant: { id: "r1", name: "Keens Steakhouse", location_type: "restaurant", market: "NYC_CORE", state: "NY" }, activity: { id: "a1", name: "Lucky Strike Times Square", location_type: "activity", activity_type: "bowling", market: "NYC_CORE", state: "NY" } }],
          cards: [],
          matched_locations: [],
          debug: {
            rawActivityCandidateCount: 8,
            qualifiedActivityCount: 3,
            fallbackActivityCount: 5,
            intentParserSource: "fast_path",
            normalizedIntent: { searchType: "mixed_outing", primaryDomain: "mixed", needsRestaurant: true, needsActivity: true, wantsPairing: true, intentParserSource: "fast_path" },
          },
        } as any),
      },
    );

    const body: any = await response.json();
    const forbidden = ["Bowling Green", "Anytime Bar & Billiards", "Five Iron Golf", "Puttery", "Exit Escape Room NYC", "PanIQ Escape Room NYC", "Escape Room Madness NYC"];
    const activityNames = body.activities.map((item: any) => item.name);
    const pairActivityNames = body.pairs.map((pair: any) => pair.activity.name);

    expect(activityNames).toEqual(["Lucky Strike Times Square", "The Gutter L.E.S.", "Lucky Strike Chelsea Piers"]);
    expect([...activityNames, ...pairActivityNames]).not.toEqual(expect.arrayContaining(forbidden));
    expect(body.debug.debugParity.qualifiedActivityCount).toBeLessThan(body.debug.debugParity.rawActivityCandidateCount);
    expect(body.debug.intentParserSource).toBe("fast_path");
    expect(analyticsPayloads[0]?.counts?.qualifiedActivityCount).toBe(3);
    expect(analyticsPayloads[0]?.counts?.rawActivityCandidateCount).toBe(8);
    expect(analyticsPayloads[0]?.intentParserSource).toBe("fast_path");
  });
});
