import { describe, expect, it } from "vitest";
import { classifyAnchorIntent } from "../intent";
import { resolveSearchAnchor } from "../resolve";

function createSupabase(args: { anchors?: any[]; locations?: any[] }) {
  return {
    from(table: string) {
      const data = table === "search_anchors" ? args.anchors ?? [] : args.locations ?? [];
      const builder: any = {
        select() { return builder; },
        eq() { return builder; },
        or() { return builder; },
        limit() { return Promise.resolve({ data, error: null }); },
      };
      return builder;
    },
  };
}

const baseLocation = {
  location_type: "activity",
  activity_type: "museum",
  primary_category: "museum",
  active: true,
  is_searchable: true,
  is_hidden: false,
  deleted_at: null,
  status: "approved",
  latitude: 40.75,
  longitude: -73.98,
};

describe("anchor intent classification", () => {
  it("distinguishes named anchors from generic categories", () => {
    expect(classifyAnchorIntent("Gaming City")).toBe("named");
    expect(classifyAnchorIntent("skating rink")).toBe("generic");
    expect(classifyAnchorIntent("museum")).toBe("generic");
  });
});

describe("resolveSearchAnchor regressions", () => {
  it("resolves a named anchor only with a concrete location id", async () => {
    const location = {
      ...baseLocation,
      id: "gaming-city-id",
      name: "Gaming City",
      city: "Astoria",
      borough: "Queens",
      activity_type: "arcade",
      primary_category: "arcade",
    };
    const result: any = await resolveSearchAnchor(
      createSupabase({ locations: [location] }),
      "Gaming City",
      "Astoria",
    );

    expect(result.status).toBe("resolved");
    expect(result.anchor.id).toBe("gaming-city-id");
    expect(result.diagnostics.resolvedLocationId).toBe("gaming-city-id");
  });

  it("asks for location context when a generic anchor has several matches", async () => {
    const result: any = await resolveSearchAnchor(
      createSupabase({
        locations: [
          { ...baseLocation, id: "rink-1", name: "City Ice Rink", activity_type: "skating rink", primary_category: "skating rink", city: "New York" },
          { ...baseLocation, id: "rink-2", name: "Westchester Skating Academy", activity_type: "skating rink", primary_category: "skating rink", city: "Elmsford" },
        ],
      }),
      "skating rink",
      null,
    );

    expect(result.status).toBe("ambiguous");
    expect(result.anchor).toBeNull();
    expect(result.candidates).toHaveLength(2);
    expect(result.diagnostics.anchorIntentKind).toBe("generic");
  });

  it("keeps duplicate named anchors ambiguous", async () => {
    const result: any = await resolveSearchAnchor(
      createSupabase({
        locations: [
          { ...baseLocation, id: "museum-1", name: "Discovery Center", city: "Queens" },
          { ...baseLocation, id: "museum-2", name: "Discovery Center", city: "Brooklyn" },
        ],
      }),
      "Discovery Center",
      null,
    );

    expect(result.status).toBe("ambiguous");
    expect(result.diagnostics.rejectionReason).toBe("duplicate_or_ambiguous_anchor_name");
  });

  it("returns not_found for an unresolved named anchor", async () => {
    const result: any = await resolveSearchAnchor(
      createSupabase({ anchors: [], locations: [] }),
      "Place That Does Not Exist",
      "Queens",
    );

    expect(result.status).toBe("not_found");
    expect(result.anchor).toBeNull();
    expect(result.diagnostics.candidateCount).toBe(0);
  });

  it("rejects an otherwise valid anchor outside the requested city", async () => {
    const result: any = await resolveSearchAnchor(
      createSupabase({
        locations: [
          { ...baseLocation, id: "summit-id", name: "The Summit", city: "Brooklyn", borough: "Brooklyn" },
        ],
      }),
      "The Summit",
      "Queens",
    );

    expect(result.status).toBe("not_found");
    expect(result.diagnostics.rejectionReason).toBe("anchor_outside_requested_area");
    expect(result.diagnostics.areaRejectedCount).toBe(1);
  });
});
