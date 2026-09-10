import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = fs.readFileSync(path.join(root, "lib/location-growth/liveCatalogReconciliation.ts"), "utf8");
const route = fs.readFileSync(path.join(root, "app/api/admin/location-growth/reconcile-live-catalog/route.ts"), "utf8");

test("imported-unverified recovery keeps a strict quality bar", () => {
  assert.match(source, /google_business_status/);
  assert.match(source, /OPERATIONAL/);
  assert.match(source, /Number\(row\.rating\) >= 4\.4/);
  assert.match(source, /Number\(row\.review_count\) >= 200/);
  assert.match(source, /lower\(row\.duplicate_status\) === "unique"/);
  assert.match(source, /isStorefrontTakeoutRestaurant/);
  assert.match(source, /isWeakGenericRestaurant/);
});

test("closed businesses never become searchable during recovery", () => {
  assert.match(source, /CLOSED_PERMANENTLY/);
  assert.match(source, /status: "closed"/);
  assert.match(source, /CLOSED_TEMPORARILY/);
  assert.match(source, /is_searchable: false/);
});

test("duplicate automation only merges exact identity with the same venue name", () => {
  assert.match(source, /Number\(review\.duplicate_score\) < 100/);
  assert.match(source, /same_google_place_id/);
  assert.match(source, /same_location_key/);
  assert.match(source, /same_normalized_name_address/);
  assert.match(source, /sameVenueName\(left, right\)/);
  assert.match(source, /location_intelligence_shared_phone_conservative/);
  assert.doesNotMatch(source, /duplicate_score\) >= 70.*oh_merge_live_location_duplicate/s);
});

test("publish-ready reconciliation uses canonical publishability", () => {
  assert.match(source, /buildPublishabilityUpdate/);
  assert.match(source, /quality_status", "publish_ready"/);
  assert.match(source, /staleHidden/);
});

test("admin endpoint is authorized and defaults to dry run", () => {
  assert.match(route, /requireAdminApiRole\(ADMIN_PAGE_ACCESS\.locationGrowth\)/);
  assert.match(route, /const dryRun = body\.dryRun !== false/);
  assert.match(route, /imported_unverified/);
  assert.match(route, /duplicates/);
  assert.match(route, /publish_ready/);
});
