import { describe, expect, it } from "vitest";
import { normalizeClaimStatus, getClaimSourceStatusFilter, validateClaimTransition } from "../claims";
import { parseCrmContextSearchParams, safeCrmReturnTo, withCrmContext } from "../context";
import { normalizeOpportunityPipeline } from "../opportunities/pipeline-normalization";

describe("CRM relationship context", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  it("parses canonical parameters and legacy aliases", () => {
    expect(parseCrmContextSearchParams({ locationId: id, business_id: id, return_to: "/admin/dashboard/crm/locations" }).locationId).toBe(id);
  });
  it("rejects unsafe return URLs", () => {
    expect(safeCrmReturnTo("https://evil.test/admin/dashboard/crm")).toBe("/admin/dashboard/crm");
    expect(safeCrmReturnTo("/admin/dashboard/crm/claims")).toBe("/admin/dashboard/crm/claims");
  });
  it("preserves context in links", () => {
    expect(withCrmContext("/admin/dashboard/crm/outreach", { locationId: id })).toContain("location_id=");
  });
});

describe("claims normalization", () => {
  it("maps legacy statuses to canonical statuses", () => {
    expect(normalizeClaimStatus("pending")).toBe("new");
    expect(normalizeClaimStatus("more_info_required")).toBe("information_needed");
    expect(normalizeClaimStatus("duplicate_detected")).toBe("duplicate");
  });
  it("maps canonical filters to source filters and validates transitions", () => {
    expect(getClaimSourceStatusFilter("approved")).toContain("accepted");
    expect(validateClaimTransition("new", "in_review")).toBe(true);
  });
});

describe("opportunity pipelines", () => {
  it("does not force a default hard-coded pipeline", () => {
    expect(normalizeOpportunityPipeline(undefined).filter).toBe("all");
  });
  it("normalizes null, aliases, and legacy values", () => {
    expect(normalizeOpportunityPipeline("__null__").filter).toBe("unassigned");
    expect(normalizeOpportunityPipeline("advertising").filter).toBe("promoted_listing");
    expect(normalizeOpportunityPipeline("old_sales").filter).toBe("legacy");
  });
});
