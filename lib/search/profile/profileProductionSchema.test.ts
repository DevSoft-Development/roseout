import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositorySource = readFileSync(
  resolve(process.cwd(), "lib/search/profile/profileRepository.ts"),
  "utf8",
);

const retryMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260729163500_retry_profile_rows_failed_by_legacy_categories.sql",
  ),
  "utf8",
);

describe("location search profile production schema contract", () => {
  it("does not query removed legacy location columns", () => {
    for (const removedColumn of [
      '"categories"',
      '"cuisines"',
      '"food_terms"',
      '"features"',
      '"searchable"',
      '"hidden"',
    ]) {
      expect(repositorySource).not.toContain(`\n  ${removedColumn},`);
    }
  });

  it("queries the canonical production classification and lifecycle fields", () => {
    for (const canonicalColumn of [
      "primary_category",
      "category",
      "location_type",
      "activity_type",
      "google_primary_type",
      "google_types",
      "tags",
      "semantic_tags",
      "intent_tags",
      "cuisine",
      "cuisine_type",
      "food_type",
      "special_features",
      "is_searchable",
      "is_hidden",
      "is_low_level",
    ]) {
      expect(repositorySource).toContain(`"${canonicalColumn}"`);
    }
  });

  it("normalizes canonical classification fields into profile arrays", () => {
    expect(repositorySource).toContain("normalizeCanonicalLocationClassification");
    expect(repositorySource).toContain("categories: classification.categories");
    expect(repositorySource).toContain("cuisines: classification.cuisines");
    expect(repositorySource).toContain("foodTerms: classification.foodTerms");
    expect(repositorySource).toContain("features: classification.features");
  });

  it("retries only the exact legacy categories failure and preserves other outcomes", () => {
    expect(retryMigration).toContain(
      "Location read failed: column locations.categories does not exist",
    );
    expect(retryMigration).toContain("where status = 'failed'");
    expect(retryMigration).toContain("from affected");
    expect(retryMigration).not.toContain("update public.location_search_profile_run_items\n  set");
    expect(retryMigration).toContain("count(*) filter (where item.status = 'succeeded')");
    expect(retryMigration).toContain("status = 'running'");
  });
});
