import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { calculateStagingQuality } from "../location-growth/stagingQuality";
import { evaluateLocationPublishability } from "../location-publishability";

const location = (overrides: Record<string, unknown> = {}) => ({
  name: "Certification Sample Cafe",
  location_type: "restaurant",
  state: "NY",
  city: "New York",
  address: "100 Sample Street",
  latitude: 40.7,
  longitude: -73.9,
  primary_category: "coffee_shop",
  status: "approved",
  data_status: "clean",
  public_visibility_tier: "standard",
  is_hidden: false,
  is_low_level: false,
  duplicate_status: "unique",
  source_quality_status: "enriched",
  import_confidence: "high",
  has_photos: true,
  main_image: "https://example.test/photo.jpg",
  images: ["https://example.test/photo.jpg"],
  ...overrides,
});

describe("LI V2 pilot acquisition publication gates", () => {
  it("does not promote a URL/title-only provider candidate into searchable inventory", () => {
    const row = location({
      address: null, latitude: null, longitude: null, main_image: null,
      images: [], has_photos: false, source_quality_status: "imported_unverified",
      import_confidence: "low",
    });
    const quality = calculateStagingQuality({ name: row.name, primary_category: row.primary_category, location_type: row.location_type, import_confidence: "low", source_quality_status: "imported_unverified" });
    expect(quality.quality_status).not.toBe("publish_ready");
    expect(evaluateLocationPublishability(row).isSearchable).toBe(false);
  });

  it.each([
    ["no address", { address: null }],
    ["no latitude", { latitude: null }],
    ["no longitude", { longitude: null }],
    ["no image", { main_image: null, images: [], has_photos: false }],
    ["unverified source", { source_quality_status: "imported_unverified" }],
    ["low confidence", { import_confidence: "low" }],
    ["duplicate", { duplicate_status: "duplicate" }],
    ["possible duplicate", { duplicate_status: "possible_duplicate" }],
    ["hidden", { is_hidden: true }],
    ["low level", { is_low_level: true }],
  ])("rejects %s from search publishability", (_, override) => {
    expect(evaluateLocationPublishability(location(override)).isSearchable).toBe(false);
  });

  it("allows a fully approved and verified distinct record", () => {
    expect(evaluateLocationPublishability(location()).isSearchable).toBe(true);
  });

  it("retains source identity and database-arbitrated idempotency in the actual worker", () => {
    const worker = readFileSync("lib/location-intelligence/v2/campaign-worker.ts", "utf8");
    expect(worker).toContain('createHash("sha256").update(url)');
    expect(worker).toContain('onConflict:"source,source_id",ignoreDuplicates:true');
    expect(worker).toContain('source_quality_status:"imported_unverified",import_confidence:"low"');
    expect(worker).toContain("dedupeStagedLocationsChunk");
    expect(worker).toContain("publishReadyStagedLocations");
  });

  it("does not permit unverified, low-confidence, duplicate or incomplete rows into the publisher", () => {
    const publish = readFileSync("lib/location-growth/publishReady.ts", "utf8");
    for (const guard of [
      '.eq("quality_status", "publish_ready")',
      '.eq("duplicate_status", "unique")',
      '.not("source_quality_status", "in",',
      '"imported_unverified"',
      '.not("import_confidence", "eq", "low")',
      '.not("address", "is", null)',
      '.not("latitude", "is", null)',
      '.not("longitude", "is", null)',
      '.eq("has_photos", true)',
      'findExistingLiveDuplicate(row)',
    ]) expect(publish).toContain(guard);
  });
});
