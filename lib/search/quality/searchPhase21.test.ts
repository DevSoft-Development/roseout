import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("Search API Phase 2.1", () => {
  it("supports strict profile-only replay without legacy fallback", () => {
    const retrieval = read("lib/search/v2/retrieval/retrieveCandidates.ts");
    const route = read("app/api/admin/search-quality/replay/route.ts");
    expect(retrieval).toContain("strictNoFallback");
    expect(retrieval).toContain("canonical_profile_strict_empty");
    expect(route).toContain("strict-profile");
    expect(route).toContain("domainDiagnostics");
  });

  it("links Profile Rollout Quality from Search Health", () => {
    const panel = read("app/admin/dashboard/search-health/SearchCoreV2Panel.tsx");
    expect(panel).toContain("/admin/dashboard/search-health/profile-rollout");
    expect(panel).toContain("Profile Rollout Quality");
  });

  it("requires verified evidence for secondary domain eligibility", () => {
    const migration = read("supabase/migrations/20260729233000_search_phase_2_1_domain_qualification.sql");
    expect(migration).toContain("coalesce(p.is_verified, false) = true");
    expect(migration).toContain("p.primary_domain = p_domain");
    expect(migration).toContain("p.activity_categories");
  });
});
