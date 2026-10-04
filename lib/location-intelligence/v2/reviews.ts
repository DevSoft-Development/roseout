import "server-only";

import { reviewRefreshCadenceDays } from "@/lib/location-intelligence/v2/policy";

export function nextReviewRefreshAt(input: {
  popularityScore: number;
  lastRefreshedAt?: string | null;
}) {
  const days = reviewRefreshCadenceDays(input.popularityScore);
  if (!days) return null;
  const base = input.lastRefreshedAt ? new Date(input.lastRefreshedAt) : new Date();
  if (!Number.isFinite(base.getTime())) return null;
  return new Date(base.getTime() + days * 86_400_000).toISOString();
}

export function shouldRefreshReviews(input: {
  popularityScore: number;
  lastRefreshedAt?: string | null;
  now?: Date;
}) {
  const next = nextReviewRefreshAt(input);
  if (!next) return false;
  return new Date(next).getTime() <= (input.now || new Date()).getTime();
}
