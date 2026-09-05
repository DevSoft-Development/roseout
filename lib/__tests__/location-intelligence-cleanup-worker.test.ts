import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cleanupWorker = readFileSync("lib/location-intelligence/cleanupWorker.ts", "utf8");
const cleanupRoute = readFileSync("app/api/cron/location-intelligence-cleanup/route.ts", "utf8");
const cleanupWorkflow = readFileSync(".github/workflows/aws-location-intelligence-cleanup-canary.yml", "utf8");
const dedupeClassifier = readFileSync("lib/location-intelligence/dedupeClassifier.ts", "utf8");
const dedupeRoute = readFileSync("app/api/cron/location-intelligence-dedupe-classifier/route.ts", "utf8");
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

  it("rebuilds the existing search profile and rechecks location plus dedupe immediately before publishing", () => {
    expect(cleanupWorker).toContain("refreshLocationSearchProfile");
    expect(cleanupWorker).toContain("location_intelligence_cleanup_pre_publish");
    expect(cleanupWorker).toContain("search_profile_needs_review");
    expect(cleanupWorker).toContain("unsupported_non_outing");
    expect(cleanupWorker).toContain("const initialDedupe = await verifyConservativeUnique(candidate)");
    expect(cleanupWorker).toContain("const current = await readCandidate(candidate.id)");
    expect(cleanupWorker).toContain("const recheckBlockers = publishReadyCleanupBlockers(current)");
    expect(cleanupWorker).toContain("const finalDedupe = await verifyConservativeUnique(current)");
    expect(cleanupWorker).toContain("googleCallsPerformed: 0");
  });

  it("suppresses only the non-searchable pre-publish profile conflict after live eligibility checks", () => {
    expect(cleanupWorker).toContain('PRE_PUBLISH_SUPPRESSED_REVIEW_REASON = "hidden_inactive_eligibility_conflict"');
    expect(cleanupWorker).toContain("reasons.every((reason) => reason === PRE_PUBLISH_SUPPRESSED_REVIEW_REASON)");
    expect(cleanupWorker).toContain('blockers.push("hidden")');
    expect(cleanupWorker).toContain('blockers.push("inactive")');
    expect(cleanupWorker).toContain('blockers.push("low_level")');
  });

  it("moves real profile and dedupe blockers out of the retryable unique queue", () => {
    expect(cleanupWorker).toContain("routeUniqueCandidateToReview");
    expect(cleanupWorker).toContain("markProfileReviewRequired");
    expect(cleanupWorker).toContain('quality_status: "needs_review"');
    expect(cleanupWorker).toContain('data_status: "needs_review"');
    expect(cleanupWorker).toContain("dispositionedToReview");
    expect(dedupeClassifier).toContain("routeUniqueCandidateToReview");
    expect(dedupeClassifier).toContain('duplicate_status: "possible_duplicate"');
    expect(dedupeClassifier).toContain('verification.decision === "review_pending"');
    expect(dedupeClassifier).toContain("await hasPendingReview(candidate.id)");
    expect(dedupeClassifier).toContain("await ensurePendingReview(candidate, verification)");
  });

  it("caps the cleanup canary at twenty-five and requires the private AWS background runtime", () => {
    expect(cleanupWorker).toContain("const DEFAULT_BATCH_LIMIT = 25");
    expect(cleanupWorker).toContain("const MAX_BATCH_LIMIT = 25");
    expect(cleanupRoute).toContain('provider === "aws-background"');
    expect(cleanupRoute).toContain('internal === "managed-dispatch"');
    expect(cleanupRoute).toContain("Math.min(25");
  });

  it("keeps the cleanup target unscheduled and non-manual", () => {
    const job = cronRegistry.find((entry) => entry.jobKey === "location-intelligence-cleanup-worker");
    expect(job).toMatchObject({
      targetPath: "/api/cron/location-intelligence-cleanup?limit=25",
      delivery: "managed",
      manuallyRunnable: false,
    });
  });

  it("keeps cleanup publication explicit-only during the guarded rollout", () => {
    expect(catalogRoute).not.toContain("processPublishReadyCleanupCanary");
    expect(catalogRoute).not.toContain("locationIntelligenceCleanup");
    expect(backgroundWorker).not.toContain("LOCATION_INTELLIGENCE_CLEANUP_TARGET");
    expect(backgroundWorker).not.toContain('parsed_body.get("locationIntelligenceCleanup")');
    expect(backgroundWorker).toContain("Location Intelligence cleanup is intentionally absent");
    expect(cleanupWorkflow).toContain("if: github.event_name == 'workflow_dispatch'");
    expect(cleanupWorkflow).toContain("merge/push validates but does not publish");
  });
});

describe("AWS Location Intelligence dedupe classifier", () => {
  it("requires conservative identity proof and never auto-merges", () => {
    expect(dedupeClassifier).toContain('return "review_missing_google_place_id"');
    expect(dedupeClassifier).toContain('return "review_pending"');
    expect(dedupeClassifier).toContain('return "review_exact_collision"');
    expect(dedupeClassifier).toContain('return "review_shared_phone"');
    expect(dedupeClassifier).toContain('return "auto_unique"');
    expect(dedupeClassifier).toContain("sharedNormalizedPhone");
    expect(dedupeClassifier).toContain("const reverified = await verifyConservativeUnique(candidate)");
    expect(dedupeClassifier).toContain("destructiveMergesPerformed: 0");
    expect(dedupeClassifier).toContain("googleCallsPerformed: 0");
  });

  it("honors explicit not-duplicate pair decisions but keeps searching for other live collisions", () => {
    expect(dedupeClassifier).toContain("pairWasExplicitlyNotDuplicate");
    expect(dedupeClassifier).toContain('=== "not_duplicate"');
    expect(dedupeClassifier).toContain("firstActionableCollision");
    expect(dedupeClassifier).toContain("if (await pairWasExplicitlyNotDuplicate(candidate.id, matchLocationId)) continue");
    expect(dedupeClassifier).toContain("Only status=not_duplicate is suppressive; pending/merged/ignored decisions");
    expect(dedupeClassifier).toContain("return firstActionableCollision(candidate");
  });

  it("terminally dispositions prior merged or ignored conflicts without reopening audit history", () => {
    expect(dedupeClassifier).toContain('priorDecision === "merged" || priorDecision === "ignored"');
    expect(dedupeClassifier).toContain("location_intelligence_prior_${priorDecision}_collision");
    expect(dedupeClassifier).toContain("priorDecisionConflict");
    expect(dedupeClassifier).toContain("priorDecisionConflicts:");
    expect(dedupeClassifier).toContain("The pair cannot be reopened because the review table is unique per pair");
  });

  it("only changes unknown publish-ready non-searchable rows to unique or actionable review", () => {
    expect(dedupeClassifier).toContain('.eq("quality_status", "publish_ready")');
    expect(dedupeClassifier).toContain('.eq("is_searchable", false)');
    expect(dedupeClassifier).toContain('.eq("duplicate_status", "unknown")');
    expect(dedupeClassifier).toContain('duplicate_status: "unique"');
    expect(dedupeClassifier).toContain('duplicate_status: "possible_duplicate"');
    expect(dedupeClassifier).toContain('type ReviewSourceStatus = "unknown" | "unique"');
    expect(dedupeClassifier).toContain('.eq("duplicate_status", expectedStatus)');
    expect(dedupeClassifier).toContain("routeUnknownCandidateToReview");
    expect(dedupeClassifier).toContain("reviewDispositioned");
    expect(dedupeClassifier).toContain("last_deduped_at: now");
    expect(dedupeClassifier).not.toContain('duplicate_status: "duplicate"');
    expect(dedupeClassifier).not.toContain("duplicate_of:");
  });

  it("requires pending-review proof before moving normal unknown or unique rows into review state", () => {
    expect(dedupeClassifier).toContain("routeCandidateToReview");
    expect(dedupeClassifier).toContain("await hasPendingReview(candidate.id)");
    expect(dedupeClassifier).toContain("await ensurePendingReview(candidate, verification)");
    expect(dedupeClassifier).toContain("if (!reviewReady && verification.matchLocationId");
    expect(dedupeClassifier).toContain("if (!reviewReady) return { routed: false, reviewQueued, priorDecisionConflict: false }");
  });

  it("is AWS-background-only, capped at fifty, managed, non-manual, and unscheduled", () => {
    expect(dedupeClassifier).toContain("const MAX_BATCH_LIMIT = 50");
    expect(dedupeRoute).toContain('provider === "aws-background"');
    expect(dedupeRoute).toContain('internal === "managed-dispatch"');
    expect(dedupeRoute).toContain("Number(raw || 50)");
    expect(dedupeRoute).toContain("Math.min(50");
    const job = cronRegistry.find((entry) => entry.jobKey === "location-intelligence-dedupe-classifier");
    expect(job).toMatchObject({
      targetPath: "/api/cron/location-intelligence-dedupe-classifier?limit=50",
      delivery: "managed",
      manuallyRunnable: false,
    });
  });
});
