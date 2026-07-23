import type { PublicLocationRecord } from "./public-classification";

export type ScoreConfidence = "verified" | "provisional" | "insufficient_data";
const num = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : null;

export function getScoreConfidence(location: PublicLocationRecord): { confidence: ScoreConfidence; publicScore: number | null; reason: string } {
  const score = num(location.theouthaven_score ?? location.score ?? location.quality_score);
  const rating = num(location.rating);
  const reviews = num(location.review_count ?? location.total_reviews);
  const engagement = [location.views_count, location.saves_count, location.reservation_count].map(num).filter((x): x is number => x != null).reduce((a, b) => a + b, 0);
  if (score == null || score >= 98 || score <= 0) return { confidence: "insufficient_data", publicScore: null, reason: "No reliable non-placeholder score." };
  if (rating != null && reviews != null && reviews >= 25 && engagement >= 5) return { confidence: "verified", publicScore: Math.round(score), reason: "Supported by rating, reviews, and engagement." };
  if (rating != null && reviews != null && reviews >= 10) return { confidence: "provisional", publicScore: null, reason: "Useful signals exist, but confidence is low." };
  return { confidence: "insufficient_data", publicScore: null, reason: "Insufficient supporting public signals." };
}

export function getRatingDisplay(location: PublicLocationRecord) {
  const rating = num(location.rating);
  const reviews = num(location.review_count ?? location.total_reviews);
  if (rating == null || rating <= 0 || reviews == null || reviews <= 0) return null;
  return `${rating.toFixed(1)} (${Math.round(reviews).toLocaleString()} reviews)`;
}

export function getPublicTrustBadges(location: PublicLocationRecord): string[] {
  const rating = num(location.rating), reviews = num(location.review_count ?? location.total_reviews), saves = num(location.saves_count), reservations = num(location.reservation_count);
  const badges: string[] = [];
  if (rating != null && rating >= 4.5 && reviews != null && reviews >= 25) badges.push("Highly rated");
  if (reviews != null && reviews >= 100) badges.push("Popular nearby");
  if (reservations != null && reservations > 0) badges.push("Reservations available");
  if (saves != null && saves >= 10) badges.push("Trending");
  if (location.featured === true || location.is_featured === true) badges.push("Verified location");
  return Array.from(new Set(badges)).slice(0, 2);
}
