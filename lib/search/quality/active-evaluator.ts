import { createSearchQualityEvaluator } from "./evaluator";
import { evaluateAudienceIntentRules } from "./rules/audience-intent";
import { evaluateDomainGeoPairingRules } from "./rules/domain-geo-pairing";

export const evaluateSearchQuality = createSearchQualityEvaluator([
  evaluateAudienceIntentRules,
  evaluateDomainGeoPairingRules,
]);
