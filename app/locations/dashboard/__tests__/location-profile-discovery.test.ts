import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("app/locations/dashboard/profile/page.tsx", "utf8");
const discovery = readFileSync("app/locations/dashboard/profile/LocationDiscoveryEditor.tsx", "utf8");
const optimizer = readFileSync("app/api/locations/optimize/route.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260816151000_location_ai_tag_suggestion_quota.sql", "utf8");

describe("location profile semantic discovery", () => {
  it("renders the guided discovery editor inside the Business Profile workspace", () => {
    expect(page).toContain("LocationDiscoveryEditor");
    expect(discovery).toContain("Help customers discover you");
    expect(discovery).toContain("Vibe & atmosphere");
    expect(discovery).toContain("Great for");
    expect(discovery).toContain("Date style");
    expect(discovery).toContain("Experience & features");
    expect(discovery).toContain("What makes your location unique?");
  });

  it("writes structured discovery fields and a combined semantic tag set", () => {
    for (const field of ["vibe_tags", "best_for_tags", "date_style_tags", "special_features", "search_keywords", "semantic_tags"]) {
      expect(discovery).toContain(field);
    }
    expect(discovery).toContain('fetch("/api/locations/edit-context"');
    expect(discovery).toContain('method: "PATCH"');
    expect(discovery).toContain("mergedSemantic");
  });

  it("classifies unique details as factual features or natural search phrases", () => {
    expect(discovery).toContain('type UniqueDetailType = "feature" | "search"');
    expect(discovery).toContain("Feature or offering");
    expect(discovery).toContain("Search phrase");
    expect(discovery).toContain('special_features: unique([...current.special_features, value])');
    expect(discovery).toContain('search_keywords: unique([...current.search_keywords, value])');
    expect(discovery).toContain("...state.special_features, ...state.search_keywords");
  });

  it("gives free locations three persisted AI tag suggestions and unlocks paid locations", () => {
    expect(optimizer).toContain("FREE_AI_TAG_LIMIT = 3");
    expect(optimizer).toContain("isBusinessPro");
    expect(optimizer).toContain('body.mode === "discovery_tags"');
    expect(optimizer).toContain("upgrade_required");
    expect(optimizer).toContain("location_ai_tag_suggestion_usage");
    expect(migration).toContain("suggestions_used integer not null default 0");
    expect(discovery).toContain("You used all 3 free AI tag suggestions");
    expect(discovery).toContain("/locations/dashboard/billing");
  });
});
