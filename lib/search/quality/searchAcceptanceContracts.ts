import {
  SEARCH_CONTRACT_VERSION,
  deriveInventoryGapStatus,
  isGeographicLandmark,
  validateModeAgainstQuery,
} from "@/lib/search/contracts/searchContract";
import { classifyMixedSearchFailure } from "@/lib/search/quality/classifyMixedSearchFailure";

export type SearchAcceptanceStatus = "pass" | "fail" | "not_applicable";
export type SearchAcceptanceContract = { status: SearchAcceptanceStatus; passed: boolean; reason: string; evidence: Record<string, unknown> };
export type SearchAcceptanceMatrix = {
  version: string;
  intent: SearchAcceptanceContract;
  geoAnchor: SearchAcceptanceContract;
  retrieval: SearchAcceptanceContract;
  pairing: SearchAcceptanceContract;
  qa: SearchAcceptanceContract;
  diagnosis: ReturnType<typeof classifyMixedSearchFailure>;
  testPassed: boolean;
};

const EXPECTED_EMPTY_OUTCOMES = new Set(["expected_constraint_no_pair", "clarification_required", "anchor_not_found", "confirmed_inventory_gap", "no_compatible_pair"]);
const asArray = (value: unknown): any[] => Array.isArray(value) ? value : [];
const bool = (value: unknown) => value === true;
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;
const count = (value: unknown) => value != null && Number.isFinite(Number(value)) ? Number(value) : 0;
const pass = (reason: string, evidence: Record<string, unknown> = {}): SearchAcceptanceContract => ({ status: "pass", passed: true, reason, evidence });
const fail = (reason: string, evidence: Record<string, unknown> = {}): SearchAcceptanceContract => ({ status: "fail", passed: false, reason, evidence });
const notApplicable = (reason: string, evidence: Record<string, unknown> = {}): SearchAcceptanceContract => ({ status: "not_applicable", passed: true, reason, evidence });

export function evaluateSearchAcceptanceContracts(args: {
  result: any;
  errors?: string[];
  warnings?: string[];
  counts: { restaurants: number; activities: number; pairs: number; displayed: number; pairRestaurants?: number; pairActivities?: number };
}): SearchAcceptanceMatrix {
  const { result, counts } = args;
  const errors = args.errors ?? [];
  const warnings = args.warnings ?? [];
  const debug = result?.debug ?? result?.diagnostics?.debug ?? result?.searchV2?.debug ?? {};
  const plan = result?.searchV2?.searchPlan ?? result?.searchPlan ?? {};
  const intent = result?.parsedIntent ?? debug?.normalizedIntent ?? plan ?? {};
  const query = String(result?.query ?? plan?.rawQuery ?? "");
  const rawOutcome = text(result?.searchV2?.outcome ?? result?.outcome ?? debug?.outcome ?? debug?.terminalOutcome);
  const anchor = result?.searchV2?.anchorResolution ?? result?.anchorResolution ?? debug?.anchorResolution ?? null;
  const inventoryAudit = debug?.inventoryAudit ?? result?.searchV2?.debug?.inventoryAudit ?? null;
  const pairingDebug = debug?.pairingDebug ?? result?.searchV2?.debug?.pairingDebug ?? null;
  const candidateStages = debug?.candidateStages ?? result?.searchV2?.debug?.candidateStages ?? null;
  const needsRestaurant = bool(intent?.needsRestaurant ?? intent?.restaurant?.required);
  const needsActivity = bool(intent?.needsActivity ?? intent?.activity?.required);
  const mixed = needsRestaurant && needsActivity;
  const mode = text(result?.searchV2?.requestedMode ?? plan?.mode ?? intent?.searchType ?? intent?.search_type);
  const activityTerms = asArray(debug?.activityTerms ?? intent?.activity?.categories ?? intent?.activityIntent?.activityTerms);
  const restaurantTerms = asArray(debug?.restaurantTerms ?? [
    ...asArray(intent?.restaurant?.cuisines), ...asArray(intent?.restaurant?.foods), ...asArray(intent?.restaurant?.features),
    ...asArray(intent?.restaurantIntent?.cuisineTerms), ...asArray(intent?.restaurantIntent?.foodTerms),
  ]);
  const fallbackPairCount = count(result?.fallback_pair_count ?? debug?.fallbackPairCount);
  const sameVenueEvidence = bool(debug?.sameVenueContract?.verifiedDualRoleMatch ?? result?.searchV2?.sameVenueContract?.verifiedDualRoleMatch);
  const modeContract = validateModeAgainstQuery({ query, mode, needsRestaurant, needsActivity, sameVenueEvidence, fallbackPairCount });

  const intentContract = !modeContract.valid
    ? fail(modeContract.reason, { query, mode, needsRestaurant, needsActivity, restaurantTerms, activityTerms, sameVenueEvidence, fallbackPairCount })
    : pass("Query domains, normalized clauses, and result mode agree.", { query, mode, needsRestaurant, needsActivity, restaurantTerms, activityTerms, sameVenueEvidence, fallbackPairCount });

  const anchorRequested = bool(plan?.anchor?.requested ?? result?.searchV2?.anchor?.requested ?? result?.anchor?.requested);
  const anchorStatus = text(anchor?.status);
  const anchorText = text(plan?.anchor?.text ?? plan?.anchor?.raw ?? debug?.anchorPolicy?.anchorText);
  const anchorEntityType = text(plan?.anchor?.entityType ?? debug?.anchorPolicy?.entityType);
  const genericAnchor = bool(plan?.anchor?.generic ?? debug?.anchorPolicy?.generic);
  const exactNameRequired = bool(plan?.anchor?.exactNameRequired ?? debug?.anchorPolicy?.exactNameRequired);
  const landmarkMisclassified = anchorRequested && isGeographicLandmark(anchorText);
  let geoAnchorContract: SearchAcceptanceContract;
  if (landmarkMisclassified) {
    geoAnchorContract = fail("A known geographic landmark entered venue-anchor resolution instead of geographic context.", { anchorText, anchorEntityType, anchorStatus });
  } else if (!anchorRequested) {
    geoAnchorContract = pass("No venue anchor was requested; locality is handled as geography.", { anchorRequested, anchorEntityType });
  } else if (genericAnchor && !["resolved", "clarification_required"].includes(anchorStatus ?? "")) {
    geoAnchorContract = fail("A generic anchor must resolve uniquely or request clarification.", { anchorStatus, genericAnchor, anchorEntityType });
  } else if (exactNameRequired && anchorStatus === "clarification_required" && count(debug?.anchorPolicy?.exactCandidateCount) === 0) {
    geoAnchorContract = fail("Fuzzy-only candidates cannot satisfy an exact named-place request.", { anchorStatus, exactNameRequired, exactCandidateCount: debug?.anchorPolicy?.exactCandidateCount ?? null });
  } else if (["street", "intersection", "transit_stop", "landmark"].includes(anchorEntityType ?? "") && anchorRequested) {
    geoAnchorContract = fail("Geographic entities must not enter named venue-anchor resolution.", { anchorEntityType, anchorRequested });
  } else {
    geoAnchorContract = pass("Geography and anchor policy produced a valid terminal state.", { anchorStatus, anchorEntityType, genericAnchor, exactNameRequired });
  }

  const restaurantEligible = Math.max(counts.restaurants, counts.pairRestaurants ?? 0);
  const activityEligible = Math.max(counts.activities, counts.pairActivities ?? 0);
  const rawRestaurantCandidates = count(debug?.rawRestaurantCandidateCount ?? candidateStages?.restaurant?.rawCount ?? candidateStages?.restaurantCandidates ?? candidateStages?.finalRestaurantCandidates);
  const rawActivityCandidates = count(debug?.rawActivityCandidateCount ?? candidateStages?.activity?.rawCount ?? candidateStages?.activityCandidates ?? candidateStages?.finalActivityCandidates);
  const restaurantRejected = count(candidateStages?.restaurant?.rejectedCount);
  const activityRejected = count(candidateStages?.activity?.rejectedCount);
  const diagnosis = classifyMixedSearchFailure({
    mixedRequired: mixed,
    restaurantCount: restaurantEligible,
    activityCount: activityEligible,
    pairCount: counts.pairs,
    rawRestaurantCandidateCount: rawRestaurantCandidates,
    rawActivityCandidateCount: rawActivityCandidates,
    restaurantRejectedCount: restaurantRejected,
    activityRejectedCount: activityRejected,
    primaryFailure: pairingDebug?.primaryFailure ?? null,
    restaurantAuditStatus: inventoryAudit?.restaurant?.status ?? null,
    activityAuditStatus: inventoryAudit?.activity?.status ?? null,
  });
  const outcome = rawOutcome ?? diagnosis.terminalOutcome;
  const missingRestaurant = needsRestaurant && restaurantEligible === 0;
  const missingActivity = needsActivity && activityEligible === 0;
  const restaurantGap = deriveInventoryGapStatus({
    required: needsRestaurant,
    eligibleCount: restaurantEligible,
    rawCandidateCount: rawRestaurantCandidates,
    rejectedCount: restaurantRejected,
    auditStatus: inventoryAudit?.restaurant?.status ?? inventoryAudit?.status,
    failureReason: pairingDebug?.primaryFailure ?? null,
  });
  const activityGap = deriveInventoryGapStatus({
    required: needsActivity,
    eligibleCount: activityEligible,
    rawCandidateCount: rawActivityCandidates,
    rejectedCount: activityRejected,
    auditStatus: inventoryAudit?.activity?.status ?? inventoryAudit?.status,
    failureReason: pairingDebug?.primaryFailure ?? null,
  });
  const classifiedGap = diagnosis.inventoryIssue || diagnosis.evidenceIssue;
  const unresolvedGap = !classifiedGap && ([restaurantGap, activityGap].includes("inconclusive") || [restaurantGap, activityGap].includes("retrieval_or_eligibility_failure"));
  const retrievalContract = !missingRestaurant && !missingActivity
    ? pass("Every required retrieval lane produced eligible candidates or contributed to a result.", { restaurantEligible, activityEligible, restaurantGap, activityGap, diagnosis })
    : unresolvedGap
      ? fail("A required retrieval lane is empty without a confirmed inventory or evidence-gap classification.", { missingRestaurant, missingActivity, restaurantGap, activityGap, diagnosis, primaryFailure: pairingDebug?.primaryFailure ?? null })
      : pass(diagnosis.evidenceIssue ? "The empty required lane is truthfully classified as an evidence-quality gap." : "The empty required lane is truthfully classified as an inventory gap.", { missingRestaurant, missingActivity, restaurantGap, activityGap, diagnosis });

  let pairingContract: SearchAcceptanceContract;
  if (!mixed) pairingContract = notApplicable("The search does not require both domains.", { mixed });
  else if (counts.pairs > 0 && pairingDebug?.eligibilityContractValid === false) pairingContract = fail("Rendered pairs do not match the validated eligible-pair set.", { violation: pairingDebug?.eligibilityContractViolation ?? null });
  else if (counts.pairs > 0) pairingContract = pass("Rendered pairs survived travel, role, and eligibility constraints.", { pairCount: counts.pairs, pairRestaurants: counts.pairRestaurants ?? null, pairActivities: counts.pairActivities ?? null });
  else if (diagnosis.terminalOutcome) pairingContract = pass(diagnosis.reason, { diagnosis, primaryFailure: pairingDebug?.primaryFailure ?? null });
  else pairingContract = fail("A mixed request produced no valid pair and no truthful terminal outcome.", { outcome, diagnosis, primaryFailure: pairingDebug?.primaryFailure ?? null, restaurantGap, activityGap });

  const expectedOutcome = Boolean(outcome && EXPECTED_EMPTY_OUTCOMES.has(outcome));
  const runtimeSucceeded = errors.length === 0;
  const rawRequestFulfilled = Boolean(result?.requestFulfilled ?? result?.searchV2?.requestFulfilled ?? result?.success ?? result?.searchV2?.success);
  const requestFulfilled = diagnosis.classification === "none" ? rawRequestFulfilled : diagnosis.requestFulfilled;
  const qaPassed = runtimeSucceeded && (expectedOutcome || requestFulfilled) && intentContract.passed && geoAnchorContract.passed && retrievalContract.passed && pairingContract.passed;
  const qaContract = qaPassed
    ? pass(expectedOutcome ? "The expected terminal outcome is valid without claiming fulfillment." : "The request was fulfilled and all system contracts passed.", { expectedOutcome, outcome, requestFulfilled, runtimeSucceeded, warnings, diagnosis })
    : fail("The request did not satisfy every system contract.", { expectedOutcome, outcome, requestFulfilled, runtimeSucceeded, warnings, errors, diagnosis });

  return { version: SEARCH_CONTRACT_VERSION, intent: intentContract, geoAnchor: geoAnchorContract, retrieval: retrievalContract, pairing: pairingContract, qa: qaContract, diagnosis, testPassed: qaContract.passed };
}
