import { createSearchQualityEvaluator } from "./evaluator";
import { evaluateAudienceIntentRules } from "./rules/audience-intent";

export const evaluateSearchQuality = createSearchQualityEvaluator([
  evaluateAudienceIntentRules,
]);
