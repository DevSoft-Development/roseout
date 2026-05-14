export const SEMANTIC_SEARCH_VERSION = "v1";

export function semanticScoreBoost(_item?: any, _semanticResults?: any) {
  return {
    semantic_similarity: Number(_item?.semantic_similarity || 0),
    semantic_score_boost: Number(_item?.semantic_score_boost || 0),
  };
}

export function confidenceFromScores(item: any) {
  const score = Number(item.smart_match_score || 0);
  const similarity = Number(item.semantic_similarity || 0);

  if (similarity >= 0.78 || score >= 800) {
    return {
      confidence: 0.95,
      confidence_label: "high",
    };
  }

  if (similarity >= 0.68 || score >= 500) {
    return {
      confidence: 0.75,
      confidence_label: "medium",
    };
  }

  return {
    confidence: 0.45,
    confidence_label: "low",
  };
}