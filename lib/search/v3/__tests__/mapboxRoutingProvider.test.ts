import { describe, expect, it, vi } from "vitest";
import {
  MapboxSearchRoutingProvider,
} from "@/lib/search/v3";

describe("MapboxSearchRoutingProvider", () => {
  it("requests an asymmetric walking matrix and converts distance/time units", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("/directions-matrix/v1/mapbox/walking/");
      expect(url).toContain("annotations=distance%2Cduration");
      expect(url).toContain("sources=0");
      expect(url).toContain("destinations=1%3B2");
      expect(url).toContain("access_token=test-token");

      return new Response(JSON.stringify({
        code: "Ok",
        durations: [[600, 900]],
        distances: [[1609.344, 3218.688]],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const provider = new MapboxSearchRoutingProvider({
      accessToken: "test-token",
      fetchImpl,
    });

    const result = await provider.routeMatrix({
      mode: "walking",
      origins: [
        { id: "restaurant", latitude: 40.75, longitude: -73.99 },
      ],
      destinations: [
        { id: "activity-1", latitude: 40.76, longitude: -73.98 },
        { id: "activity-2", latitude: 40.77, longitude: -73.97 },
      ],
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.providerId).toBe("search-v3.mapbox-matrix.v1");
    expect(result.mode).toBe("walking");
    expect(result.entries).toEqual([
      {
        originId: "restaurant",
        destinationId: "activity-1",
        distanceMiles: 1,
        durationMinutes: 10,
        source: "mapbox",
        confidence: "verified",
      },
      {
        originId: "restaurant",
        destinationId: "activity-2",
        distanceMiles: 2,
        durationMinutes: 15,
        source: "mapbox",
        confidence: "verified",
      },
    ]);
  });

  it("marks unreachable pedestrian matrix cells as unknown instead of estimating them", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({
        code: "Ok",
        durations: [[null]],
        distances: [[null]],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    ) as typeof fetch;

    const provider = new MapboxSearchRoutingProvider({
      accessToken: "test-token",
      fetchImpl,
    });

    const result = await provider.routeMatrix({
      mode: "walking",
      origins: [
        { id: "restaurant", latitude: 40.75, longitude: -73.99 },
      ],
      destinations: [
        { id: "activity", latitude: 40.76, longitude: -73.98 },
      ],
    });

    expect(result.entries[0]).toEqual({
      originId: "restaurant",
      destinationId: "activity",
      distanceMiles: null,
      durationMinutes: null,
      source: "mapbox",
      confidence: "unknown",
    });
  });

  it("never includes the access token in provider errors", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({
        code: "InvalidInput",
        message: "bad request",
      }), {
        status: 422,
        headers: { "content-type": "application/json" },
      })
    ) as typeof fetch;

    const provider = new MapboxSearchRoutingProvider({
      accessToken: "secret-token-value",
      fetchImpl,
    });

    await expect(provider.routeMatrix({
      mode: "walking",
      origins: [
        { id: "restaurant", latitude: 40.75, longitude: -73.99 },
      ],
      destinations: [
        { id: "activity", latitude: 40.76, longitude: -73.98 },
      ],
    })).rejects.toThrow("mapbox_matrix_http_422");

    try {
      await provider.routeMatrix({
        mode: "walking",
        origins: [
          { id: "restaurant", latitude: 40.75, longitude: -73.99 },
        ],
        destinations: [
          { id: "activity", latitude: 40.76, longitude: -73.98 },
        ],
      });
    } catch (error) {
      expect(String(error)).not.toContain("secret-token-value");
    }
  });
});
