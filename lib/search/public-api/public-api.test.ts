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
  it("does not load a profile when personalization is disabled", async () => {
    delete process.env.SEARCH_PERSONALIZATION_MODE;
    let loads = 0;
    await handleGeneratePost(request({ query: "pizza" }), {
      getIdentity: async () => ({ user: { id: "private-user" } }) as any,
      checkLimit: async () => ({ allowed: true, plan: { planKey: "free" } }) as any,
      loadPreferenceProfile: async () => { loads += 1; throw new Error("must not run"); },
      runSearch: async () => ({ restaurants: [], activities: [], pairs: [], cards: [], matched_locations: [] }) as any,
      recordUsage: async () => undefined,
      logAnalytics: async () => ({ ok: true }),
      logSearchHealth: async () => ({ ok: true }),
      logRouteTiming: () => undefined,
    });
    expect(loads).toBe(0);
  });

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
  it("propagates the enterprise intent parser source to public telemetry", async () => {
    const analyticsPayloads: any[] = [];
    const restaurant = {
      id: "r1",
      name: "Keens Steakhouse",
      location_type: "restaurant",
      primary_category: "steakhouse",
      market: "NYC_CORE",
      state: "NY",
      image_url: "https://example.test/keens.jpg",
    };

    const response = await handleGeneratePost(
      request({ query: "steak in manhattan", debug: true }),
      {
        getIdentity: async () =>
          ({
            user: null,
            authUser: null,
            identity: { key: "anon", type: "anonymous" as const },
          }) as any,
        checkLimit: async () =>
          ({ allowed: true, plan: { planKey: "free" } }) as any,
        recordUsage: async () => undefined,
        logAnalytics: async (payload: any) => {
          analyticsPayloads.push(payload);
          return { ok: true };
        },
        logSearchHealth: async () => ({ ok: true }),
        logRouteTiming: () => undefined,
        now: (() => {
          let t = 0;
          return () => ++t;
        })(),
        runSearch: async () =>
          ({
            reply: "Found steak.",
            render_mode: "cards",
            restaurants: [restaurant],
            activities: [],
            pairs: [],
            cards: [restaurant],
            matched_locations: [],
            metadata: {
              intentParserSource: "metadata_source",
            },
            debug: {
              rawActivityCandidateCount: 0,
              qualifiedActivityCount: 0,
              primaryPairCount: 0,
              normalizedIntent: {
                searchType: "restaurant",
                primaryDomain: "restaurant",
                needsRestaurant: true,
                needsActivity: false,
                wantsPairing: false,
                intentParserSource: "normalized_source",
              },
            },
          }) as any,
      },
    );

    await Promise.resolve();
    const body: any = await response.json();
    const analytics = analyticsPayloads[0];

    expect(body.debugParity.intentParserSource).toBe("normalized_source");
    expect(body.debug.debugParity.intentParserSource).toBe("normalized_source");
    expect(analytics.intentParserSource).toBe("normalized_source");
    expect(analytics.metadata.intentParserSource).toBe("normalized_source");
    expect(analytics.metadata.normalizedIntent.intentParserSource).toBe(
      "normalized_source",
    );
    expect(analytics.metadata.debugParity.intentParserSource).toBe(
      "normalized_source",
    );
  });

  it("applies the final public activity guard before response arrays, IDs, and counts", async () => {
    const analyticsPayloads: any[] = [];
    const restaurant = { id: "r1", name: "Keens Steakhouse", location_type: "restaurant", primary_category: "steakhouse", market: "NYC_CORE", state: "NY", image_url: "https://example.test/keens.jpg" };
    const validActivity = { id: "a1", name: "Lucky Strike Times Square", location_type: "activity", activity_type: "bowling", primary_category: "bowling alley", google_types: ["bowling_alley"], market: "NYC_CORE", state: "NY", image_url: "https://example.test/lucky.jpg" };
    const invalidActivities = [
      { id: "a2", name: "Bowling Green", location_type: "activity", primary_category: "park", activity_type: "park", market: "NYC_CORE", state: "NY", image_url: "https://example.test/bowling-green.jpg" },
      { id: "a3", name: "Anytime Bar & Billiards", location_type: "activity", primary_category: "billiards", activity_type: "pool hall", market: "NYC_CORE", state: "NY", image_url: "https://example.test/billiards.jpg" },
      { id: "a4", name: "Five Iron Golf", location_type: "activity", primary_category: "golf simulator", activity_type: "golf", market: "NYC_CORE", state: "NY", image_url: "https://example.test/five-iron.jpg" },
      { id: "a5", name: "Puttery", location_type: "activity", primary_category: "mini golf", activity_type: "mini golf", market: "NYC_CORE", state: "NY", image_url: "https://example.test/puttery.jpg" },
      { id: "a6", name: "Exit Escape Room NYC", location_type: "activity", primary_category: "escape room", activity_type: "escape room", market: "NYC_CORE", state: "NY", image_url: "https://example.test/exit.jpg" },
    ];
    const activities = [validActivity, ...invalidActivities];

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
          restaurants: [restaurant],
          activities,
          pairs: activities.map((activity) => ({ restaurant, activity })),
          cards: activities,
          matched_locations: [],
          debug: {
            rawActivityCandidateCount: activities.length,
            qualifiedActivityCount: activities.length,
            fallbackActivityCount: 2,
            primaryPairCount: activities.length,
            intentParserSource: "fast_path",
            normalizedIntent: {
              searchType: "mixed_outing",
              primaryDomain: "mixed",
              needsRestaurant: true,
              needsActivity: true,
              wantsPairing: true,
              intentParserSource: "fast_path",
              activityIntent: { activityTerms: ["bowling"], categoryTerms: [], vibeTerms: [], featureTerms: [], negativeTerms: [] },
            },
          },
        } as any),
      },
    );

    await Promise.resolve();
    const body: any = await response.json();
    const forbidden = invalidActivities.map((activity) => activity.name);
    const activityNames = body.activities.map((item: any) => item.name);
    const cardNames = body.cards.map((item: any) => item.name);
    const pairActivityNames = body.pairs.map((pair: any) => pair.activity.name);
    const resultNames = analyticsPayloads[0]?.metadata?.result_ids?.map((item: any) => item.name);
    const pairIdActivityNames = analyticsPayloads[0]?.metadata?.pair_ids?.map((item: any) => item.activity_name);

    expect(activityNames).toEqual(["Lucky Strike Times Square"]);
    expect(pairActivityNames).toEqual(["Lucky Strike Times Square"]);
    expect(cardNames).toContain("Lucky Strike Times Square");
    expect([...activityNames, ...cardNames, ...pairActivityNames, ...(resultNames ?? []), ...(pairIdActivityNames ?? [])]).not.toEqual(expect.arrayContaining(forbidden));
    expect(body.debug.qualifiedActivityCount).toBe(1);
    expect(body.debug.primaryPairCount).toBe(1);
    expect(analyticsPayloads[0]?.counts?.qualifiedActivityCount).toBe(1);
    expect(analyticsPayloads[0]?.counts?.primaryPairCount).toBe(1);
    expect(analyticsPayloads[0]?.counts?.rawActivityCandidateCount).toBe(activities.length);
    expect(analyticsPayloads[0]?.counts?.rawActivityCandidateCount).toBeGreaterThan(
      analyticsPayloads[0]?.counts?.qualifiedActivityCount,
    );
  });
});
