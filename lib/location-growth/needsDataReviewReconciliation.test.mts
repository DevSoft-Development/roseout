import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = fs.readFileSync(path.join(root, "lib/location-growth/needsDataReviewReconciliation.ts"), "utf8");
const route = fs.readFileSync(path.join(root, "app/api/admin/location-growth/reconcile-live-catalog/route.ts"), "utf8");

test("needs-data-review recovery requires strong stored evidence", () => {
  assert.match(source, /google_business_status/);
  assert.match(source, /OPERATIONAL/);
  assert.match(source, /source_quality_status/);
  assert.match(source, /"enriched"/);
  assert.match(source, /import_confidence/);
  assert.match(source, /"high"/);
  assert.match(source, /duplicate_status\) === "unique"/);
  assert.match(source, /Number\(row\.rating\) >= 4\.4/);
  assert.match(source, /Number\(row\.review_count\) >= 200/);
  assert.match(source, /Number\(row\.review_count\) >= 100/);
});

test("low-level and storefront signals cannot be auto-recovered", () => {
  assert.match(source, /isStorefrontTakeoutRestaurant/);
  assert.match(source, /isWeakGenericRestaurant/);
  assert.match(source, /curation_tier/);
  assert.match(source, /is_low_level/);
});

test("generic retail and creative activity rows require category evidence", () => {
  assert.match(source, /hasActivityCategoryEvidence/);
  assert.match(source, /retail_store/);
  assert.match(source, /category === "creative"/);
  assert.match(source, /activity_category_evidence_missing/);
  assert.match(source, /&& hasActivityCategoryEvidence\(row\)/);
});

test("perfume-making labels require stored experiential text", () => {
  assert.match(source, /hasScentExperienceEvidence/);
  assert.match(source, /category !== "perfume_making"/);
  assert.match(source, /row\.description/);
  assert.match(source, /row\.short_description/);
  assert.match(source, /workshop\|experience\|class\|session\|appointment\|reservation/);
});

test("canonical publishability is the final authority", () => {
  assert.match(source, /buildPublishabilityUpdate/);
  assert.match(source, /if \(!result\.isSearchable\)/);
  assert.match(source, /data_status: "clean"/);
});

test("recovery uses no Google API calls", () => {
  assert.match(source, /googleApiCalls: 0/);
  assert.doesNotMatch(source, /getPlaceDetails|searchPlaces|getPlacePhotos|fetchGooglePlacePhoto/);
});

test("protected admin route exposes needs_data_review with dry-run default", () => {
  assert.match(route, /requireAdminApiRole\(ADMIN_PAGE_ACCESS\.locationGrowth\)/);
  assert.match(route, /needs_data_review/);
  assert.match(route, /reconcileNeedsDataReview/);
  assert.match(route, /const dryRun = body\.dryRun !== false/);
});
