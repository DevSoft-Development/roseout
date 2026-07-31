import { describe, expect, it } from "vitest";
import { explicitDistanceRequested } from "../pairing/buildPairs";
import { hasStrongDomainEvidence, normalizeDomainEvidence } from "../retrieval/retrieveUnifiedLocations";
import { assignCandidateRoles } from "../roles/assignCandidateRoles";

describe("search v2 evidence, live music, and distance regressions", () => {
  it("normalizes underscores, hyphens, and spaces to the same evidence form", () => {
    expect(normalizeDomainEvidence("escape_room")).toBe("escape room");
    expect(normalizeDomainEvidence("escape-room")).toBe("escape room");
    expect(normalizeDomainEvidence("escape   room")).toBe("escape room");
  });

  it("accepts normalized sushi and escape-room evidence", () => {
    expect(hasStrongDomainEvidence({ primary_category: "sushi_restaurant" } as any, {
      cuisines: ["sushi"], foods: [], categories: [],
    } as any)).toBe(true);
    expect(hasStrongDomainEvidence({ activity_type: "escape-games" } as any, {
      cuisines: [], foods: [], categories: ["escape_room"],
    } as any)).toBe(true);
  });

  it("preserves live-music candidates retrieved for the requested activity role", () => {
    const plan = {
      restaurant: { cuisines: [], foods: [], features: [] },
      activity: { required: true, categories: ["live_music"] },
      audience: { minorsPresent: false },
    } as any;
    const candidate = {
      location: { id: "music-1", location_type: "activity", primary_category: "nightlife", name: "Local Stage" },
      retrievalSources: ["enterprise_search_live_music_locations"],
      matchedRetrievalTerms: ["live music"],
      requestedRoles: ["live_music_activity"],
    } as any;
    const assigned = assignCandidateRoles({ plan, candidates: [candidate] });
    expect(assigned).toHaveLength(1);
    expect(assigned[0].roles.some((role: any) => role.role === "live_music_activity")).toBe(true);
  });

  it("uses parsed walking constraints before raw-query fallback", () => {
    expect(explicitDistanceRequested({
      rawQuery: "Halal dinner and karaoke in Flushing",
      pairing: { requireWalkable: true, maxWalkingMinutes: 20, maxDistanceMiles: 3 },
    } as any)).toBe(true);
  });

  it("recognizes hyphenated walking language as a fallback", () => {
    expect(explicitDistanceRequested({
      rawQuery: "Halal dinner and karaoke within a 20-minute walk in Flushing",
      pairing: { requireWalkable: false, maxWalkingMinutes: null, maxDistanceMiles: 3 },
    } as any)).toBe(true);
  });

  it("does not make the default pair radius hard without explicit distance language", () => {
    expect(explicitDistanceRequested({
      rawQuery: "Sushi dinner and an escape room in Garden City",
      pairing: { requireWalkable: false, maxWalkingMinutes: null, maxDistanceMiles: 3 },
    } as any)).toBe(false);
  });
});
