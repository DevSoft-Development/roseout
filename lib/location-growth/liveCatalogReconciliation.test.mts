import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = fs.readFileSync(path.join(root, "lib/location-growth/liveCatalogReconciliation.ts"), "utf8");
const duplicateSource = fs.readFileSync(path.join(root, "lib/location-growth/liveDuplicateReconciliation.ts"), "utf8");
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

test("duplicate automation is scoped to non-searchable exact same-venue identity", () => {
  assert.match(duplicateSource, /\.eq\("is_searchable", false\)/);
  assert.match(duplicateSource, /Number\(review\.duplicate_score\) < 100/);
  assert.match(duplicateSource, /same_google_place_id/);
  assert.match(duplicateSource, /same_location_key/);
  assert.match(duplicateSource, /same_normalized_name_address/);
  assert.match(duplicateSource, /sameVenueName\(left, right\)/);
  assert.doesNotMatch(duplicateSource, /"same_phone"/);
  assert.doesNotMatch(duplicateSource, /duplicate_score\) >= 70.*oh_merge_live_location_duplicate/s);
});

test("exact duplicate merge clears a master only when no other pending review remains", () => {
  assert.match(duplicateSource, /masterHasOtherPendingReview/);
  assert.match(duplicateSource, /\.neq\("id", excludedReviewId\)/);
  assert.match(duplicateSource, /if \(!hasOtherPending\) mastersCleared \+= 1/);
  assert.match(duplicateSource, /\.eq\("duplicate_status", "possible_duplicate"\)/);
});

test("publish-ready reconciliation uses canonical publishability", () => {
  assert.match(source, /buildPublishabilityUpdate/);
  assert.match(source, /quality_status", "publish_ready"/);
  assert.match(source, /staleHidden/);
});

test("admin endpoint is authorized and defaults to dry run", () => {
  assert.match(route, /requireAdminApiRole\(ADMIN_PAGE_ACCESS\.locationGrowth\)/);
  assert.match(route, /const dryRun = body\.dryRun !== false/);
  assert.match(route, /liveDuplicateReconciliation/);
  assert.match(route, /imported_unverified/);
  assert.match(route, /duplicates/);
  assert.match(route, /publish_ready/);
});
