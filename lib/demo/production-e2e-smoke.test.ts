import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

test("Lounge smoke runner exercises the five real production routes", () => {
  const source = read("app/api/admin/demo/theouthaven-lounge/e2e-smoke/route.ts");

  assert.match(source, /getInternalDemoViewer/);
  assert.match(source, /MIRROR_DEMO_KEY/);
  assert.match(source, /is_hidden === true/);
  assert.match(source, /is_searchable !== true/);
  assert.match(source, /demo_visible_publicly !== true/);
  assert.match(source, /publish_ready !== true/);

  assert.match(source, /\/api\/business\/messaging\/campaigns/);
  assert.match(source, /\/api\/business\/notifications/);
  assert.match(source, /\/api\/feedback/);
  assert.match(source, /\/api\/offers\/\$\{activeOffer\.id\}\/claim/);
  assert.match(source, /\/q\/\$\{encodeURIComponent\(qr\.code\)\}/);

  assert.match(source, /recipient_count/);
  assert.match(source, /never_send/);
  assert.match(source, /outing_visit_verifications/);
  assert.match(source, /location_offer_claims|claimId/);
  assert.match(source, /location_qr_scan_events/);
});

test("public feedback and offer routes only bypass Turnstile for strict internal demo access", () => {
  for (const file of [
    "app/api/feedback/route.ts",
    "app/api/offers/[id]/claim/route.ts",
  ]) {
    const source = read(file);
    assert.match(source, /getInternalDemoLocationAccess/);
    assert.match(source, /if \(!internalDemoAccess\) \{/);
    assert.match(source, /requireTurnstile/);
  }
});

test("Lounge launcher exposes the guarded production smoke control", () => {
  const page = read("app/internal/demo/theouthaven-lounge/page.tsx");
  const button = read("app/internal/demo/theouthaven-lounge/DemoE2ESmokeButton.tsx");

  assert.match(page, /DemoE2ESmokeButton/);
  assert.match(button, /Run production E2E smoke/);
  assert.match(button, /Passed \$\{passed\}\/5 production write flows/);
  assert.match(button, /messaging, notifications, check-in, offer claim, and QR scan/i);
});
