import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("location enrichment operations", () => {
  it("supports bounded run sizes and market/type filters", () => {
    const route = read("app/api/admin/locations/enrichment-runs/route.ts");
    const migration = read("supabase/migrations/20260810164000_location_enrichment_operations.sql");

    expect(route).toContain("targetLimit");
    expect(route).toContain("market");
    expect(route).toContain("sourceType");
    expect(migration).toContain("v_target_limit");
    expect(migration).toContain("v_market");
    expect(migration).toContain("v_source_type");
    expect(migration).toContain("least(");
    expect(migration).toContain("250");
  });

  it("targets explicit enrichment gaps", () => {
    const migration = read("supabase/migrations/20260810164000_location_enrichment_operations.sql");
    for (const gap of [
      "missing_hours",
      "missing_photos",
      "missing_website",
      "missing_phone",
      "missing_category",
      "missing_reservation",
      "missing_coordinates",
      "missing_google_place_id",
    ]) {
      expect(migration).toContain(gap);
    }
  });

  it("keeps processing chunks resumable instead of making one oversized request", () => {
    const runner = read("lib/location-data-quality/enrichment-runner.ts");
    const migration = read("supabase/migrations/20260810164000_location_enrichment_operations.sql");

    expect(runner).toContain("claim_location_enrichment_items");
    expect(runner).toContain("cursor_location_id");
    expect(migration).toContain("location_enrichment_run_items");
  });

  it("prevents Google Place identity collisions before writing a new identity", () => {
    const runner = read("lib/location-data-quality/enrichment-runner.ts");
    expect(runner).toContain("findIdentityCollision");
    expect(runner).toContain("duplicate_google_place_id");
    expect(runner).toContain("source_table");
    expect(runner).toContain("source_id");
  });

  it("queues Search Foundation refresh only for profile-relevant changes", () => {
    const runner = read("lib/location-data-quality/enrichment-runner.ts");
    expect(runner).toContain("PROFILE_RELEVANT_FIELDS");
    expect(runner).toContain("enqueueLocationSearchProfileRefresh");
    expect(runner).toContain("profileRelevantChanged");
  });

  it("shows operational outcomes and human-readable reasons on the existing enrichment page", () => {
    const client = read("components/admin/location-tools/CatalogEnrichmentRunner.tsx");
    expect(client).toContain("Enriched");
    expect(client).toContain("Unchanged");
    expect(client).toContain("Skipped");
    expect(client).toContain("Failures");
    expect(client).toContain("Recent batch results");
    expect(client).toContain("Gap targeting");
  });
});
