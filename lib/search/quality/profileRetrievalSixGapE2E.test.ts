import { describe, expect, it } from "vitest";
import { buildProfileRpcParams } from "../v2/retrieval/retrieveProfileLocations";
import { buildLaunchGates } from "./launchGates";

describe("profile retrieval six-gap rollout", () => {
  it("uses focused restaurant terms instead of a full natural-language query", () => {
    const params = buildProfileRpcParams({ desiredRole: "restaurant", cuisines: [], foods: ["wings"], categories: [], features: [], retrievalTerms: ["wings", "restaurant"], eligibleStorageTypes: ["restaurant"], geo: {} as any });
    expect(params.p_query).toBe("wings");
    expect(params.p_categories).toContain("sports bar");
    expect(params.p_categories).not.toContain("restaurant");
  });

  it("maps nightlife concepts into the activity lane", () => {
    const params = buildProfileRpcParams({ desiredRole: "rooftop_activity", cuisines: [], foods: [], categories: ["rooftop"], features: [], retrievalTerms: ["rooftop drinks", "activity"], eligibleStorageTypes: ["activity"], geo: {} as any });
    expect(params.p_domain).toBe("activity");
    expect(params.p_categories).toContain("rooftop bar");
    expect(params.p_categories).not.toContain("activity");
  });

  it("does not change launch thresholds", () => {
    const gates = buildLaunchGates({ total: 20, successRate: 55, wrongDomainRate: 45, geographyLeakageRate: 0, pairedQuerySuccessRate: 46.153846, noResultRegressionRate: 0, legacyFallbackRate: 35, p95LatencyMs: 2800, contractFailureCount: 0 });
    expect(gates.find((gate) => gate.key === "successRate")?.target).toBe(99.5);
    expect(gates.find((gate) => gate.key === "wrongDomainRate")?.target).toBe(2);
    expect(gates.find((gate) => gate.key === "pairedQuerySuccessRate")?.target).toBe(85);
    expect(gates.find((gate) => gate.key === "legacyFallbackRate")?.target).toBe(10);
  });
});
