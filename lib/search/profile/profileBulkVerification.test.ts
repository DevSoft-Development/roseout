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

  it("bulk verification clears review state for accepted profiles", () => {
    const route = read("app/api/admin/location-tools/search-profiles/bulk-verify/route.ts");
    expect(route).toContain('requireAdminApiRole(["superadmin", "admin"])');
    expect(route).toContain('auth.adminUser?.role !== "superadmin"');
    expect(route).toContain("needs_review: false");
    expect(route).toContain("review_reasons: []");
    expect(route).toContain('verification_source: override ? "bulk_admin_override" : "bulk_admin"');
    expect(route).toContain("removedFromReview: verifyIds.length + corrected");
  });

  it("keeps skipped blocking profiles in review", () => {
    const route = read("app/api/admin/location-tools/search-profiles/bulk-verify/route.ts");
    expect(route).toContain("removedFromReview: false");
    expect(route).toContain('outcome: "skipped"');
    expect(route).toContain("summary.blockingReasons.length === 0");
  });

  it("exposes review removal results in the bulk UI", () => {
    const page = read("app/admin/dashboard/settings/location-tools/search-profiles/page.tsx");
    const actions = read("components/admin/location-tools/SearchProfileBulkVerify.tsx");
    expect(page).toContain("hasProfile={Boolean(profile)}");
    expect(actions).toContain("Verify selected");
    expect(actions).toContain("removed from review");
    expect(actions).toContain("still require review");
    expect(actions).toContain("router.refresh()");
  });

  it("applies manual overrides, records the reviewer, and clears review state", () => {
    const route = read("app/api/admin/location-tools/search-profiles/[locationId]/review/route.ts");
    expect(route).toContain('refreshLocationSearchProfile(locationId, "admin_review_apply", overrides)');
    expect(route).toContain("needs_review: false");
    expect(route).toContain("review_reasons: []");
    expect(route).toContain('verification_source: "admin_review_apply"');
  });
});
