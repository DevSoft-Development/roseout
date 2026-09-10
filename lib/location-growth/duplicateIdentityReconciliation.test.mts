import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = fs.readFileSync(path.join(root, "lib/location-growth/duplicateIdentityReconciliation.ts"), "utf8");
const route = fs.readFileSync(path.join(root, "app/api/admin/location-growth/reconcile-live-catalog/route.ts"), "utf8");

test("identity recovery is scoped to the explicit review reason and unknown duplicate state", () => {
  assert.match(source, /duplicate_status", "unknown"/);
  assert.match(source, /duplicate_identity_not_confirmed_unique/);
  assert.match(source, /is_searchable", false/);
});

test("exact Google Place ID collisions become duplicates rather than searchable rows", () => {
  assert.match(source, /google_place_id/);
  assert.match(source, /exact_duplicate_google_place_id/);
  assert.match(source, /duplicate_status: "duplicate"/);
  assert.match(source, /duplicate_score: 100/);
  assert.match(source, /is_searchable: false/);
});

test("unique resolution also checks same normalized venue identity", () => {
  assert.match(source, /normalized_name/);
  assert.match(source, /sameNormalizedAddress/);
  assert.match(source, /sameCityState/);
  assert.match(source, /same_name_identity_review/);
  assert.match(source, /duplicate_status: "unique"/);
});

test("reconciliation makes no Google API calls", () => {
  assert.match(source, /googleApiCalls: 0/);
  assert.doesNotMatch(source, /getPlaceDetails|searchPlaces|getPlacePhotos|fetchGooglePlacePhoto/);
});

test("protected admin route runs duplicate identity before needs data review", () => {
  assert.match(route, /duplicate_identity/);
  assert.match(route, /reconcileUnknownDuplicateIdentity/);
  assert.match(route, /result\.duplicateIdentity/);
  assert.ok(route.indexOf("result.duplicateIdentity") < route.indexOf("result.needsDataReview"));
  assert.match(route, /requireAdminApiRole\(ADMIN_PAGE_ACCESS\.locationGrowth\)/);
});
