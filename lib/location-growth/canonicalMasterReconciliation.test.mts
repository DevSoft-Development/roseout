import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = fs.readFileSync(path.join(root, "lib/location-growth/canonicalMasterReconciliation.ts"), "utf8");
const route = fs.readFileSync(path.join(root, "app/api/admin/location-growth/reconcile-live-catalog/route.ts"), "utf8");

test("canonical masters recover only from exact enriched duplicate evidence", () => {
  assert.match(source, /exactIdentity/);
  assert.match(source, /google_place_id/);
  assert.match(source, /location_key/);
  assert.match(source, /normalized_name/);
  assert.match(source, /source_quality_status\) === "enriched"/);
  assert.match(source, /import_confidence\) === "high"/);
  assert.match(source, /data_status\) === "clean"/);
});

test("canonical master recovery keeps quality and operational floors", () => {
  assert.match(source, /CLOSED_PERMANENTLY/);
  assert.match(source, /OPERATIONAL/);
  assert.match(source, /rating >= 4\.4/);
  assert.match(source, /reviews >= 200/);
  assert.match(source, /reviews >= 100/);
  assert.match(source, /isStorefrontTakeoutRestaurant/);
  assert.match(source, /isWeakGenericRestaurant/);
  assert.match(source, /hasCompleteLocation/);
  assert.match(source, /hasPhoto/);
});

test("canonical master recovery uses canonical publishability and never calls Google", () => {
  assert.match(source, /buildPublishabilityUpdate/);
  assert.match(source, /googleApiCalls: 0/);
  assert.doesNotMatch(source, /getPlaceDetails|searchPlaces|fetchGooglePlacePhoto|getPlacePhotos/);
});

test("admin reconciliation endpoint exposes protected canonical master mode", () => {
  assert.match(route, /canonical_masters/);
  assert.match(route, /reconcileCanonicalDuplicateMasters/);
  assert.match(route, /const dryRun = body\.dryRun !== false/);
  assert.match(route, /requireAdminApiRole\(ADMIN_PAGE_ACCESS\.locationGrowth\)/);
});
