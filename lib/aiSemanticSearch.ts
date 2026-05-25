export const SEMANTIC_SEARCH_VERSION = "v2";

export function semanticScoreBoost(_item?: any, _semanticResults?: any) {
  const semanticResults = Array.isArray(_semanticResults) ? _semanticResults : [];
  const itemId = String(_item?.id || "");
  const semanticMatch = semanticResults.find((entry) => String(entry?.id || "") === itemId);
  const similarity = Number(
    semanticMatch?.semantic_similarity ??
      semanticMatch?.similarity ??
      _item?.semantic_similarity ??
      0
  );
  const boost = similarity > 0 ? Math.round(similarity * 220) : 0;

  return {
    semantic_similarity: similarity,
    semantic_score_boost: Number(semanticMatch?.semantic_score_boost ?? _item?.semantic_score_boost ?? boost),
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
