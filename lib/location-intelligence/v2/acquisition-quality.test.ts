import { describe, expect, it } from "vitest";
import { screenAcquisitionCandidate } from "./acquisition-quality";
import { canAuthorizeProviderCharge, netPublishedCost } from "./acquisition-budget";

describe("LI V2 acquisition gates", () => {
  it("rejects known fast food", () => expect(screenAcquisitionCandidate({name:"McDonald's Times Square",category:"restaurant",state:"NY"}).action).toBe("reject"));
  it("accepts independent restaurants", () => expect(screenAcquisitionCandidate({name:"Neighborhood Bistro",category:"restaurant",state:"NJ"}).action).toBe("accept"));
  it("quarantines unknown categories", () => expect(screenAcquisitionCandidate({name:"Unclear Venue",category:"unknown",state:"CT"}).action).toBe("quarantine"));
  it("protects claimed venues", () => expect(screenAcquisitionCandidate({name:"McDonald's",category:"fast food",claimed:true}).action).toBe("protected"));
  it("rejects duplicate place IDs", () => expect(screenAcquisitionCandidate({name:"Bistro",category:"restaurant",google_place_id:"foo"},new Set(["google:foo"])).action).toBe("duplicate"));
  it("stops expenses at any exhausted budget", () => expect(canAuthorizeProviderCharge({globalRemainingUsd:10,providerRemainingUsd:0,campaignRemainingUsd:10,runRemainingUsd:10},0.01)).toBe(false));
  it("calculates acquisition cost only for net published venues", () => expect(netPublishedCost(100,50)).toBe(2));
});
