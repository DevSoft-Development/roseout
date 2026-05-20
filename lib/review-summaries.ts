export type ApprovedReview = {
  approved: boolean;
  rating: number;
  text: string;
};

export type ReviewSummary = {
  sentiment: "positive" | "neutral" | "mixed";
  highlights: string[];
  summary: string;
};

const KEYWORDS = ["music", "atmosphere", "romantic", "groups", "celebrations", "service", "rooftop"];

export function buildReviewSummary(reviews: ApprovedReview[]): ReviewSummary {
  const approved = reviews.filter((review) => review.approved);
  const text = approved.map((review) => review.text.toLowerCase()).join(" ");
  const avgRating = approved.reduce((sum, review) => sum + review.rating, 0) / Math.max(approved.length, 1);

  const highlights = KEYWORDS.filter((keyword) => text.includes(keyword));
  const sentiment: ReviewSummary["sentiment"] = avgRating >= 4.2 ? "positive" : avgRating >= 3.3 ? "neutral" : "mixed";

  const summary =
    sentiment === "positive"
      ? `Guests love ${highlights.slice(0, 2).join(" and ") || "the overall experience"}. Popular for ${highlights.includes("romantic") ? "romantic dinners" : "memorable outings"}.`
      : sentiment === "neutral"
        ? "Guests mention solid value with room for consistency in service and atmosphere."
        : "Reviews are mixed, with strengths in select experiences and recurring consistency concerns.";

  return { sentiment, highlights, summary };
}
