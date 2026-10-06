import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const queueGuard = readFileSync(
  new URL("../../supabase/migrations/20260909141000_reservation_discovery_queue_guard.sql", import.meta.url),
  "utf8",
);
const recovery = readFileSync(
  new URL("../../supabase/functions/reservation-recovery/index.ts", import.meta.url),
  "utf8",
);
const curatedPublisher = readFileSync(
  new URL("../location-growth/googleCuratedPublisher.ts", import.meta.url),
  "utf8",
);
const sweepWorkflow = readFileSync(
  new URL("../../.github/workflows/aws-reservation-recovery-sweep.yml", import.meta.url),
  "utf8",
);
const edgeTemplate = readFileSync(
  new URL("../../infra/aws/cloudformation/edge-runtime.yml", import.meta.url),
  "utf8",
);

test("every eligible catalog insertion is queued for reservation discovery", () => {
  assert.match(queueGuard, /before insert or update of website/i);
  assert.match(queueGuard, /new\.reservation_discovery_next_retry_at := now\(\)/);
  assert.match(queueGuard, /new\.reservation_discovery_status := ''/);
  assert.match(queueGuard, /future importers cannot bypass discovery/i);
});

test("manual/internal reservation choices and known links remain protected", () => {
  assert.match(queueGuard, /reservation_manual_override/);
  assert.match(queueGuard, /uses_internal_reservations/);
  assert.match(queueGuard, /internal_reservations_enabled/);
  assert.match(queueGuard, /has_reservation_link/);
});

test("the recovery worker accepts queued unchecked rows without Google calls", () => {
  assert.match(recovery, /new Set\(\["", "not_found", "failed", "blocked", "no_website"\]\)/);
  assert.match(recovery, /googleCalls: 0/);
  assert.match(recovery, /reservation_discovery_next_retry_at/);
});

test("curated Google publishing still performs immediate reservation enrichment", () => {
  assert.match(curatedPublisher, /enrichPublishedReservations/);
  assert.match(curatedPublisher, /discoverReservationFromWebsite/);
  assert.match(curatedPublisher, /discoverReservationViaProviderSearch/);
});


test("rendered reservation fallback stays tightly bounded", () => {
  assert.match(recovery, /renderedFallbackLimit/);
  assert.match(recovery, /Math\.min\(5,/);
  assert.match(recovery, /reservation_only_rendered_website_crawl/);
  assert.match(sweepWorkflow, /"renderedFallback":true/);
  assert.match(sweepWorkflow, /"renderedFallbackLimit":3/);
  assert.match(edgeTemplate, /ReservedConcurrentExecutions:\s*2/);
  assert.match(edgeTemplate, /RESERVATION_RENDERER_FUNCTION_NAME/);
});
