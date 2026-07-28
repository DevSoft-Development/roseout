import { describe, expect, it, vi } from "vitest";
import { retrieveUnifiedLocations } from "../retrieval/retrieveUnifiedLocations";
import { buildPairs } from "../pairing/buildPairs";
import { sanitizePublicImageUrl } from "../response/sanitizePublicLocation";
import { adaptV2ResponseToCurrentPublicContract } from "../response/compatibilityAdapter";

const geo = { source: "explicit", market: "NYC", city: null, borough: "Manhattan", neighborhood: null, county: null, state: "NY", latitude: null, longitude: null, radiusMiles: 8, strictness: "strict" } as const;

function scored(id: string, role: "restaurant" | "live_music_activity", total = 90) {
  const location = { id, latitude: 40.75, longitude: -73.98, location_type: role === "restaurant" ? "restaurant" : "activity" } as any;
  return {
    candidate: { candidate: { location, distanceMiles: null }, roles: [] },
    selectedRole: role,
    scores: { intentMatch: 100, roleConfidence: 100, geoFit: 100, quality: 90, featureMatch: 100, popularity: 90, audienceFit: 100, mlBoost: 0, penalties: 0, total },
    reasons: [],
    ml: {},
  } as any;
}

describe("V2 live music, pair diversity, telemetry, and photo safety", () => {
  it("uses the dedicated live-music RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    await retrieveUnifiedLocations({ rpc } as any, {
      desiredRole: "live_music_activity",
      cuisines: [], foods: [], categories: ["live_music"], features: [],
      retrievalTerms: ["live music", "music venue", "jazz"],
      eligibleStorageTypes: ["activity", "nightlife", "restaurant"],
      geo,
    });
    expect(rpc).toHaveBeenCalledWith("enterprise_search_live_music_locations", expect.objectContaining({ p_borough: "Manhattan" }));
  });

  it("caps repeated activity venues in recommended pairs", async () => {
    const restaurants = [scored("r1", "restaurant", 95), scored("r2", "restaurant", 94), scored("r3", "restaurant", 93)];
    const activities = [scored("a1", "live_music_activity", 96)];
    const pairs = await buildPairs({
      plan: { pairing: { sameVenueRequired: false, maxDistanceMiles: 3, maxWalkingMinutes: null, requireWalkable: false } } as any,
      restaurants,
      activities,
    });
    expect(pairs).toHaveLength(2);
    expect(new Set(pairs.map((pair) => pair.activity.candidate.candidate.location.id))).toEqual(new Set(["a1"]));
  });

  it("never serializes raw Google photo API keys", () => {
    const raw = "https://maps.googleapis.com/maps/api/place/photo?maxwidth=1200&photo_reference=abc123&key=AIza-secret";
    const safe = sanitizePublicImageUrl(raw);
    expect(safe).toBe("/api/public/google-place-photo?ref=abc123");
    expect(String(safe)).not.toContain("AIza");
  });

  it("maps snake and camel telemetry from the same canonical counts", () => {
    const response = adaptV2ResponseToCurrentPublicContract({
      success: true, message: "ok", displayMode: "pairs", sameVenueResults: [], restaurants: [], activities: [], pairs: [],
      builder: { enabled: true, restaurants: [], activities: [], selectedRestaurantId: null, selectedActivityId: null },
      anchor: { requested: false, resolved: false, rawName: null, relationship: null, location: null },
      primary_domain: "mixed", primaryDomain: "mixed", requestId: "test", requestFulfilled: true, partialResults: false,
      requestedMode: "paired_outing", resolvedMode: "paired_outing", fallback: { used: false, reason: null }, timing: {}, ml: {},
      counts: { restaurantCards: 0, activityCards: 0, builderRestaurantCards: 8, builderActivityCards: 3, uniquePairRestaurants: 5, uniquePairActivities: 2, pairs: 5, sameVenueCards: 0, displayedResults: 5 },
    } as any);
    expect(response.card_counts.pairs).toBe(5);
    expect(response.cardCounts.pairs).toBe(5);
    expect(response.builder_activity_count).toBe(3);
  });
});
