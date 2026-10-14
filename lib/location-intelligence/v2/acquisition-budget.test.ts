import { describe, expect, it } from "vitest";
import { canAuthorizeProviderCharge, netPublishedCost } from "./acquisition-budget";

describe("provider spend limits", () => {
  it("allows a reservation equal to every applicable remaining cap", () => {
    expect(canAuthorizeProviderCharge({globalRemainingUsd:0.05,providerRemainingUsd:1,campaignRemainingUsd:0.05,runRemainingUsd:2},0.05)).toBe(true);
  });
  it("blocks attempts above any one scope limit", () => {
    expect(canAuthorizeProviderCharge({globalRemainingUsd:5,providerRemainingUsd:0.04,campaignRemainingUsd:5,runRemainingUsd:5},0.05)).toBe(false);
  });
  it("blocks negative and nonfinite request amounts", () => {
    const caps={globalRemainingUsd:5,providerRemainingUsd:5,campaignRemainingUsd:5,runRemainingUsd:5};
    expect(canAuthorizeProviderCharge(caps,-1)).toBe(false);
    expect(canAuthorizeProviderCharge(caps,Number.NaN)).toBe(false);
  });
  it("does not divide cost by zero published locations", () => {
    expect(netPublishedCost(50,0)).toBeNull();
  });
});