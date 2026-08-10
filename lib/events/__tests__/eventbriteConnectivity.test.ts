import { afterEach, describe, expect, it } from "vitest";
import { checkEventbriteConnectivity } from "../providers/eventbriteClient";

const originalToken = process.env.EVENTBRITE_PRIVATE_TOKEN;

afterEach(() => {
  if (originalToken == null) delete process.env.EVENTBRITE_PRIVATE_TOKEN;
  else process.env.EVENTBRITE_PRIVATE_TOKEN = originalToken;
});

describe("Eventbrite connectivity", () => {
  it("reports unconfigured without making a request", async () => {
    delete process.env.EVENTBRITE_PRIVATE_TOKEN;
    let calls = 0;
    const result = await checkEventbriteConnectivity({
      fetchImpl: (async () => {
        calls += 1;
        throw new Error("unexpected request");
      }) as typeof fetch,
    });

    expect(result).toEqual({
      configured: false,
      authenticated: false,
      userId: null,
      userName: null,
      organizationCount: 0,
      organizations: [],
    });
    expect(calls).toBe(0);
  });

  it("authenticates, discovers organizations, and counts current/future events", async () => {
    process.env.EVENTBRITE_PRIVATE_TOKEN = "test-private-token";
    const requests: Array<{ url: string; authorization: string | null }> = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      requests.push({ url, authorization: headers.get("authorization") });

      if (url.endsWith("/users/me/")) {
        return new Response(JSON.stringify({ id: "user-1", name: "TheOutHaven" }), { status: 200 });
      }
      if (url.endsWith("/users/me/organizations/")) {
        return new Response(JSON.stringify({ organizations: [{ id: "org-1", name: "Primary Org" }] }), { status: 200 });
      }
      if (url.includes("/organizations/org-1/events/")) {
        return new Response(JSON.stringify({ events: [], pagination: { object_count: 7 } }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const result = await checkEventbriteConnectivity({ fetchImpl });

    expect(result).toEqual({
      configured: true,
      authenticated: true,
      userId: "user-1",
      userName: "TheOutHaven",
      organizationCount: 1,
      organizations: [{ id: "org-1", name: "Primary Org", currentFutureEventCount: 7 }],
    });
    expect(requests).toHaveLength(3);
    expect(requests.every((request) => request.authorization === "Bearer test-private-token")).toBe(true);
    expect(requests.every((request) => !request.url.includes("test-private-token"))).toBe(true);
  });

  it("fails closed on rejected credentials without exposing the token", async () => {
    process.env.EVENTBRITE_PRIVATE_TOKEN = "secret-value";
    const fetchImpl = (async () => new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 })) as typeof fetch;

    await expect(checkEventbriteConnectivity({ fetchImpl })).rejects.toThrow("Eventbrite request failed with HTTP 401.");
  });
});
