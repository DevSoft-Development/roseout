export type LocationScoreFields = {
  theouthaven_score?: number | null;
  roseout_score?: number | null;
  quality_score?: number | null;
  trend_score?: number | null;
  conversion_score?: number | null;
  review_score?: number | null;
  popularity_score?: number | null;
  ranking_badge?: string | null;
};

export function getLocationScore(location: any) {
  return (
    location?.theouthaven_score ??
    location?.quality_score ??
    location?.roseout_score ??
    0
  );
}

export function getRankingBadge(location: any) {
  return location?.ranking_badge || null;
}

function toScoreNumber(value: unknown) {
  const score = Number(value ?? 0);
  return Number.isFinite(score) ? score : 0;
}

export function getSearchRankingScore(location: any) {
  return (
    toScoreNumber(location?.theouthaven_score) * 0.35 +
    toScoreNumber(location?.quality_score) * 0.2 +
    toScoreNumber(location?.trend_score) * 0.15 +
    toScoreNumber(location?.conversion_score) * 0.15 +
    toScoreNumber(location?.review_score) * 0.15
  );
}

export const LOCATION_SCORE_SELECT_FIELDS =
  "theouthaven_score, roseout_score, quality_score, trend_score, conversion_score, review_score, popularity_score, ranking_badge";
