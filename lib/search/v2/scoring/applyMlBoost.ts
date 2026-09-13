import { ML_SCORE_VERSION } from "../../../ml/locationRanking";
import type { EnterpriseLocation } from "../../enterprise/types";

export function applyMlBoost(location: EnterpriseLocation, enabled: boolean) {
  const score = typeof location.ml_score === "number" ? location.ml_score : null;
  return {
    score,
    boost: 0,
    modelVersion: enabled ? ML_SCORE_VERSION : null,
  };
}
