import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("search profile verification workflow", () => {
  it("adds admin audit fields for verified profiles", () => {
    const migration = read("supabase/migrations/20260729174500_add_search_profile_verification.sql");
    expect(migration).toContain("verified_at");
    expect(migration).toContain("verified_by");
    expect(migration).toContain("verification_source");
    expect(migration).toContain("verification_note");
  });

  it("bulk verifies only guarded profiles and requires superadmin for overrides", () => {
    const route = read("app/api/admin/location-tools/search-profiles/bulk-verify/route.ts");
    expect(route).toContain('requireAdminApiRole(["superadmin", "admin"])');
    expect(route).toContain('auth.adminUser?.role !== "superadmin"');
    expect(route).toContain("profile.needs_review !== true");
    expect(route).toContain("profile_version");
    expect(route).toContain("canonical_terms.length > 0");
  });

  it("exposes review and apply controls from the profile list", () => {
    const page = read("app/admin/dashboard/settings/location-tools/search-profiles/page.tsx");
    const actions = read("components/admin/location-tools/SearchProfilesClient.tsx");
    expect(page).toContain("hasProfile={Boolean(profile)}");
    expect(actions).toContain("Review / Apply");
    expect(actions).toContain("SearchProfileBulkVerify");
    expect(actions).toContain("Verify selected");
  });

  it("applies manual overrides, records the reviewer, and clears review state", () => {
    const route = read("app/api/admin/location-tools/search-profiles/[locationId]/review/route.ts");
    expect(route).toContain('refreshLocationSearchProfile(locationId, "admin_review_apply", overrides)');
    expect(route).toContain("needs_review: false");
    expect(route).toContain("review_reasons: []");
    expect(route).toContain('verification_source: "admin_review_apply"');
  });
});
