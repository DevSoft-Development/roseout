export type LocationScoreFields = {
  theouthaven_score?: number | null;
  // Legacy DB column kept for compatibility; do not expose publicly.
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

export function getSearchRankingScore(location: any) {
  return (
    location?.theouthaven_score ??
    location?.quality_score ??
    location?.trend_score ??
    location?.conversion_score ??
    location?.review_score ??
    0
  );
}
