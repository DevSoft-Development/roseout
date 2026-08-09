import { describe, expect, it } from "vitest";
import { resolvePostLoginRedirect } from "@/lib/auth-redirect";

describe("organization login routing", () => {
  it("routes an organization member to the business dashboard", () => {
    expect(
      resolvePostLoginRedirect({
        isOrganizationMember: true,
      }),
    ).toBe("/business/dashboard");
  });

  it("preserves claim handoff before organization routing", () => {
    expect(
      resolvePostLoginRedirect({
        isOrganizationMember: true,
        intendedPath: "/business/claim?code=ABC123",
      }),
    ).toBe("/business/claim?code=ABC123");
  });

  it("keeps admin precedence over organization membership", () => {
    expect(
      resolvePostLoginRedirect({
        adminRole: "admin",
        isAdminUser: true,
        isOrganizationMember: true,
      }),
    ).toBe("/admin/dashboard");
  });

  it("keeps internal team precedence over organization membership", () => {
    expect(
      resolvePostLoginRedirect({
        teamProfileTeamType: "support_team",
        isOrganizationMember: true,
      }),
    ).toBe("/admin/dashboard/crm/work-queue?view=my-queue");
  });

  it("routes legacy owners to the unified business dashboard", () => {
    expect(
      resolvePostLoginRedirect({
        isLocationOwner: true,
      }),
    ).toBe("/business/dashboard");
  });

  it("keeps consumers on the user dashboard", () => {
    expect(resolvePostLoginRedirect({})).toBe("/user/dashboard");
  });
});
