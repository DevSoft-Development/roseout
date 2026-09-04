import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cleanupWorker = readFileSync("lib/location-intelligence/cleanupWorker.ts", "utf8");
const cleanupRoute = readFileSync("app/api/cron/location-intelligence-cleanup/route.ts", "utf8");
const catalogRoute = readFileSync("app/api/cron/catalog-enrichment-runner/route.ts", "utf8");
const backgroundWorker = readFileSync("infra/aws/lambda/background_cron_worker.py", "utf8");
const cronRegistry = JSON.parse(readFileSync("config/cron-jobs.json", "utf8")) as Array<Record<string, unknown>>;

describe("AWS Location Intelligence cleanup worker", () => {
  it("only selects already dedupe-resolved publish-ready locations for the canary", () => {
    expect(cleanupWorker).toContain('.eq("quality_status", "publish_ready")');
    expect(cleanupWorker).toContain('.eq("is_searchable", false)');
    expect(cleanupWorker).toContain('.eq("duplicate_status", "unique")');
    expect(cleanupWorker).toContain('.eq("is_hidden", false)');
    expect(cleanupWorker).toContain('.eq("active", true)');
    expect(cleanupWorker).toContain('.eq("is_low_level", false)');
    expect(cleanupWorker).toContain('.is("duplicate_of", null)');
  });

  it("rebuilds the existing search profile and rechecks the location before publishing", () => {
    expect(cleanupWorker).toContain("refreshLocationSearchProfile");
    expect(cleanupWorker).toContain("location_intelligence_cleanup_pre_publish");
    expect(cleanupWorker).toContain("search_profile_needs_review");
    expect(cleanupWorker).toContain("unsupported_non_outing");
    expect(cleanupWorker).toContain("const current = await readCandidate(candidate.id)");
    expect(cleanupWorker).toContain("const recheckBlockers = publishReadyCleanupBlockers(current)");
    expect(cleanupWorker).toContain("googleCallsPerformed: 0");
  });

  it("caps the canary batch at ten and requires the private AWS background runtime", () => {
    expect(cleanupWorker).toContain("const MAX_BATCH_LIMIT = 10");
    expect(cleanupRoute).toContain('provider === "aws-background"');
    expect(cleanupRoute).toContain('internal === "managed-dispatch"');
    expect(cleanupRoute).toContain("Math.min(10");
  });

  it("keeps the cleanup target unscheduled and non-manual", () => {
    const job = cronRegistry.find((entry) => entry.jobKey === "location-intelligence-cleanup-worker");
    expect(job).toMatchObject({
      targetPath: "/api/cron/location-intelligence-cleanup?limit=10",
      delivery: "managed",
      manuallyRunnable: false,
    });
  });

  it("seeds from the existing catalog runner and switches SQS continuation to cleanup-only", () => {
    expect(catalogRoute).toContain("processPublishReadyCleanupCanary(10)");
    expect(catalogRoute).toContain("locationIntelligenceCleanup");
    expect(backgroundWorker).toContain('LOCATION_INTELLIGENCE_CLEANUP_TARGET = "/api/cron/managed?job=location-intelligence-cleanup-worker"');
    expect(backgroundWorker).toContain("cleanup = parsed_body.get(\"locationIntelligenceCleanup\")");
    expect(backgroundWorker).toContain('continuation["target"] = target');
  });
});
