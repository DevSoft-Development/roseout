import { calculateMlBoost, ML_SCORE_VERSION } from "../../../ml/locationRanking";
import type { EnterpriseLocation } from "../../enterprise/types";
export function applyMlBoost(location:EnterpriseLocation,enabled:boolean){const score=typeof location.ml_score==="number"?location.ml_score:null;const boost=enabled?Math.min(10,calculateMlBoost(score)):0;return{score,boost,modelVersion:enabled?ML_SCORE_VERSION:null};}
