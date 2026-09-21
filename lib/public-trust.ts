import type { PublicLocationRecord } from "./public-classification";

export type ScoreConfidence = "verified" | "provisional" | "insufficient_data";
export type PublicVerificationState = {
  verified: boolean;
  claimed: boolean;
  checkedAt: string | null;
  freshness: "recent" | "stale" | "unknown";
  freshnessLabel: string | null;
};
const num = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : null;

function normalizedStatus(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function publicCheckedAt(location: PublicLocationRecord) {
  for (const value of [
    location.last_quality_check_at,
    location.verified_at,
    location.quality_checked_at,
    location.last_verified_at,
  ]) {
    if (typeof value !== "string" || !value.trim()) continue;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

export function getPublicVerificationState(
  location: PublicLocationRecord,
  now: Date = new Date(),
): PublicVerificationState {
  const verificationStatus = normalizedStatus(location.verification_status ?? location.business_verification_status);
  const claimStatus = normalizedStatus(location.claim_status ?? location.claimStatus);
  const verified = location.is_verified === true || verificationStatus === "verified";
  const claimed = location.is_claimed === true || ["claimed", "approved", "verified", "active"].includes(claimStatus);
  const checked = publicCheckedAt(location);
  if (!checked) return { verified, claimed, checkedAt: null, freshness: "unknown", freshnessLabel: null };

  const ageMs = Math.max(0, now.getTime() - checked.getTime());
  const recent = ageMs <= 30 * 24 * 60 * 60 * 1000;
  const labelDate = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: checked.getUTCFullYear() === now.getUTCFullYear() ? undefined : "numeric",
    timeZone: "UTC",
  }).format(checked);

  return {
    verified,
    claimed,
    checkedAt: checked.toISOString(),
    freshness: recent ? "recent" : "stale",
    freshnessLabel: `${recent ? "Recently checked" : "Last checked"} ${labelDate}`,
  };
}

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
  const verification = getPublicVerificationState(location);
  const badges: string[] = [];
  if (verification.verified) badges.push("Verified business");
  if (verification.claimed) badges.push("Owner claimed");
  if (rating != null && rating >= 4.5 && reviews != null && reviews >= 25) badges.push("Highly rated");
  if (reviews != null && reviews >= 100) badges.push("Popular nearby");
  if (reservations != null && reservations > 0) badges.push("Reservations available");
  if (saves != null && saves >= 10) badges.push("Trending");
  return Array.from(new Set(badges)).slice(0, 2);
}
